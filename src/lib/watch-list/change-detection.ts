// v0.16 — Watch list change-detection diff library.
//
// Given two snapshots of the same operator — `prior` (the snapshot
// closest to but not after the user's last viewedAt) and `current`
// (the latest snapshot) — compute the list of OperatorChanges that
// surface in the banner + the /changes detail table.
//
// Pure functions, no I/O. The Prisma reads that fetch the two
// snapshots live in src/app/watch-lists/[id]/results/page.tsx (and
// the parallel /changes route). Keeping the diff pure makes it
// trivially testable and keeps the methodology rules out of the
// request path.
//
// Signal rules — all from the v1 spec, no methodology reinterpretation:
//
//   - star.change           any cell in starsPerMetric differs
//   - portfolio.band        estimatedPortfolioBand changes (tier
//                           transition, or estimated → not / vice versa)
//   - portfolio.size        estimatedPortfolioPoint moves ≥20%
//   - market.added/dropped  topMSAs set delta
//   - submarket.added/dropped  topSubmarkets set delta
//   - concession.transition  concessionRate presence flips (null ↔ value)
//   - concession.shift       concessionRate moves ≥5 percentage points
//   - eligibility.flip      isEligibleForRanking flips
//
// "≥X%" rules are intentionally LOOSE — surface true signal, not
// every wiggle. Tight thresholds belong in v2 with per-user
// customisation.

import type {
  SnapshotRow,
  StarsPerMetric,
} from "./snapshot";

/** All change types the diff can produce. */
export type ChangeType =
  | "star"
  | "portfolio_band"
  | "portfolio_size"
  | "market_added"
  | "market_dropped"
  | "submarket_added"
  | "submarket_dropped"
  | "concession_transition"
  | "concession_shift"
  | "eligibility_flip";

/** Discriminated union — one variant per change type. The detail-row
 *  renderer pattern-matches on `type` and reads the right "before /
 *  after" pair off the variant. */
export type OperatorChange =
  | {
      type: "star";
      /** Which of the five metrics changed. Business label, not the
       *  scorecard JSON field name. */
      metric: keyof StarsPerMetric;
      before: StarLevel | null;
      after: StarLevel | null;
    }
  | { type: "portfolio_band"; before: string | null; after: string | null }
  | { type: "portfolio_size"; before: number | null; after: number | null; pctChange: number }
  | { type: "market_added"; marketId: string }
  | { type: "market_dropped"; marketId: string }
  | { type: "submarket_added"; submarketSlug: string }
  | { type: "submarket_dropped"; submarketSlug: string }
  | {
      type: "concession_transition";
      direction: "appeared" | "cleared";
      before: number | null;
      after: number | null;
    }
  | { type: "concession_shift"; before: number; after: number; deltaPp: number }
  | { type: "eligibility_flip"; direction: "entered" | "exited" };

type StarLevel = "gold" | "silver" | null;

/** Concession-rate change threshold in percentage points. ≥5pp
 *  surfaces as a "shift" change; smaller movements are below the
 *  noise floor for v1. */
export const CONCESSION_SHIFT_THRESHOLD_PP = 5;

/** Portfolio point change threshold as a fraction. ≥20% in either
 *  direction surfaces; smaller movements ride the band-change
 *  signal (which catches confidence-tier transitions independently). */
export const PORTFOLIO_SIZE_THRESHOLD_PCT = 0.2;

/** All five metric keys, in the order the banner + detail table
 *  iterate them. Order matters for deterministic output across
 *  test runs and across operators in the same banner. */
const METRIC_KEYS: Array<keyof StarsPerMetric> = [
  "leaseUp",
  "tenancy",
  "rentPerformance",
  "marketingDiscipline",
  "inventoryTransparency",
];

/**
 * Diff two snapshots of the same operator.
 *
 * Returns the list of OperatorChanges between `prior` and `current`.
 * An empty list means no surface-worthy movement — the operator
 * does not appear in the banner or the detail table.
 *
 * Pre-condition: both arguments are snapshots of the same `pmSlug`.
 * The caller is responsible for selecting `prior` (closest to but
 * not after the user's last viewedAt) and `current` (the most
 * recent snapshot). Passing snapshots of different operators is a
 * caller bug; this function does not verify pmSlug matches.
 */
