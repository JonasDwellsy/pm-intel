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

// Turnover-uncertainty band around the point estimate. Turnover rates aren't
// exact, so the size is a range, not a number. The band applies plausible
// low/high turnover multipliers per unit type — bracketing the defaults
// (k_house 3.3 → [2.5, 4.2]; k_apt 2.6 → [2.0, 3.3], ≈ ±25% / +27%). Type-aware:
// an apartment-heavy operator's band reflects apartment-turnover uncertainty.
export const K_HOUSE_BAND: readonly [number, number] = [2.5, 4.2];
export const K_APT_BAND: readonly [number, number] = [2.0, 3.3];

/**
 * Low/high estimated-managed-units band from the turnover range. Null when
 * there is no observed-unit signal (matches estimatedManagedUnits). Callers
 * that also have the point estimate should clamp it inside [low, high] in case
 * admin-tuned multipliers fall outside the band.
 */
export function estimatedManagedUnitsBand({
  houseUrusT12,
  aptUrusT12,
}: OperatorSizeInputs): { low: number; high: number } | null {
  const house = houseUrusT12 ?? 0;
  const apt = aptUrusT12 ?? 0;
  if (house <= 0 && apt <= 0) return null;
  return {
    low: Math.round(house * K_HOUSE_BAND[0] + apt * K_APT_BAND[0]),
    high: Math.round(house * K_HOUSE_BAND[1] + apt * K_APT_BAND[1]),
  };
}
