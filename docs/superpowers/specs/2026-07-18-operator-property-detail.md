# Operator property-level detail + rollup export (Phase 1) — Design

**Date:** 2026-07-18
**Status:** Approved (design + decisions); pending user review of this spec
**Author:** Jonas + Claude
**Origin:** Sarah demo (Jul-17). Her loudest, most-repeated ask: property-level
data on the operators she evaluates — she's building her own BI tool because we
only hand her operator-level aggregates. This is demo item #1, sequenced after
the operator-roster work (#257). See [[operator-roster-and-demo-roadmap]].

## Problem

The app persists only **operator-level aggregates** — one `PM.scorecardData`
JSON blob per operator. There is no per-property or per-listing data anywhere
the deployed app can read; the rich per-listing signals (per-property DOM, rent,
concessions, listing quality) live only in the pipeline source CSVs. So a
hands-on asset manager evaluating an operator can see the operator's rolled-up
scores but not *which properties* drive them or how each performs — the gap
Sarah fills by rebuilding the data herself.

## Goal / approved decisions

Give each operator a **property-level detail view + export**, one grain down from
the scorecard, derived from the per-listing data the pipeline already reads.
Confirmed decisions:

1. **Persist a lean per-property record** (not surface-only, not export-only).
2. **Grain:** MF → one record per concentrated community; scattered SFR → one
   record per submarket (rollup). Individual per-home rows are **Phase 2**.
3. **Phased export.** Phase 1 (this spec): in-app detail + an export at the same
   community/submarket granularity, all in the committed seed, no infra change.
   Phase 2 (with the pending source-data migration): the full per-home BI-feed
   export.
4. **Data + comps, never per-property scores.** Each property shows raw
   observations plus the MSA-median comp ("vs market"); no 1–5 star per property.
   Operator-level keeps its existing scores. Holds the statistical-integrity line.
5. **Coverage = every operator that has a scorecard** (not ranked-only), so
   thin-market / sub-threshold operators Sarah evaluates are covered. The
   community/submarket grain keeps this small even for large operators.
6. **Comp basis = MSA median** for DOM / rent-YoY / concession.

## Non-goals

- **No individual per-home rows** in Phase 1 (in-app or export) — that's Phase 2,
  paired with the source-data migration to a company-owned store.
- **No new schema / migration.** Phase 1 rides the existing `PM.scorecardData`
  blob (a new optional `propertyDetail` field); the lean grain fits. (Phase 2's
  per-home tier is what would need a dedicated table.)
- **No per-property score** and no change to operator-level scoring.
- **Not** the owner's own-portfolio monitoring tool (a separate product Jonas
  mentioned in the demo).
- No change to the roster/watch-list work.

## Architecture

### A. Pipeline aggregation pass — `scripts/data-pipeline/pipeline.py`
`pipeline.py` already reads, per listing, `community_id`, `address1_id`,
`address_1` / `address_city`, `address_type`, `rent_amount`,
`top_down_community_count`, `property_listing_status` (→ DOM), quarterly rents by
bedroom, plus the concession classifier and marketing/listing-quality
(`marketing.py`). Add a pass that, per operator, buckets its T12 listings into
property records:
- **MF** — group by `community_id`; emit: community label (from `address_1` /
  community name), `units` (`top_down_community_count`), `medianDomT12`,
  representative rent + `rentYoY`, `concessionRate`, `listingQuality`,
  `nListings`, submarket/city.
- **Scattered SFR** — group the non-community listings by submarket; emit the
  same shape with `nHomes` instead of a single community's units.
Aggregation rules are median/representative over the operator's T12 listings in
that bucket (spec'd exactly in the plan). This is a pure add — no change to the
existing operator-level aggregates.

### B. Seed / persistence — extend `ScorecardData`
Emit the per-operator property records as a new optional
`scorecard.propertyDetail` block (in `src/lib/types.ts` + the seed JSON via
`seed.ts`). No new table, no migration — it rides the existing blob and reseeds
on deploy via the `isDataCurrent()` fingerprint. Size stays bounded because the
grain is communities + submarkets, never homes.

### C. Property record — observations + comps, no scores
Each record carries its own observation values AND the MSA-median comp for the
comparable metrics (DOM, rent-YoY, concession), so the UI renders a "value vs
market" pair per row. No star/score field on a property record. A short note on
the scorecard's methodology footer explains the property view is descriptive
(data + comps), distinct from the scored operator-level metrics.

### D. In-app — "Properties" section on the operator scorecard
A new section in the scorecard body (`src/components/scorecard/…`), rendered from
`scorecard.propertyDetail`, gated by the same entitlement/auth as the scorecard.
A sortable table: property/community (or "SFR · {submarket}"), units/homes,
median DOM, rent + YoY, concession rate, listing-quality — each comparable
column paired with its MSA-median comp. An "Export" control. Absent block →
section omitted (older seeds / operators with no listings).

### E. Export — rollup-granularity CSV/XLSX
A per-operator export at the community/submarket granularity, reusing the
existing `src/lib/watch-list/export.ts` xlsx approach and a download route
(mirroring the watch-list export / scorecard PDF download pattern). Columns =
the property record fields + comps. Phase 2 adds the full per-home rows.

### F. Methodology
Add a short property-level methodology note (footer/methodology page) stating the
property view is descriptive observations + MSA-median comps, intentionally
un-scored (small per-property N), and that scattered SFR is shown as submarket
rollups in Phase 1.

## Data model / size

No migration. `propertyDetail` lives in `PM.scorecardData`. Per-operator size is
bounded by (# concentrated communities + # submarkets with scattered SFR), which
is small even for large operators. Committed `scorecard_data.json` grows modestly;
reseeds on deploy like everything else.

## Testing

- **Pure (pytest):** the pipeline aggregation pass — community/submarket bucketing
  + the median/representative/comp computations — on fixture listings (mirrors
  `test_marketing.py` / `test_tenancy_survival.py`).
- **Pure (node:test):** any TS-side property view-model/derivation helper.
- **Component (Vitest):** the Properties section renders records with value+comp
  pairs, sorts, and omits cleanly when `propertyDetail` is absent.
- **Export:** the property export builder emits the expected columns/rows
  (mirrors `export.test.ts`).
- CI gate: `tsc` + `test:watch-list` + `test:components` + the pytest pipeline
  tests.

## Rollout

Additive + behavior-preserving: operators without a `propertyDetail` block (older
seeds) simply don't render the section. Ships when the pipeline re-runs and the
new `scorecard_data.json` reseeds on deploy. No schema/migration. Requires a
pipeline re-run against the source listings (Jonas's laptop) to populate
`propertyDetail` for existing markets — same refresh path as any data change.

## Open / deferred

- **Phase 2 — individual per-home export** (the BI feed), paired with the
  source-data migration to a company-owned store + a dedicated per-home table.
- **Thin-market provisional tier** and the **"manages third-party?" operator
  signal** — separate deferred demo items ([[operator-roster-and-demo-roadmap]]).
- A property-level *monitoring* surface (changes over time per property) — not in
  this scope; the operator-level change digest already exists.
