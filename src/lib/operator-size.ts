// Estimated managed units — the operator "size" headline.
//
// Portfolio size is estimated from on-market turnover, split by the unit's own
// observed type. A rental unit only surfaces in the data when it lists (on
// turnover), so observed units in the trailing 12 months are a fraction of the
// managed book — and that fraction differs by type:
//
//   scattered SFR houses re-list ~every 3.3 years  → multiply by k_house (~3.3)
//   apartment units turn over faster (~every 2.6y)  → multiply by k_apt   (~2.6)
//
//   estimate = houseUrusT12 × k_house + aptUrusT12 × k_apt
//
// This is applied UNIFORMLY to every operator, keyed on each unit's own type —
// not on the operator's dominant-type label (quadrant) or on building-level
// dominance (which listing data can't tell apart from a scattered slice). It
// recovers the multifamily portfolio the safe way: for a genuine apartment
// operator, aptUrusT12 × k_apt reproduces the declared building count without
// attributing whole buildings.
//
// Honest limit: a lone apartment/condo held by an otherwise-scattered operator
// gets the (faster) apartment multiplier though it really turns over slowly — a
// second-order edge case. And units under a long-staying tenant that never
// re-list are invisible to any listing-based estimate.

export const DEFAULT_K_HOUSE = 3.3;
export const DEFAULT_K_APT = 2.6;

export interface PortfolioMultipliers {
  kHouse: number;
  kApt: number;
}

export interface OperatorSizeInputs {
  /** Distinct single-family (house) rental units observed on-market in T12. */
  houseUrusT12: number | null;
  /** Distinct apartment rental units observed on-market in T12. */
  aptUrusT12: number | null;
}

export const DEFAULT_MULTIPLIERS: PortfolioMultipliers = {
  kHouse: DEFAULT_K_HOUSE,
  kApt: DEFAULT_K_APT,
};

/**
 * Estimated managed units for an operator. Returns null when there is no
 * observed-unit signal at all.
 */
export function estimatedManagedUnits(
  { houseUrusT12, aptUrusT12 }: OperatorSizeInputs,
  { kHouse, kApt }: PortfolioMultipliers = DEFAULT_MULTIPLIERS
): number | null {
  const house = houseUrusT12 ?? 0;
  const apt = aptUrusT12 ?? 0;
  if (house <= 0 && apt <= 0) return null;
  return Math.round(house * kHouse + apt * kApt);
}
