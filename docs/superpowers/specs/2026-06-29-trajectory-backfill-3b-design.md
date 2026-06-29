# 3b — historical trajectory backfill

**Date:** 2026-06-29
**Status:** Plan (feasibility confirmed)
**Depends on:** 3a (trajectory UI reads `OperatorSnapshot`).

## Goal

Deepen the trajectory surface (3a) from 7 forward snapshots to a multi-year
history by reconstructing per-operator metrics quarterly back to ~2020Q4,
from the listing-level exports we already ingest.

## Why it's feasible (and not a rewrite)

`pipeline.py` is already an "as-of" machine: `DATA_AS_OF` → `NOW` →
`T12_START = NOW − 365d`, and every listing is bucketed by
`creation_time`/`deactivation_time` via `in_t12()`/`in_t24_t12()`. The
export carries listing-level dates back to 2020-09 (incl. inactive
listings) and per-listing `child_company_id` / `parent_company_id`. So:
- Running the pipeline with a past `dataAsOf` recomputes every metric,
  cohort, star, eligibility flag, and portfolio estimate **as it would
  have stood at that date** — no metric-logic change.
- Operator identity per window uses the same company-id grouping the
  current pipeline uses (ids are on each listing), so renames/M&A are
  handled as they were in the data.

## Approach

1. **Cadence: quarterly**, 2020Q4 → 2026Q2 (~23 as-of dates). T12 metrics
   make monthly steps 11/12 redundant; quarterly captures the trend at 1/3
   the compute.
2. **Orchestrator** (`scripts/data-pipeline/backfill_trajectory.py`): for
   each market × quarter-end, run the existing per-market metric
   computation with `dataAsOf = quarter-end`, collect each operator's
   {portfolioPoint, portfolioBand, gold, silver, eligible}.
3. **Identity join to today:** map each reconstructed operator (by stable
   company id) to **today's `pmSlug`**, so historical rows join the current
   scorecard. Operators with no current pmSlug (gone from coverage) are
   skipped — trajectory is for operators we show today.
4. **Write** reconstructed `OperatorSnapshot` rows (`snapshotDate` =
   quarter-end), tagged `methodologyVersion = "v0.6.4-recon"` so they're
   distinguishable from forward snapshots. Idempotent on
   `(pmSlug, snapshotDate)`.
5. **Pilot then full:** reconstruct 1–2 deep-history markets first, eyeball
   that the curves are sane (plausible portfolio sizes, growth that tracks
   known coverage expansion, eligibility appearing as coverage deepened),
   THEN run all 32.
6. **Deploy:** output is `OperatorSnapshot` DB rows. Local run → local DB;
   prod run = execute the backfill against prod (after the Clerk/domain
   cutover, same as Adamas). The 3a UI picks them up with no code change.

## Honest caveats (surface in UI footnote, already worded "modeled on current methodology")

- Reconstruction under **today's** methodology (v0.6.4) applied
  retroactively — internally consistent, not what we historically showed.
- Coverage thins pre-2022 → early quarters have smaller samples; an
  operator's line legitimately starts when it first crosses the eligibility
  threshold.
- Cleanly reconstructable: portfolio/units, listing volume, lease-up (DOM),
  rent trend, stars (cohort recomputed per window). Sparse-historically
  fields (marketing composite, concessions) are written null where the
  inputs aren't present.

## Out of scope

- Changing the methodology. - Sub-quarterly granularity. - Cross-market
  operator-page aggregation of the trajectory (per-market only, as in 3a).
