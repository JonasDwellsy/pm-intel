import type { PoolPm } from "@/lib/msa-pool";
import { operatorType, operatorTypeLabel } from "@/lib/msa-pool";
import type {
  CohortLevel,
  ScorecardData,
  StarLevel,
} from "@/lib/types";

// Layer 4 — Lending Signals (Scorecard_Design_Spec_v1.0.md Section 3, Layer 4).
// 5 signal cards in a compact 3-2 grid:
//
//   Signal 1 — Vacancy Signal (computed at render time from DOM + Tenancy)
//   Signal 2 — Rent Stability (passed through from lendingSignals.rentStability,
//              v0.6.2 Patch 4)
//   Signal 3 — Operator Stability (composite surfaced from yearsVisible +
//              cross-market footprint count; persistent eligibility deferred
//              to v0.7 — not in v0.6.2 seed)
//   Signal 4 — Geographic Concentration (passed through from
//              lendingSignals.geographicConcentration, v0.6.2 Patch 7).
//              Linear position indicator — no star, descriptive only per
//              Decision G.4.
//   Signal 5 — Pricing Tier (computed at render time from rent trajectory)
//
// Each signal carries a value, cohort context, and a star (signals 1, 2, 3)
// or position indicator (signal 4) or tier label (signal 5). The render-time
// computations (1, 3, 5) consume the same MSA pool that Layer 3 uses, so the
// page pays for one DB query total.

// Direction semantics: "lower better" or "higher better" determines how
// percentile maps to stars. Signal 4 has no direction (descriptive only).
export interface SignalDistribution {
  cohortLevel: CohortLevel;
  cohortName: string;
  cohortN: number;
  cohortMedian: number | null;
  /** Operator's percentile within selected cohort. Direction-aware: 100 =
   *  most favorable for the metric. */
  focalPercentile: number | null;
}

// Per-signal output shapes — each signal carries its own dimension-specific
// fields plus a shared cohort distribution.
export interface VacancySignal {
  kind: "vacancy";
  /** Percent of cycle that is vacancy, 0-100. Null when DOM or Tenancy is. */
  vacancyPct: number | null;
  dist: SignalDistribution;
  star: StarLevel;
}
export interface RentStabilitySignal {
  kind: "rentStability";
  /** Standard deviation of trailing-12-quarter YoY rent in pp. Null when
   *  suppressed. */
  volatilityPP: number | null;
  cohortMedianVolatility: number | null;
  yearsOfHistory: number;
  suppressed: boolean;
  reason?: string;
  star: StarLevel;
}
export interface OperatorStabilitySignal {
  kind: "operatorStability";
  yearsVisible: number | null;
  marketCount: number;
  /** Star is computed from yearsVisible percentile within the selected
   *  cohort. marketCount surfaces alongside as a separate fact. */
  dist: SignalDistribution;
  star: StarLevel;
}
export interface GeographicConcentrationSignal {
  kind: "geographicConcentration";
  top3CityShare: number;
  cohortMedianTop3: number;
  /** "more_concentrated" | "near_cohort" | "more_dispersed" — no star. */
  positionIndicator: "more_concentrated" | "near_cohort" | "more_dispersed";
  cohortLevel: CohortLevel;
}
export interface PricingTierSignal {
  kind: "pricingTier";
  /** Operator's most recent observed mix-adjusted median rent. */
  operatorRent: number | null;
  msaP25: number | null;
  msaP75: number | null;
  /** "premium" | "mid-market" | "value" — tier label, no star. */
  tier: "premium" | "mid-market" | "value" | null;
  /** Focal percentile in MSA rent distribution, 0-100. */
  percentile: number | null;
}

export interface LendingSignals {
  vacancy: VacancySignal | null;
  rentStability: RentStabilitySignal | null;
  operatorStability: OperatorStabilitySignal | null;
  geographicConcentration: GeographicConcentrationSignal | null;
  pricingTier: PricingTierSignal | null;
}

export function buildLendingSignals(
  scorecard: ScorecardData,
  pool: PoolPm[],
  marketFootprintCount: number
): LendingSignals {
  const focal = pool.find((p) => p.slug === scorecard.pm.slug);
  if (!focal) {
    return {
      vacancy: null,
      rentStability: null,
      operatorStability: null,
      geographicConcentration: null,
      pricingTier: null,
    };
  }
  const focalType = operatorType(focal.quadrant7Cell);

  return {
    vacancy: buildVacancySignal(focal, focalType, pool, scorecard.market.name),
    rentStability: buildRentStabilitySignal(scorecard),
    operatorStability: buildOperatorStabilitySignal(
      focal,
      focalType,
      pool,
      scorecard.market.name,
      marketFootprintCount
    ),
    geographicConcentration: buildGeographicConcentrationSignal(scorecard),
    pricingTier: buildPricingTierSignal(focal, pool),
  };
}

