# Phase 2 — Search-Index Name-Correction Overlay — Design

**Date:** 2026-07-16
**Status:** Approved (design); ready for implementation plan
**Author:** Jonas + Claude
**Follows:** `2026-07-16-admin-operator-name-corrections-design.md` (Phase 1)

## Problem

Phase 1 made operator display-name corrections live + durable in the DB. An
audit of the remaining surfaces showed that **PDFs, market/national briefs, and
email digests already reflect corrections** — they read the corrected DB
(`PM.name` / `PM.scorecardData` / `CanonicalOperator.canonicalName`), and
`OperatorSnapshot` carries no name. The **only** surface still showing stale
names is **global search / autocomplete / Cmd-K** (`src/lib/pm-search.ts`),
which imports the committed static `src/data/search_index.json` — a file built
offline by `scripts/build-operator-universe.ts` from the committed, uncorrected
pipeline seed (`src/data/scorecard_data.json`).

`search_index.json` cannot be regenerated on deploy (its "tracked" tier needs
the 15 GB Drive source, which Vercel can't reach), so it stays a
commit-an-artifact step.

## Goal

Make `search_index.json` reflect name corrections so a corrected operator is
both **shown and searchable** by its new name — without a full 15 GB pipeline
re-run, keeping the DB as the single source of truth.

## Non-goals

- PDFs / briefs / digests (already correct after Phase 1).
- Correcting tracked-only (sub-ranked) operators: Phase-1's admin search only
  targets ranked PMs + canonical groups, so the overlay never touches the
  tracked tier.
- Automatic refresh on deploy (infeasible — Vercel has no Drive).

## Approach

A derived, committed corrections file + an overlay in the existing offline
index builder. Mirrors the merge-tool's "DB → committed JSON → pipeline
consumes it" split; keeps `build-operator-universe.ts` DB-free.

1. **Exporter `scripts/data-pipeline/export_name_corrections.ts`** (mirrors
   `export_merge_decisions.ts`): reads `prisma.operatorNameCorrection.findMany()`
   and writes committed `src/data/name_corrections.json` =
   `{ generatedAt, corrections: [{ targetKind, targetKey, correctedName }] }`,
   sorted by `(targetKind, targetKey)` for stable diffs. Uses the ambient
   `DATABASE_URL` via `await import("../../src/lib/prisma")`, same as
   `export_merge_decisions.ts`; guarded so it only runs when invoked directly.

2. **Overlay in `scripts/build-operator-universe.ts`**: after the `out =
   { ranked, tracked, canonical }` object is assembled and before it is written,
   read `src/data/name_corrections.json` (if present) and apply corrections via a
   **pure, unit-tested helper**:
   - a `pm` correction sets the `ranked` entry whose `slug === targetKey` →
     `entry.name = correctedName`;
   - a `canonical` correction sets the `canonical` entry whose
     `canonicalSlug === targetKey` → `entry.name = correctedName`;
   - the helper returns `{ matched, unmatched }`; the builder logs both. An
     unmatched `pm` correction is EXPECTED (that operator is a grouped member,
     represented in search by its canonical entry, so it has no standalone
     `ranked` row) — logged, not an error. The `tracked` tier is never touched.

3. **Operating it (runbook):** after a batch of corrections (or as part of the
   monthly refresh), run `export_name_corrections.ts` → `build-operator-universe.ts`
   (with `IQ_DATA_DIR` set), commit `src/data/name_corrections.json` +
   `src/data/search_index.json`, deploy.

### Pure helper

`src/lib/operators/search-index-corrections.ts` — no IO, no `@/` imports (so
`build-operator-universe.ts` can import it via a relative path under tsx, same
constraint as Phase-1's `name-correction.ts`). Signature:

```
applyNameCorrectionsToSearchIndex(
  index: { ranked: {slug: string; name: string}[]; canonical: {canonicalSlug: string; name: string}[] },
  corrections: { targetKind: string; targetKey: string; correctedName: string }[]
): { matched: number; unmatched: string[] }
```

Mutates the passed `ranked`/`canonical` entries' `name` fields in place; returns
counts + the list of `targetKey`s that matched no entry.

## Ship-now state

`src/data/name_corrections.json` ships **empty** (`{ generatedAt: null,
corrections: [] }`) — no corrections exist in prod yet — so the overlay is a
verified no-op and the committed `search_index.json` is unchanged by this PR.
The exporter's first real run happens when Jonas has made corrections; nothing
runs against the prod DB as part of this build.

## Testing

- Unit tests (`src/lib/operators/search-index-corrections.test.ts`): pm →
  ranked overlay; canonical → canonical overlay; unmatched pm reported (not
  thrown); idempotent; doesn't touch non-matching entries or the tracked tier.
- `tsc --noEmit` + `npm run test:watch-list` (CI gate).
- E2E proof (offline, needs Drive): temporarily add a fake correction to
  `name_corrections.json`, run `build-operator-universe.ts`, confirm the
  corrected name appears in `search_index.json`, then revert both files.

## Rollout

Additive: one new script, one new pure module + test, a small
`build-operator-universe.ts` change, an empty committed data file, and a runbook
note. No schema change, no runtime code change, no change to any deployed
surface until a real correction is exported + the index rebuilt.
