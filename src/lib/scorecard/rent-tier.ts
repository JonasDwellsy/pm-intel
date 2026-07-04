// v0.24 — pure rent-tier position: the operator's most recent mix-adjusted
// median rent vs the MSA cohort distribution, as a 0..1 position on a
// value→premium track. Re-homed from the retiring lending-signals pricing
// tier so the redesigned scorecard has no dependency on that module.

export interface RentInput {
  pm: { slug: string };
  rentTrajectory?: Array<{ quarter: string; mixAdjMedian: number; n?: number }> | null;
}

/** Most recent quarter's mix-adjusted median rent (>0), else null. */
export function latestRent(input: RentInput): number | null {
  const traj = input.rentTrajectory;
  if (!Array.isArray(traj) || traj.length === 0) return null;
  const sorted = [...traj].sort((a, b) => (b.quarter || "").localeCompare(a.quarter || ""));
  for (const q of sorted) {
    if (typeof q.mixAdjMedian === "number" && q.mixAdjMedian > 0) return q.mixAdjMedian;
  }
  return null;
}

export interface RentTierDetail {
  /** 0..1 track position (same value rentTierPosition returns). */
  position: number;
  /** Operator's most recent mix-adjusted median rent (dollars). */
  rentMedian: number;
  /** Cohort P25 / P75 of latest rents (dollars). */
  marketP25: number | null;
  marketP75: number | null;
  /** Listing count behind the operator's latest rent quarter (sample size). */
  sampleSize: number | null;
}

/** Linear-interpolated quantile over an ascending-sorted numeric array. */
function quantile(sortedAsc: number[], q: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

/** Most recent positive-rent quarter's { rent, n }, else null. */
function latestRentEntry(input: RentInput): { rent: number; n: number | null } | null {
  const traj = input.rentTrajectory;
  if (!Array.isArray(traj) || traj.length === 0) return null;
  const sorted = [...traj].sort((a, b) => (b.quarter || "").localeCompare(a.quarter || ""));
  for (const q of sorted) {
    if (typeof q.mixAdjMedian === "number" && q.mixAdjMedian > 0) {
      return { rent: q.mixAdjMedian, n: typeof (q as any).n === "number" ? (q as any).n : null };
    }
  }
  return null;
}

/** Rich rent-tier detail: position + operator rent + cohort P25/P75 + sample size.
 *  null when the focal has no rent or the cohort is empty. */
export function rentTierDetail(focal: RentInput, pool: RentInput[]): RentTierDetail | null {
  const entry = latestRentEntry(focal);
  const position = rentTierPosition(focal, pool);
  if (entry === null || position === null) return null;
  const cohortRents = pool
    .filter((p) => p.pm.slug !== focal.pm.slug)
    .map((p) => latestRent(p))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  return {
    position,
    rentMedian: entry.rent,
    marketP25: quantile(cohortRents, 0.25),
    marketP75: quantile(cohortRents, 0.75),
    sampleSize: entry.n,
  };
}

/** 0..1 position of the focal operator's rent within its cohort (focal
 *  excluded by slug). null when focal has no rent or the cohort is empty. */
export function rentTierPosition(focal: RentInput, pool: RentInput[]): number | null {
  const operatorRent = latestRent(focal);
  if (operatorRent === null) return null;
  const cohortRents = pool
    .filter((p) => p.pm.slug !== focal.pm.slug)
    .map((p) => latestRent(p))
    .filter((v): v is number => v !== null);
  if (cohortRents.length === 0) return null;
  // Fair 0..1 rank: cohort rents strictly below the focal, plus half of any
  // exact ties, over the full set size minus one. Ties get the midpoint
  // position rather than the lower bound.
  const below = cohortRents.filter((r) => r < operatorRent).length;
  const equal = cohortRents.filter((r) => r === operatorRent).length;
  const n = cohortRents.length + 1; // include the focal
  return n > 1 ? (below + equal / 2) / (n - 1) : 0.5;
}
