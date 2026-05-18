import type { PoolPm } from "@/lib/msa-pool";
import { operatorType } from "@/lib/msa-pool";
import type { ScorecardData } from "@/lib/types";

// Per-quarter operator-vs-cohort overlay for Layer 5E (Rent Trajectory
// descriptive chart). The seed populates 6-quarter mix-adjusted median rent
// per operator; this helper aligns those by quarter, computes the cohort
// median across PMs in the focal operator's selected cohort (primary →
// fallback → MSA per the Layer 3 rule), and returns one row per quarter.
//
// Returns the union of quarters present in any cohort PM's trajectory — so
// if the focal has Q1-Q6 and a peer has only Q2-Q6, the helper still emits
// Q1 with cohort median computed from whoever did report that quarter.

export interface CohortRentTrajectoryPoint {
  quarter: string;
  operator: number | null;
  cohortMedian: number | null;
  cohortN: number;
}

export interface CohortRentTrajectory {
  points: CohortRentTrajectoryPoint[];
  cohortLevel: "primary" | "fallback" | "msa";
  cohortName: string;
  cohortN: number;
}

export function buildCohortRentTrajectory(
  scorecard: ScorecardData,
  pool: PoolPm[]
): CohortRentTrajectory | null {
  const traj = scorecard.rentTrajectory;
  if (!Array.isArray(traj) || traj.length === 0) return null;

  const focal = pool.find((p) => p.slug === scorecard.pm.slug);
  const focalType = operatorType(focal?.quadrant7Cell);

  const primary = pool.filter(
    (p) => p.slug !== scorecard.pm.slug && p.quadrant7Cell === focal?.quadrant7Cell
  );
  const fallback = pool.filter(
    (p) =>
      p.slug !== scorecard.pm.slug && operatorType(p.quadrant7Cell) === focalType
  );
  const msa = pool.filter((p) => p.slug !== scorecard.pm.slug);

  // Layer 3 cohort selection rule applies here too — primary → fallback →
  // MSA based on which cohort has at least 10 PMs with trajectory data.
  function withTrajectory(arr: PoolPm[]): PoolPm[] {
    return arr.filter(
      (p) => Array.isArray(p.scorecard.rentTrajectory) && p.scorecard.rentTrajectory.length > 0
    );
  }
  const primaryT = withTrajectory(primary);
  const fallbackT = withTrajectory(fallback);
  const msaT = withTrajectory(msa);

  let cohort: PoolPm[];
  let cohortLevel: "primary" | "fallback" | "msa";
  let cohortName: string;
  const marketName = scorecard.market.name;
  if (primaryT.length + 1 >= 10) {
    cohort = primaryT;
    cohortLevel = "primary";
    cohortName = `${marketName} ${focal?.quadrant7Cell ?? ""} cohort`.trim();
  } else if (fallbackT.length + 1 >= 10) {
    cohort = fallbackT;
    cohortLevel = "fallback";
    const typeLabel =
      focalType === "sfr" ? "SFR" : focalType === "mfbtr" ? "MF/BTR" : "Hybrid";
    cohortName = `${marketName} ${typeLabel} cohort`;
  } else {
    cohort = msaT;
    cohortLevel = "msa";
    cohortName = `${marketName} MSA cohort`;
  }

  // Build a quarter → operator value map from the focal trajectory.
  const focalByQuarter = new Map<string, number>();
  for (const q of traj) {
    if (typeof q.mixAdjMedian === "number" && q.mixAdjMedian > 0) {
      focalByQuarter.set(q.quarter, q.mixAdjMedian);
    }
  }

  // Build a quarter → list of cohort medians map.
  const cohortByQuarter = new Map<string, number[]>();
  for (const peer of cohort) {
    for (const q of peer.scorecard.rentTrajectory) {
      if (typeof q.mixAdjMedian === "number" && q.mixAdjMedian > 0) {
        if (!cohortByQuarter.has(q.quarter)) cohortByQuarter.set(q.quarter, []);
        cohortByQuarter.get(q.quarter)!.push(q.mixAdjMedian);
      }
    }
  }

  // Union of quarters, sorted ascending by quarter string. The seed's quarter
  // labels sort lexicographically (e.g., "2025Q4" < "2026Q1").
  const allQuarters = Array.from(
    new Set([...focalByQuarter.keys(), ...cohortByQuarter.keys()])
  ).sort();

  const points: CohortRentTrajectoryPoint[] = allQuarters.map((quarter) => {
    const operator = focalByQuarter.get(quarter) ?? null;
    const cohortValues = cohortByQuarter.get(quarter) ?? [];
    const cohortMedian = cohortValues.length > 0 ? median(cohortValues) : null;
    return {
      quarter,
      operator,
      cohortMedian,
      cohortN: cohortValues.length,
    };
  });

  return {
    points,
    cohortLevel,
    cohortName,
    cohortN: cohort.length + 1,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
