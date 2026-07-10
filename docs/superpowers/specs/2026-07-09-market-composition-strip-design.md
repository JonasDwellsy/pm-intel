# Market "Operator landscape" — composition strip redesign

**Goal:** Replace the seven equal-weight cohort tiles on the market landing page with a compact, skew-honest composition strip + named standouts.

**Why:** The 7-tile grid (`QuadrantSummaryCard`) fails on four counts (all confirmed by Jonas): (1) it gives a 1-operator cohort the same visual weight as a 35-operator one, and the 4-3 grid leaves an empty slot; (2) the per-cohort "Gold stars by metric" tallies have no denominator, so they're not comparable or decision-useful; (3) the 7-way split isn't the lens the page needs; (4) it's a tall band that mostly restates the intro. The per-cohort counts it shows are already available in the filter chips above the ranked list.

## Design (approved via mockup)

A single section replacing the tile grid, keeping the existing `buildLandscapeIntro` lede paragraph:

1. **Totals line** — `N operators · ~U est. managed units · C cohorts`.
2. **Composition strip** — one horizontal bar, segments proportional to **operator count** per cohort (not units — units are fuzzy estimates and live in the legend). Colored with the canonical 7-cell palette (`QUADRANT7_COLORS`). Tiny cohorts keep a `min-width` so they stay visible + clickable. Each segment links to its filtered segment URL (`${marketHref}/${segment}`).
3. **Legend** — one row per populated cohort, ordered by count desc: color swatch + label + `count · ~units`. Each row links to the same filtered URL. This carries the exact numbers the bar abstracts.
4. **Standouts** — up to 3 operators from the market-wide ranked pool (`allPms`, already ordered gold-then-silver), each shown as a chip: cohort-color dot + name + ★gold ☆silver + link to the scorecard. Only operators with ≥1 star qualify; the block is omitted if none do.

Net effect: ~⅓ the height, the skew becomes the message, no denominator-less tallies, and operator-level standouts replace them with something actionable.

## Components / files

- **New:** `src/components/market/MarketCompositionStrip.tsx` — pure presentational. Props:
  - `summary: Record<string, Quadrant7CellSummaryValue>` (from the existing `deriveQuadrant7CellSummary`)
  - `standouts: Array<{ slug: string; name: string; quadrant7Cell: string | null; goldCount: number; silverCount: number }>`
  - `marketHref: string`
  - Renders totals + bar + legend + standouts. Segment order in the bar follows count desc; segment→URL slug via the same `quadrant7Key`→segment mapping used today.
- **Modify:** `src/components/market/MarketView.tsx` — swap `QuadrantSummaryCard` for `MarketCompositionStrip`; derive `standouts` from `view.allPms` (first 3 with `goldCount + silverCount > 0`); keep the lede.
- **Delete:** `src/components/market/QuadrantSummaryCard.tsx` (only consumer was `MarketView`).
- **Unchanged:** `deriveQuadrant7CellSummary` (still feeds counts/units + the lede). Its `goldByMetric` field becomes unused by this component but stays (still valid, tested); a later cleanup can drop it.

## Data / correctness notes

- Standouts use `allPms` (market-wide), NOT `filteredPms` — they must be market standouts regardless of the active segment filter.
- Total units = Σ cohort `units` (est. managed units, already summed per cohort in the summary).
- Cohort segment slugs reuse the existing `TILE_ORDER` mapping (canonical label → segment) so filtered URLs are unchanged.
- No pipeline, seed, or schema changes. Read-time only.

## Verification

`tsc --noEmit` clean. The market page is DB-backed (not locally renderable without a seed), so the visual proof is the approved mockup + the Vercel preview on deploy.
