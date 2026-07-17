# Richer Search: Market entries + Aliases — Design

**Date:** 2026-07-16
**Status:** Approved (design + open questions resolved); ready for implementation plan
**Author:** Jonas + Claude

## Problem

Global search (`pm-search.ts`, a client-side Fuse index over the committed
`search_index.json`) matches operators by their single display **name** only. Two
gaps:
1. You can't search **markets** — typing "Denver" or "Colorado" finds operators
   named that, not the Denver market page.
2. An operator is findable only by its one canonical name — not by a **DBA**
   ("Haven Residential" ⇄ "29th Street Property Management") or by a **former
   name** (so a name correction can make an operator un-findable by what people
   still call it).

## Goals (approved scope)

- **Markets in search:** cities / metros / states resolve to the market page.
- **Aliases:** operators findable by **DBA** names and **former (pre-correction)
  names** — a single unified corpus.

## Approved decisions

- **One corpus.** Search already uses a single Fuse instance across tiers; add
  **`tier: "market"`** as a fourth value (small diff) rather than renaming the
  `tier` discriminator to `kind`.
- **Aliases = DBA + former names only.** No parent-company aliases (over-match
  risk).
- **Market entitlement:** market results pass the entitlement filter like
  `canonical` (always shown). Rationale: market landing pages are public
  ([[market-entitlements]]: "public pages stay all-markets"), so hiding a
  browseable market from search would be inconsistent. (One-line change if we
  later decide to gate them.)

## Architecture

All changes are **offline index enrichment + client render** — no DB/runtime
change (same shape as Phase 2). The name data all exists at build time.

### Market entries (#1)
- `build-operator-universe.ts` emits a new `markets` array in `search_index.json`.
  Source of slugs = the builder's in-file `MARKETS` array (has `id, city, state,
  stateSlug, citySlug` for all 35); operator counts joined from
  `markets-summary.json` by `id` for the subtitle; `fullName` (e.g.
  "Chattanooga, TN-GA MSA") + bare city + **state name** become the market's own
  `aliases` so "Denver" / "Colorado" / the MSA name all match.
- Each entry: `{ tier: "market", name: "<City>, <ST>", marketId, marketCity,
  stateCode, stateSlug, citySlug, operatorCount, aliases }`.
- `pm-search.ts`: `buildHref` market branch = `/property-managers/<stateSlug>/<citySlug>`
  (the ranked href minus the trailing `/<slug>`); push `data.markets` into the
  corpus; add `market` to the union / `IndexFile` / `IndexedEntry`,
  `partitionByTier` (new bucket), `filterResultsByEntitlement` (pass like
  canonical), and `getSearchCounts`.
- UI: a **"Markets"** result group + a `market` branch in `SearchResultRow`
  (a "Market" badge + "<N> operators" subtitle, no star chip). High-intent +
  few (35), so market matches should rank at/near the top for a market-name
  query (a light ranking bias).

### Aliases (#2)
- Add an optional **`aliases: string[]`** to operator (and market) index entries;
  add `{ name: "aliases", weight: <lower than name> }` to the Fuse keys.
- **DBA aliases** (`build-operator-universe.ts`): for a ranked (single-market)
  PM, alias = `pm.canonicalOperatorName` when it differs case-insensitively from
  `pm.name` (the exact rule `toPmListItem` uses for `displayName`). For a
  canonical entry, collect member `pm.name` / `canonicalOperatorName` values that
  differ from the group's `canonicalName`. A pure helper derives these; the first
  pass already loops all pms grouped by canonical slug — the natural accumulation
  point.
- **Former names** (from corrections): `export_name_corrections.ts` also emits
  `originalName` (the DB column exists); the overlay helper
  (`applyNameCorrectionsToSearchIndex`) pushes `originalName` onto the matched
  entry's `aliases` (when it differs from the corrected name) in addition to
  setting the display name. So a corrected operator stays findable by its old
  name. (Empty until real corrections exist — verified no-op today.)
- UI: when a hit matches on an alias, `SearchResultRow` shows a small
  "also: <alias>" line under the name (nice-to-have; keep subtle).

## Testing

- **Pure helpers (node:test):** DBA-alias derivation (differs vs. casing-only vs.
  equal); the extended `search-index-corrections` former-name→aliases behavior
  (extend its existing suite).
- **Component test (Vitest — the harness just adopted in #221):**
  `SearchResultRow` renders a `market` row (badge + "<N> operators", routes to
  the market href) and an operator row with an alias "also:" line.
- Offline rebuild (Drive): regenerate `search_index.json`; confirm it now
  contains 35 `market` entries + some DBA `aliases`, and existing tiers are
  otherwise unchanged. `tsc` + `test:watch-list` + `test:components` all green.

## Rollout

Additive. `search_index.json` **does** change this time (gains market entries +
aliases) — committed from the offline rebuild. No schema/runtime change; former-
name aliases stay dormant until the first correction is exported. Refreshes on
the `build-operator-universe` rebuild / monthly refresh, same as Phase 2.
