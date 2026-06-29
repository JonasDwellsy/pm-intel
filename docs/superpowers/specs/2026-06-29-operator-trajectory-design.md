# Operator trajectory over time — design

**Date:** 2026-06-29
**Status:** Approved (brainstorm)

## Problem

Acquirers want to know whether an operator is growing or shrinking — a
multi-snapshot trend, not a single point-in-time scorecard. We already
capture `OperatorSnapshot` rows per refresh (7 dates so far: 2026-05-19 →
2026-06-28), so the data to show a trend exists; it just isn't surfaced.

Decomposed into:
- **3a (this spec):** the trajectory UI, reading the existing
  `OperatorSnapshot` time-series. Ships now; handles thin history.
- **3b (next):** a quarterly historical backfill (2020Q4→now) reconstructed
  from the listing-level exports, written into the same `OperatorSnapshot`
  table — deepens 3a automatically. Confirmed feasible: exports are
  listing-level with `creation_time`/`deactivation_time` back to 2020-09
  and include inactive listings.

## Scope (3a)

Per-market scorecard page (`/property-managers/[state]/[city]/[slug]`),
keyed by `pmSlug` = `OperatorSnapshot.pmSlug`. Already login-gated +
entitlement-gated + dynamically rendered, so no new access concerns.

## Data

`loadOperatorTrajectory(pmSlug)` → ordered (asc) series from
`OperatorSnapshot`:
- `date` (snapshotDate, ISO yyyy-mm-dd)
- `portfolioPoint` (estimatedPortfolioPoint, nullable)
- `portfolioBand` (estimatedPortfolioBand — confidence tier or status)
- `goldCount`, `silverCount`
- `eligible` (isEligibleForRanking)

Pure shaping helpers (unit-tested): build sparkline coordinates from the
point series; derive a "first tracked {date}" label; compute
net portfolio delta (first→last) for the headline.

## UI

`<OperatorTrajectory series={...} />` — hand-rolled SVG (matches the
no-chart-lib convention used by the coverage map), rendered as a section
on the scorecard page:
- **Headline:** estimated-portfolio sparkline with first/last values and
  net change ("≈ +180 units since {firstDate}").
- **Star profile over time:** compact gold/silver counts per snapshot.
- **Thin history (≤1 point):** no chart — "First tracked {date};
  trajectory builds with each refresh." (Most newest-market operators are
  single-point until 3b lands.)
- Footnote: "Tracked since {date} · modeled on current methodology."

## Out of scope (3a)

- Cross-market operator-page trajectory aggregation (per-market only for now).
- The historical backfill (that's 3b).
- Per-metric (5-axis) trend lines — keep to portfolio + star totals.

## Testing

Unit tests on the pure shaping (series → sparkline points; thin-history
label; net-delta), plus a source guard that the scorecard page renders
the component.
