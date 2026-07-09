// Estimated managed units — the operator "size" headline.
//
// The raw signal `urusT12` counts distinct rental units an operator put
// on-market in the trailing 12 months. That is a good proxy for a scattered
// SFR book's *portfolio* only after adjusting for turnover: SFR units re-list
// roughly every ~3.3 years, so a 12-month window sees ~1/3.3 ≈ 30% of the
// actively-managed book. Multiplying by the turnover multiplier k (~3) recovers
// a portfolio estimate that is tenure-independent (urusT12 is always ~1/k of
// the *current* book, regardless of how long we've observed the operator).
//
// Multi-unit / community operators (MF/BTR, Hybrid) have a directly observed
// portfolio signal — `observedCommunityTotalUnits`, the declared unit count of
// the communities they list — so they use that instead of the turnover model.
//
// Honest limit: any listing-based estimate misses units under a long-staying
// tenant that never re-list. This estimates the *actively-turning* book.

export const DEFAULT_SFR_TURNOVER_MULTIPLIER = 3.0;

export interface OperatorSizeInputs {
  quadrant7Cell: string | null;
  /** Distinct rental units observed on-market in the trailing 12 months. */
  urusT12: number | null;
  /** Declared total units across the operator's observed communities. */
  observedCommunityTotalUnits: number | null;
}

/** True for the community-based cohorts that use the declared-units method. */
export function usesCommunityUnits(quadrant7Cell: string | null): boolean {
  const q = quadrant7Cell ?? "";
  return q.startsWith("Small MF") || q.startsWith("Large MF") || q === "Hybrid";
}

/**
 * Estimated managed units for an operator. Returns null when there is no size
 * signal at all (no observed units and no community data).
 */
export function estimatedManagedUnits(
  { quadrant7Cell, urusT12, observedCommunityTotalUnits }: OperatorSizeInputs,
  sfrMultiplier: number = DEFAULT_SFR_TURNOVER_MULTIPLIER
): number | null {
  // Community operators use the declared community unit total when present.
  if (
    usesCommunityUnits(quadrant7Cell) &&
    observedCommunityTotalUnits != null &&
    observedCommunityTotalUnits > 0
  ) {
    return observedCommunityTotalUnits;
  }
  // Everyone else (SFR, and community operators with no community data) uses
  // the turnover-adjusted observed count.
  if (urusT12 != null && urusT12 > 0) {
    return Math.round(urusT12 * sfrMultiplier);
  }
  return null;
}
