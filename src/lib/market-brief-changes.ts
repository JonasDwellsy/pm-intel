// Market-brief "since last period" change block. Pure + testable — given two
// snapshot sets (prior + current) for a market's operators, roll up the moves
// that matter at the market level: new entrants, rating gains/losses, size
// swings, and cohort reclassifications. The impure snapshot loading lives in
// market-brief.ts; this module has no I/O.
//
// Distinct from the watch-list diff (change-detection.ts): that produces
// per-operator, per-metric OperatorChange rows for one user's list; this
// produces a market-wide, top-N rollup for the brief narrative. Both read the
// same SnapshotRow shape.

import type { SnapshotRow } from "./watch-list/snapshot";

/** Portfolio point move that counts as a "swing" (mirrors change-detection). */
const SIZE_SWING_PCT = 0.2;
/** Cap each list so the brief stays scannable. */
const TOP_N = 5;

export interface OperatorRef {
  pmSlug: string;
  name: string;
}
export interface RatingMove extends OperatorRef {
  goldBefore: number;
  goldAfter: number;
}
export interface SizeSwing extends OperatorRef {
  before: number;
  after: number;
  pctChange: number; // signed fraction
}
export interface CohortMove extends OperatorRef {
  before: string;
  after: string;
}

export interface MarketChangeSummary {
  priorDate: string; // ISO date (yyyy-mm-dd)
  currentDate: string;
  newEntrants: OperatorRef[];
  ratingUp: RatingMove[];
  ratingDown: RatingMove[];
  sizeSwings: SizeSwing[];
  cohortMoves: CohortMove[];
  /** True when nothing surfaced — the prose can say "little changed". */
  isQuiet: boolean;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Roll up market-level change between two snapshot dates. `prior` / `current`
 * are the SnapshotRows for one market's operators at the two dates; `names`
 * maps pmSlug → display name. Returns null when there is no prior period to
 * compare against (first snapshot) — the brief then omits the change block.
 *
 * Rating / size / cohort moves are considered only for operators eligible in
 * the CURRENT snapshot (the ranked set the brief covers). New entrants are
 * operators that became eligible this period.
 */
export function buildMarketChangeSummary(
  prior: SnapshotRow[],
  current: SnapshotRow[],
  names: Map<string, string>,
): MarketChangeSummary | null {
  if (prior.length === 0 || current.length === 0) return null;

  const priorBySlug = new Map(prior.map((r) => [r.pmSlug, r]));
  const nameOf = (slug: string) => names.get(slug) ?? slug;

  const newEntrants: OperatorRef[] = [];
  const ratingUp: RatingMove[] = [];
  const ratingDown: RatingMove[] = [];
  const sizeSwings: SizeSwing[] = [];
  const cohortMoves: CohortMove[] = [];

  for (const cur of current) {
    const prev = priorBySlug.get(cur.pmSlug);
    const ref: OperatorRef = { pmSlug: cur.pmSlug, name: nameOf(cur.pmSlug) };

    // New entrant: eligible now, and either absent before or not-yet-eligible.
    if (cur.isEligibleForRanking && (!prev || !prev.isEligibleForRanking)) {
      newEntrants.push(ref);
    }

    // The remaining signals compare two eligible-ranked observations.
    if (!prev || !cur.isEligibleForRanking || !prev.isEligibleForRanking) continue;

    if (cur.starGoldCount !== prev.starGoldCount) {
      const move: RatingMove = {
        ...ref,
        goldBefore: prev.starGoldCount,
        goldAfter: cur.starGoldCount,
      };
      (cur.starGoldCount > prev.starGoldCount ? ratingUp : ratingDown).push(move);
    }

    if (
      typeof prev.estimatedPortfolioPoint === "number" &&
      typeof cur.estimatedPortfolioPoint === "number" &&
      prev.estimatedPortfolioPoint > 0
    ) {
      const pct =
        (cur.estimatedPortfolioPoint - prev.estimatedPortfolioPoint) /
        prev.estimatedPortfolioPoint;
      if (Math.abs(pct) >= SIZE_SWING_PCT) {
        sizeSwings.push({
          ...ref,
          before: prev.estimatedPortfolioPoint,
          after: cur.estimatedPortfolioPoint,
          pctChange: pct,
        });
      }
    }

    if (
      prev.quadrant7Cell &&
      cur.quadrant7Cell &&
      prev.quadrant7Cell !== cur.quadrant7Cell
    ) {
      cohortMoves.push({
        ...ref,
        before: prev.quadrant7Cell,
        after: cur.quadrant7Cell,
      });
    }
  }

  // Rank by magnitude, keep the top N of each.
  ratingUp.sort((a, b) => b.goldAfter - b.goldBefore - (a.goldAfter - a.goldBefore));
  ratingDown.sort((a, b) => a.goldAfter - a.goldBefore - (b.goldAfter - b.goldBefore));
  sizeSwings.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));

  const summary: MarketChangeSummary = {
    priorDate: isoDate(prior[0].snapshotDate),
    currentDate: isoDate(current[0].snapshotDate),
    newEntrants: newEntrants.slice(0, TOP_N),
    ratingUp: ratingUp.slice(0, TOP_N),
    ratingDown: ratingDown.slice(0, TOP_N),
    sizeSwings: sizeSwings.slice(0, TOP_N),
    cohortMoves: cohortMoves.slice(0, TOP_N),
    isQuiet: false,
  };
  summary.isQuiet =
    summary.newEntrants.length === 0 &&
    summary.ratingUp.length === 0 &&
    summary.ratingDown.length === 0 &&
    summary.sizeSwings.length === 0 &&
    summary.cohortMoves.length === 0;
  return summary;
}
