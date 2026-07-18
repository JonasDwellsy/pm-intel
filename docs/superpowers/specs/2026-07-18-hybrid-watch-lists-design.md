# Hybrid Watch Lists (criteria + pins in one list) — Design

**Date:** 2026-07-18
**Status:** Approved (design + decisions); pending user review of this spec
**Author:** Jonas + Claude
**Origin:** Two parked pick-list items ("pinned + matches criteria" badge; "Edit opens
the criteria editor for pick lists") only cohere if a list can hold **both** criteria
and manual pins — the deferred "Option B" from the original watch-list spec.

## Problem

Today a watch list is effectively one of two disjoint modes, gated by the stored
`kind` column:
- **Smart** (`kind:"criteria"`) — rules matched against the universe; no pins (the
  "Add to watch list" popover only offers pinned lists, so you can't pin to a smart list).
- **Pinned** (`kind:"pinned"`) — a manual set of companies; `skipCriteriaMatch` is
  gated on `kind==="pinned"`, so its (empty) criteria never run.

The schema is already hybrid-ready (`WatchList` carries the criteria columns **and**
`WatchListMember` for pins; `applyWatchList` already unions both), but the UI + the
`kind`-based gates prevent a single list from using both. Consequences:
- The **"pinned + matches criteria" badge is unreachable**: a pinned-and-matched row
  only arises on a hybrid list, which can't exist. In `apply.ts`,
  `unionPinnedRecords`/`unionPinnedOperators` skip a pinned key that's already a natural
  match, so such a row would carry `pinned:false` anyway.
- **"Edit" on a pinned list opens the criteria editor** (`/edit`) for a list whose
  criteria are ignored — currently pointless.

## Goal / approved decisions

Let any watch list hold criteria and/or pins simultaneously. Three confirmed decisions:

1. **`skipCriteriaMatch` is keyed on criteria-PRESENCE, not `kind`.** A list with no
   criteria skips matching (shows only pins — identical to today's pick lists); a list
   with any criteria runs matching **and** unions pins (hybrid). This preserves the
   pins-only behavior exactly (empty criteria would otherwise "match everyone") and
   enables hybrid with zero new state — a pins-only list becomes hybrid simply by
   gaining criteria.
2. **Any editable list can take pins.** The "Add to watch list" popover offers all the
   user's own lists (not just pinned ones).
3. **`kind` becomes a DERIVED display label** — `pinned` / `smart` / `hybrid`, computed
   from (has criteria?, has pins?). No code branches on the stored `kind` for behavior
   or display anymore.

## Non-goals

- **No schema change / migration** — `WatchList` + `WatchListMember` already support it.
- No change to the criteria/scoring engine, or to the CSV / digest / changes *formats*
  (only their labels reflect hybrid).
- **Entitlement safety unchanged** — pins still never bypass `isMarketEntitled`
  (union reads only post-entitlement records; `apply.ts` invariant preserved).
- The stored `kind` column is left in place (still set on create as the user's intent);
  it's simply no longer read for behavior/display. Dropping it is a later cleanup, not
  this change.

## Architecture

### A. Shared derivation helpers — `src/lib/watch-list/kind.ts` (new, pure, tested)
Single source of truth so every surface agrees:
- `hasCriteria(wl): boolean` — `requiredCriteria.length > 0 || preferredCriteria.length > 0 || excludedCriteria.length > 0`.
- `deriveListKind(wl, pinCount): "pinned" | "smart" | "hybrid"` — `hybrid` if
  `hasCriteria && pinCount > 0`; `smart` if `hasCriteria`; else `pinned` (includes the
  empty-empty case, matching today's default).
- `shouldSkipCriteriaMatch(wl): boolean` — `!hasCriteria(wl)`.

### B. Apply path — `src/lib/watch-list/apply.ts` (the correctness core)
- **`skipCriteriaMatch`** stays a parameter, but callers now pass
  `shouldSkipCriteriaMatch(watchList)` (see D). Semantics unchanged inside `apply.ts`.
- **Add an explicit `matched: boolean`** to `RankedTarget` / `RolledUpTarget`, set
  `true` by the criteria loops (`computeCriteriaMatchedRecords` /
  `computeCriteriaMatchedOperators`).
- **Pin union marks overlap instead of skipping it.** In `unionPinnedRecords`
  (and the operator equivalent): for each pinned key that IS already in the matched set,
  set that existing row's `pinned = true` (rather than `continue`-ing past it); for a
  pinned key NOT already matched, add a new row `{ pinned:true, matched:false, fitScore: … }`
  as today. Result: every row carries an accurate `(matched, pinned)` pair:
  - `matched && !pinned` → criteria match (fit score shown)
  - `pinned && !matched` → pin only ("Pinned")
  - `matched && pinned` → **"Pinned + matches"**

### C. Results UI — `src/components/scorecard/…`/`ResultsTable.tsx`
- Badge logic on `(row.matched, row.pinned)`: render **"Pinned + matches"** (teal, with
  the fit score) when both; keep "Pinned" for pin-only; keep the fit score for match-only.
- `canManageMembers` = `canEditList(...)` (drop the `kind==="pinned"` gate) — unpin
  controls show on any editable list; harmless on lists with no pins.

### D. Callers pass criteria-presence — `results/page.tsx`, `changes/page.tsx`, `digest-run.ts`
Replace the three `const isPinnedList = watchList.kind === "pinned"` uses (currently fed
to `applyWatchList` as `skipCriteriaMatch`) with `shouldSkipCriteriaMatch(watchList)`.
Keeps `/results` and `/changes` in agreement (the existing "both surfaces agree" invariant).

### E. Pin popover — `src/components/watch-list/AddToWatchList.tsx`
- Offer all the caller's **own editable** lists (drop the `kind==="pinned"` filter; keep
  the `ownerId === userId` owner-only filter — you can't pin to a shared view-only list).
- Relabel copy from "pick lists" → "your watch lists". "+ New list…" still creates a
  fresh list (no criteria → derives as `pinned`) and pins immediately.

### F. Index + CSV labels — `watch-lists/page.tsx`, `WatchListIndex.tsx`, `export.ts`
- Compute `deriveListKind` per row (index already gathers pin counts for pinned rows —
  extend to all rows). Card shows: criteria chips when `hasCriteria`, pin count when
  pinned, **both** for hybrid; the pill reads "Pick list" / "Smart list" / "Hybrid".
- CSV (`export.ts`): a hybrid list's rows label pins vs matches from the same
  `(matched, pinned)` flags (no format change).
- Edit stays `/edit` for every list (criteria editor); pins are managed on `/results`.
  This resolves the original "Edit opens criteria editor for pick lists" item — it's now
  correct because any list may carry criteria.

## Testing

- **Pure (`node:test`):** `kind.ts` — `hasCriteria`, `deriveListKind` (all four
  quadrants), `shouldSkipCriteriaMatch`.
- **Apply path (`apply.ts` tests):** extend the existing pin-union suite — a pinned key
  that's also a criteria match yields ONE row with `matched:true && pinned:true` (not a
  duplicate, not `pinned:false`); pin-only rows stay `pinned:true && matched:false`;
  match-only rows `matched:true && pinned:false`; entitlement filter still drops a pinned
  company with no entitled-market record.
- **Component (Vitest):** `AddToWatchList` offers a smart list (not just pinned) to pin
  into; `ResultsTable` renders "Pinned + matches" for a `(matched,pinned)` row.
- CI gate: `tsc` + `test:watch-list` + `test:components`.

## Rollout

Additive + behavior-preserving for existing lists: an existing pinned list (no criteria)
still skips matching and shows only pins; an existing smart list (no pins) is unchanged.
No schema/migration. Ships on deploy. The stored `kind` column is retained but no longer
authoritative.

## Open / deferred

- Backfilling / dropping the now-vestigial `kind` column — later cleanup.
- A dedicated "add criteria to this pick list" affordance on `/results` (today you use
  the existing Edit → criteria editor); fine as-is for v1.