// --- Signal 1: Vacancy Signal ---
// vacancy_pct = (DOM_days / 30) / (Tenancy_months + DOM_days / 30) × 100
// Lower vacancy = more favorable.
function computeVacancyPct(sc: ScorecardData): number | null {
  const dom = sc.performance.domT12;
  const tenancy = sc.tenancy.overallGap;
  if (!Number.isFinite(dom) || tenancy === null || !Number.isFinite(tenancy)) {
    return null;
  }
  const domMonths = dom / 30;
  const cycle = tenancy + domMonths;
  if (cycle <= 0) return null;
  return (domMonths / cycle) * 100;
}

function buildVacancySignal(
  focal: PoolPm,
  focalType: ReturnType<typeof operatorType>,
  pool: PoolPm[],
  marketName: string
): VacancySignal | null {
  const focalValue = computeVacancyPct(focal.scorecard);

  const valuesIn = (filter: (p: PoolPm) => boolean) =>
    pool
      .filter((p) => p.slug !== focal.slug && filter(p))
      .map((p) => computeVacancyPct(p.scorecard))
      .filter((v): v is number => v !== null);

  const primary = valuesIn((p) => p.quadrant7Cell === focal.quadrant7Cell);
  const fallback = valuesIn((p) => operatorType(p.quadrant7Cell) === focalType);
  const msa = valuesIn(() => true);

  const focalContrib = focalValue !== null ? 1 : 0;
  let cohortLevel: CohortLevel;
  let cohortValues: number[];
  let cohortName: string;

  if (primary.length + focalContrib >= 10) {
    cohortLevel = "primary";
    cohortValues = primary;
    cohortName = `${marketName} ${focal.quadrant7Cell ?? ""} cohort`.trim();
  } else if (fallback.length + focalContrib >= 10) {
    cohortLevel = "fallback";
    cohortValues = fallback;
    cohortName = `${marketName} ${operatorTypeLabel(focalType)} cohort`;
  } else {
    cohortLevel = "msa";
    cohortValues = msa;
    cohortName = `${marketName} MSA cohort`;
  }

  if (focalValue === null || cohortValues.length === 0) {
    return {
      kind: "vacancy",
      vacancyPct: focalValue,
      dist: {
        cohortLevel,
        cohortName,
        cohortN: cohortValues.length + focalContrib,
        cohortMedian: median(cohortValues),
        focalPercentile: null,
      },
      star: null,
    };
  }

  // Lower-better: focal's percentile is the share of cohort with HIGHER
  // values than focal.
  const allValues = [...cohortValues, focalValue].sort((a, b) => a - b);
  const focalIdx = allValues.indexOf(focalValue);
  const pct =
    allValues.length > 1
      ? ((allValues.length - 1 - focalIdx) / (allValues.length - 1)) * 100
      : 50;

  return {
    kind: "vacancy",
    vacancyPct: focalValue,
    dist: {
      cohortLevel,
      cohortName,
      cohortN: allValues.length,
      cohortMedian: median(allValues),
      focalPercentile: pct,
    },
    star: percentileToStar(pct),
  };
}

// --- Signal 2: Rent Stability (pass-through from v0.6.2 seed) ---
function buildRentStabilitySignal(
  scorecard: ScorecardData
): RentStabilitySignal | null {
  const rs = scorecard.lendingSignals?.rentStability;
  if (!rs) return null;
  return {
    kind: "rentStability",
    volatilityPP: rs.volatilityPP,
    cohortMedianVolatility: rs.cohortMedianVolatility ?? null,
    yearsOfHistory: rs.yearsOfHistory,
    suppressed: rs.suppressed,
    reason: rs.reason,
    star: rs.star,
  };
}

