// Operator scale as a band rather than a point.
//
// Why bands: a calibration study over 4,219 active operators plus two
// ground-truth counts (Fischer 1,400 actual vs 790 estimated; Income Property
// Specialists 3,000 actual vs 803 estimated) showed our size estimate runs
// materially low for apartment-heavy operators — and that even the best signal
// we hold (declared community units) is still ~2x low on both. That residual is
// coverage: units that never list on Dwellsy at all. No multiplier recovers
// them, so no point estimate can be defended to an operator who knows their own
// number.
//
// Bands don't make the estimate more accurate. They stop us making a precision
// claim the data can't support, which is the actual credibility risk — a
// prominent "~800 units" shown to someone who runs 3,000 loses the room.
//
// Edges are log-scaled and drawn from the real distribution (median 170,
// p75 331), not intuition. They are NON-OVERLAPPING on purpose: overlapping
// bands would put an 800-unit operator in two buckets at once, which breaks
// sorting, watch-list filters, and reads as hedging.
//
// Distribution across the active book:
//   <50 2.7% · 50-100 20.5% · 100-200 33.8% · 200-400 22.4%
//   400-800 12.3% · 800-1,600 5.0% · 1,600+ 3.3%

export interface SizeBand {
  /** Inclusive lower edge. Sort on this — it's stable and non-arbitrary. */
  min: number;
  /** Exclusive upper edge; null on the open-ended top band. */
  max: number | null;
  /** Display label, e.g. "200–400" or "1,600+". */
  label: string;
}

export const SIZE_BANDS: readonly SizeBand[] = [
  { min: 0, max: 50, label: "<50" },
  { min: 50, max: 100, label: "50–100" },
  { min: 100, max: 200, label: "100–200" },
  { min: 200, max: 400, label: "200–400" },
  { min: 400, max: 800, label: "400–800" },
  { min: 800, max: 1600, label: "800–1,600" },
  { min: 1600, max: null, label: "1,600+" },
] as const;

/**
 * Band containing `units`. Returns null when there is no estimate at all —
 * callers must render the absence rather than inventing a band.
 */
export function sizeBandFor(units: number | null | undefined): SizeBand | null {
  if (units == null || !Number.isFinite(units) || units < 0) return null;
  for (const b of SIZE_BANDS) {
    if (units >= b.min && (b.max === null || units < b.max)) return b;
  }
  return null;
}

/** Convenience: the label alone, or null. */
export function sizeBandLabel(units: number | null | undefined): string | null {
  return sizeBandFor(units)?.label ?? null;
}

/**
 * The coverage limit, stated wherever a band appears. This is the honest cap on
 * what any listing-derived estimate can claim, and saying it plainly is what
 * keeps the number credible.
 */
export const SIZE_COVERAGE_CAVEAT =
  "Estimated from listings observed on Dwellsy. Operators may not list their " +
  "entire portfolio with us, so treat this as a floor rather than a census.";