export function diffSnapshots(
  prior: SnapshotRow,
  current: SnapshotRow
): OperatorChange[] {
  const changes: OperatorChange[] = [];

  // Star changes — one per metric that flipped tier (including
  // gold→silver, gold→null, null→silver, etc.).
  for (const metric of METRIC_KEYS) {
    const before = prior.starsPerMetric[metric];
    const after = current.starsPerMetric[metric];
    if (before !== after) {
      changes.push({ type: "star", metric, before, after });
    }
  }

  // Portfolio band — confidence tier change OR transition in/out of
  // 'estimated' mode (both surface as a band change here).
  if (prior.estimatedPortfolioBand !== current.estimatedPortfolioBand) {
    changes.push({
      type: "portfolio_band",
      before: prior.estimatedPortfolioBand,
      after: current.estimatedPortfolioBand,
    });
  }

  // Portfolio size — ≥20% point movement, but only when BOTH
  // snapshots carry an estimate (transitions in/out of estimated
  // already surface as a band change above, no need to double-count).
  if (
    typeof prior.estimatedPortfolioPoint === "number" &&
    typeof current.estimatedPortfolioPoint === "number" &&
    prior.estimatedPortfolioPoint > 0
  ) {
    const pctChange =
      (current.estimatedPortfolioPoint - prior.estimatedPortfolioPoint) /
      prior.estimatedPortfolioPoint;
    if (Math.abs(pctChange) >= PORTFOLIO_SIZE_THRESHOLD_PCT) {
      changes.push({
        type: "portfolio_size",
        before: prior.estimatedPortfolioPoint,
        after: current.estimatedPortfolioPoint,
        pctChange,
      });
    }
  }

  // Market coverage — set delta on topMSAs. Each added / dropped MSA
  // gets its own row so the banner count + detail table both have
  // per-market granularity.
  const priorMSAs = new Set(prior.topMSAs);
  const currentMSAs = new Set(current.topMSAs);
  for (const msa of currentMSAs) {
    if (!priorMSAs.has(msa)) {
      changes.push({ type: "market_added", marketId: msa });
    }
  }
  for (const msa of priorMSAs) {
    if (!currentMSAs.has(msa)) {
      changes.push({ type: "market_dropped", marketId: msa });
    }
  }

  // Submarket coverage — same pattern, on topSubmarkets.
  const priorSubmarkets = new Set(prior.topSubmarkets);
  const currentSubmarkets = new Set(current.topSubmarkets);
  for (const sm of currentSubmarkets) {
    if (!priorSubmarkets.has(sm)) {
      changes.push({ type: "submarket_added", submarketSlug: sm });
    }
  }
  for (const sm of priorSubmarkets) {
    if (!currentSubmarkets.has(sm)) {
      changes.push({ type: "submarket_dropped", submarketSlug: sm });
    }
  }

  // Concession — two signal types, exclusive:
  //   transition: null ↔ number (operator started or stopped showing
  //               concession activity in the T12 window)
  //   shift:      both sides are numbers, |delta| ≥ 5pp
  const priorHas = prior.concessionRate !== null;
  const currentHas = current.concessionRate !== null;
  if (priorHas !== currentHas) {
    changes.push({
      type: "concession_transition",
      direction: currentHas ? "appeared" : "cleared",
      before: prior.concessionRate,
      after: current.concessionRate,
    });
  } else if (priorHas && currentHas) {
    // Both are numbers — safe to subtract. ConcessionRate is stored
    // as a 0..1 decimal, so multiply by 100 to get percentage points.
    const before = prior.concessionRate as number;
    const after = current.concessionRate as number;
    const deltaPp = (after - before) * 100;
    if (Math.abs(deltaPp) >= CONCESSION_SHIFT_THRESHOLD_PP) {
      changes.push({ type: "concession_shift", before, after, deltaPp });
    }
  }

  // Eligibility — boolean flip. Direction tells the renderer which
  // word to surface ("entered ranking" vs "exited ranking").
  if (prior.isEligibleForRanking !== current.isEligibleForRanking) {
    changes.push({
      type: "eligibility_flip",
      direction: current.isEligibleForRanking ? "entered" : "exited",
    });
  }

  return changes;
}

/** Aggregate counts surfaced in the banner copy ("3 operators moved
 *  since your last visit · 2 star changes, 1 portfolio shift, 1 new
 *  market entry"). Drives both the headline operator count and the
 *  per-type breakdown below it. */
export interface ChangeBreakdown {
  /** Distinct operators with at least one change. */
  operatorCount: number;
  /** Total change count across all operators (sum of changes.length). */
  totalChanges: number;
  /** Number of star-tier changes across all operators. */
  starChanges: number;
  /** Number of portfolio-band + portfolio-size changes combined.
   *  The banner surfaces these as a single "portfolio shift"
   *  category — separating them into two breakdown rows would
   *  bloat the copy without adding scannable signal. */
  portfolioChanges: number;
  /** Net market entries — added markets across all operators. Dropped
   *  markets are aggregated separately as marketDrops for symmetry. */
  marketEntries: number;
  marketDrops: number;
  submarketChanges: number;
  concessionChanges: number;
  eligibilityChanges: number;
}

/** Roll a Map<pmSlug, OperatorChange[]> up into the banner-shaped
 *  breakdown. Operators with zero changes are ignored — only the
 *  ones that actually moved count toward operatorCount. */
export function summariseChanges(
  changesByOperator: Map<string, OperatorChange[]>
): ChangeBreakdown {
  let operatorCount = 0;
  let totalChanges = 0;
  let starChanges = 0;
  let portfolioChanges = 0;
  let marketEntries = 0;
  let marketDrops = 0;
  let submarketChanges = 0;
  let concessionChanges = 0;
  let eligibilityChanges = 0;

  for (const changes of changesByOperator.values()) {
    if (changes.length === 0) continue;
    operatorCount++;
    totalChanges += changes.length;
    for (const c of changes) {
      switch (c.type) {
        case "star":
          starChanges++;
          break;
        case "portfolio_band":
        case "portfolio_size":
          portfolioChanges++;
          break;
        case "market_added":
          marketEntries++;
          break;
        case "market_dropped":
          marketDrops++;
          break;
        case "submarket_added":
        case "submarket_dropped":
          submarketChanges++;
          break;
        case "concession_transition":
        case "concession_shift":
          concessionChanges++;
          break;
        case "eligibility_flip":
          eligibilityChanges++;
          break;
      }
    }
  }

  return {
    operatorCount,
    totalChanges,
    starChanges,
    portfolioChanges,
    marketEntries,
    marketDrops,
    submarketChanges,
    concessionChanges,
    eligibilityChanges,
  };
}