// --- Signal 3: Operator Stability ---
// Composite of yearsVisible (length of observation in our data) plus
// marketCount (cross-market footprint). Star derived from yearsVisible
// percentile within selected cohort. Persistent eligibility is a v0.7
// data-pipeline item (v0.6.2 doesn't seed it).
function buildOperatorStabilitySignal(
  focal: PoolPm,
  focalType: ReturnType<typeof operatorType>,
  pool: PoolPm[],
  marketName: string,
  marketCount: number
): OperatorStabilitySignal | null {
  const yearsVisible =
    focal.scorecard.coverage.yearsVisible ??
    focal.scorecard.tenancy.yearsVisible ??
    null;

  const valuesIn = (filter: (p: PoolPm) => boolean) =>
    pool
      .filter((p) => p.slug !== focal.slug && filter(p))
      .map(
        (p) =>
          p.scorecard.coverage.yearsVisible ??
          p.scorecard.tenancy.yearsVisible ??
          null
      )
      .filter((v): v is number => v !== null && Number.isFinite(v));

  const primary = valuesIn((p) => p.quadrant7Cell === focal.quadrant7Cell);
  const fallback = valuesIn((p) => operatorType(p.quadrant7Cell) === focalType);
  const msa = valuesIn(() => true);

  const focalContrib = yearsVisible !== null ? 1 : 0;
  let cohortLevel: CohortLevel;
  let cohortValues: number[];
  let cohortName: string;

  if (primary.length + focalContrib >= 10) {
    cohortLevel = "primary";
    cohortValues = primary;
    cohortName = `${marketName} ${focal.quadrant7Cell ?? ""} cohort`.trim();
  } else if (fallback.length + focalContrib >= 10) {
    cohortLevel = "fallback";
    cohortValues = fallback;
    cohortName = `${marketName} ${operatorTypeLabel(focalType)} cohort`;
  } else {
    cohortLevel = "msa";
    cohortValues = msa;
    cohortName = `${marketName} MSA cohort`;
  }

  if (yearsVisible === null || cohortValues.length === 0) {
    return {
      kind: "operatorStability",
      yearsVisible,
      marketCount,
      dist: {
        cohortLevel,
        cohortName,
        cohortN: cohortValues.length + focalContrib,
        cohortMedian: median(cohortValues),
        focalPercentile: null,
      },
      star: null,
    };
  }

  // Higher yearsVisible = more favorable.
  const allValues = [...cohortValues, yearsVisible].sort((a, b) => a - b);
  const focalIdx = allValues.indexOf(yearsVisible);
  const pct =
    allValues.length > 1
      ? (focalIdx / (allValues.length - 1)) * 100
      : 50;

  return {
    kind: "operatorStability",
    yearsVisible,
    marketCount,
    dist: {
      cohortLevel,
      cohortName,
      cohortN: allValues.length,
      cohortMedian: median(allValues),
      focalPercentile: pct,
    },
    star: percentileToStar(pct),
  };
}

// --- Signal 4: Geographic Concentration (pass-through, no star) ---
function buildGeographicConcentrationSignal(
  scorecard: ScorecardData
): GeographicConcentrationSignal | null {
  const gc = scorecard.lendingSignals?.geographicConcentration;
  if (!gc) return null;
  return {
    kind: "geographicConcentration",
    top3CityShare: gc.top3CityShare,
    cohortMedianTop3: gc.cohortMedianTop3,
    positionIndicator: gc.linearPositionIndicator,
    cohortLevel: gc.cohortLevel,
  };
}

// --- Signal 5: Pricing Tier ---
// Operator's most recent mix-adjusted median rent compared to MSA rent
// distribution. Latest trajectory quarter is the canonical value (v0.6.2
// seeds 6 quarters of trajectory).
function latestRent(sc: ScorecardData): number | null {
  const traj = sc.rentTrajectory;
  if (!Array.isArray(traj) || traj.length === 0) return null;
  // Pick the most recent quarter by string sort (e.g., "2025Q4" > "2025Q3").
  // The seed emits quarters in ascending order but we don't rely on that.
  const sorted = [...traj].sort((a, b) =>
    (b.quarter || "").localeCompare(a.quarter || "")
  );
  for (const q of sorted) {
    if (typeof q.mixAdjMedian === "number" && q.mixAdjMedian > 0) {
      return q.mixAdjMedian;
    }
  }
  return null;
}

function buildPricingTierSignal(
  focal: PoolPm,
  pool: PoolPm[]
): PricingTierSignal | null {
  const operatorRent = latestRent(focal.scorecard);
  const cohortRents = pool
    .filter((p) => p.slug !== focal.slug)
    .map((p) => latestRent(p.scorecard))
    .filter((v): v is number => v !== null);

  if (operatorRent === null || cohortRents.length === 0) {
    return {
      kind: "pricingTier",
      operatorRent,
      msaP25: cohortRents.length > 0 ? quantile([...cohortRents].sort((a, b) => a - b), 0.25) : null,
      msaP75: cohortRents.length > 0 ? quantile([...cohortRents].sort((a, b) => a - b), 0.75) : null,
      tier: null,
      percentile: null,
    };
  }

  const all = [...cohortRents, operatorRent].sort((a, b) => a - b);
  const focalIdx = all.indexOf(operatorRent);
  const pct =
    all.length > 1
      ? (focalIdx / (all.length - 1)) * 100
      : 50;

  const tier: "premium" | "mid-market" | "value" =
    pct >= 75 ? "premium" : pct < 25 ? "value" : "mid-market";

  return {
    kind: "pricingTier",
    operatorRent,
    msaP25: quantile(all, 0.25),
    msaP75: quantile(all, 0.75),
    tier,
    percentile: pct,
  };
}

// --- Helpers ---

function percentileToStar(pct: number): StarLevel {
  if (pct >= 75) return "gold";
  if (pct >= 50) return "silver";
  return null;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return quantile(sorted, 0.5);
}

function quantile(sortedAsc: number[], q: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedAsc[base + 1] !== undefined) {
    return sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base]);
  }
  return sortedAsc[base];
}
