# Operator-roster watch lists — surfacing design

**Date:** 2026-07-18
**Status:** Approved (design + decisions); pending user review of this spec
**Author:** Jonas + Claude
**Origin:** Demo with Sarah (asset-management firm, ~6,500 units, multifamily,
secondary/tertiary markets). Two use cases came through loud and repeated:
(1) *discovery* — "who operates in Tracy/Modesto, and how do they perform?" →
pick a few to keep an eye on; (2) *monitoring* — "here are my 5 property
managers, watch them and tell me when something moves before I talk to them."
Mid-demo Jonas reacted to (2) with "we should add specific companies… and
monitor them" — i.e. the capability we *just shipped* (hybrid/pinned watch
lists) wasn't discoverable as the roster use case it already supports.

## Problem

The roster-monitoring capability is effectively **already built** and needs no
new data model:
- A watch list already holds pinned operators (hybrid/pinned lists, PRs
  #253–#256). Pins are added per-operator via the "Add to watch list" control
  on scorecards (`ScorecardHeader`), market rows (`PMListItem`), and search
  rows (`SearchResultRow`).
- The results page already renders the watched operators' performance, badges
  each row (`Pinned` / `Pinned + matches`), lets the owner manage/remove pins,
  and shows a "what moved since your last visit" change banner.
- A monthly change **digest** exists (opt-in at `settings/notifications`;
  delivery gated on digest env vars being set).

So the gap is **discoverability, assembly speed, and vocabulary** — not logic:
1. **Entry point.** The `/watch-lists` index leads with criteria/template
   creation; there is no obvious "watch these operators" on-ramp.
2. **Assembly.** Building a roster of 5 means pinning them one at a time from
   separate scorecards. There is no "select several and save as a list" flow.
3. **Vocabulary.** "Pick list" is internal jargon; the demo showed the
   confusion directly. Since the hybrid work made pinned/smart/hybrid a *derived*
   property of a single unified object, the UI should describe lists by their
   content, not expose our taxonomy.

## Goal / approved decisions

Make the "watch a roster of operators and monitor them" use case a first-class,
obvious path over the existing unified watch-list object. Two confirmed
decisions:

1. **Both assembly flows.** Multi-select from the market operator list (for
   discovery-driven rosters) **and** a search-and-add entry from the index (for
   known-name rosters). They converge on the same watch-list object.
2. **Describe by content, drop the jargon.** Everything is a "Watch list." Cards
   describe what's in them plainly — "5 operators", criteria chips, or "5
   operators + criteria" — with no Pick/Smart/Hybrid pills. Entry points are
   verbs: "Watch operators" and "Build a smart list."

## Non-goals

- **No schema / data-model change.** `WatchList` + `WatchListMember` (+ the
  derived `kind.ts` helpers) already support rosters; pins are entitlement-safe
  via the existing `applyWatchList` union.
- **No property-level data.** That is the separate, higher-effort item (#1),
  intentionally sequenced after this.
- **No changes to the scoring/criteria engine or the digest engine.** We surface
  the digest opt-in; we do not rebuild it, and its *delivery* env setup remains
  an ops task outside this code.
- **No new "roster" object.** We deliberately do not reintroduce a distinct
  entity — that would fight the unification just shipped. One watch-list object,
  better on-ramps.

## Architecture

### A. Watch-lists index — verb-first entry points + content-descriptor cards
`src/app/watch-lists/page.tsx`, `src/components/watch-list/WatchListIndex.tsx`
(supersedes `NewPickListButton`'s current framing).
- Replace the template-first CTA area with two primary actions:
  - **"Watch operators"** → opens the search-and-add modal (C).
  - **"Build a smart list"** → the existing criteria/editor flow.
- Cards: remove the derived Pick/Smart/Hybrid pill; render a plain content
  descriptor — `"{n} operators"` when pins > 0, criteria chips when criteria
  present, both for a list that has both. (The card already computes pin counts
  and criteria chips from the hybrid work; this removes the noun and keeps the
  content line.)

### B. Market operator list — multi-select → add to a watch list
The per-market operator list — the rows rendered as
`src/components/market/PMListItem.tsx`, which already carry the per-operator
Add-to-watch-list control (mounted today under
`src/app/property-managers/[state]/[city]`). The plan confirms the exact
surface(s) to instrument if the tool exposes more than one market operator
list view.
- Add a selection affordance per operator row and a sticky **"Add N selected to
  a watch list"** action bar. The bar offers the caller's own lists (same
  owner-scoped set the pin popover uses) or "+ New list…" (name it, create,
  pin the selection).
- Under the hood this is N member-adds against the selected operators' company
  keys (`canonicalOperatorId ?? slug`) via the existing `/members` API — the
  same path a single pin uses today, batched. Entitlement scoping is unchanged
  (you can only add operators you can see).

### C. Search-and-add modal — assemble a roster by name
New client component, launched from the index "Watch operators" action.
- Reuse the existing operator search to find operators across the caller's
  entitled markets; add each as a chip; name the list; save.
- On save: create a watch list (no criteria → derives as a pinned/roster list)
  and pin the selected operators, mirroring the existing "+ New list… then pin"
  inline flow in `AddToWatchList`.

### D. Roster results page — lead with the monitoring value
`src/app/watch-lists/[id]/results/page.tsx` (+ `ResultsTable`).
- For a list whose contents are operators (pins present), lead the header with
  the roster framing — "{n} operators watched" — and make the existing "what
  moved since your last visit" delta prominent (that is the monitoring payoff).
- Surface the alerts opt-in: a visible prompt to "get monthly alerts when these
  move," linking to the existing `settings/notifications` digest preference.
  (We link to the existing user/org-level digest opt-in; we do **not** invent a
  per-list toggle in this pass.)
- Keep the `Pinned + matches` badge for a roster that also carries criteria.

### E. Per-operator "Add to watch list" — copy alignment
`AddToWatchList` (mounted on `ScorecardHeader`, `PMListItem`, `SearchResultRow`).
- No behavior change — it already offers all the caller's own lists since the
  hybrid work. Align copy to the new vocabulary ("Watch list" / "Watch this
  operator"), and ensure "+ New list…" reads as creating a plain watch list.

## Data model

None. Unified `WatchList` + `WatchListMember` already support rosters; the
`kind` column has been dropped and pinned/smart/hybrid derives from content via
`src/lib/watch-list/kind.ts`.

## Testing

- **Component (Vitest):** the multi-select add bar (B) — selecting operators and
  saving fires the expected member-add calls against the chosen/created list;
  the search-and-add modal (C) — adding operators + naming creates a list and
  pins them; the index (A) renders content descriptors (no jargon pill) for
  operators-only, criteria-only, and mixed lists.
- **Reuse existing coverage:** the pin union, entitlement scoping, results
  badges, and digest already have tests from #253–#256 and the original
  watch-list work; this pass adds UI/assembly coverage, not engine coverage.
- **CI gate:** `tsc` + `test:watch-list` + `test:components`.

## Rollout

Additive and behavior-preserving for existing lists — an existing watch list
renders under the new content-descriptor cards unchanged; existing per-operator
pinning is untouched. No schema/migration. Ships on deploy. The alerts opt-in
links to the existing digest preference, whose delivery still depends on the
digest env vars (unchanged ops dependency).

## Open / deferred

- **Property-level detail + export (item #1).** The next, higher-value build;
  sequenced after this.
- **Per-list digest granularity.** Today the digest is user/org-level; a
  per-roster "alert me about *this* list" toggle is a possible follow-up.
- **"Manages third-party?" operator signal** (from the demo) — a separate
  data/enrichment question, not part of surfacing.
- **Sub-threshold operators in thin markets** — whether to show a provisional
  tier below the 30-listing eligibility cut so thin markets aren't empty; a
  discovery-coverage question to revisit with item #1.
