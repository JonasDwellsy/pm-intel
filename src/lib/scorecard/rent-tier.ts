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
