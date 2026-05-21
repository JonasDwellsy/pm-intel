// v0.9 — applyBuyBox: load every PM from the database, evaluate
// the buy box at two levels of granularity, return both lists.
//
// Two parallel projections:
//   1. results          — one row per PM-market pair (the v0.8
//                          behavior; still used by the "Market view"
//                          toggle).
//   2. operatorResults  — one row per canonical operator, members
//                          aggregated per aggregate.ts rules and
//                          re-scored against the buy box. This is
//                          the v0.9 default view.
//
// A single DB pass feeds both. The CanonicalOperator table is
// queried separately for marketCount lookups; it's tiny (≤ ~50
// rows in production), so the join cost is negligible.

import { prisma } from "@/lib/prisma";
import type { ScorecardData } from "@/lib/types";
import { type PMRecord } from "./fields";
import {
  evaluateBuyBox,
  type BuyBoxDefinition,
  type ScoreBreakdown,
} from "./scoring";
import {
  aggregateRecords,
  evaluateRollup,
  groupByCanonical,
  type AggregatedPMRecord,
} from "./aggregate";

export interface RankedTarget {
  pmSlug: string;
  name: string;
  marketId: string;
  marketName: string;
  canonicalOperatorId: string | null;
  fitScore: number;
  breakdown: ScoreBreakdown;
  /** Full PM payload for drill-down rendering. */
  pm: PMRecord;
}

export interface RolledUpTarget {
  /** Stable identifier — the canonicalOperatorId for multi-market
   *  operators, the PM slug for single-market ones (matches the
   *  canonicalOperatorId fallback convention from v0.6.4 seeds). */
  canonicalOperatorId: string;
  canonicalOperatorName: string;
  /** All member markets contributing to the aggregation, in stable
   *  alphabetical order. */
  memberMarketIds: string[];
  memberMarketNames: string[];
  memberPmSlugs: string[];
  /** True when more than one market contributes. Drives the
   *  "Multi-market · N" badge + the market-picker drill-through. */
  isRollup: boolean;
  quadrant7CellIsMixed: boolean;
  fitScore: number;
  breakdown: ScoreBreakdown;
  /** Already-aggregated PM payload — every field the results-view
   *  projector reads is the rolled-up value. */
  pm: AggregatedPMRecord;
}

export interface TargetListResult {
  buyBoxId: string;
  buyBoxName: string;
  generatedAt: string;
  /** Total PM-market pairs evaluated (all rows in the PM table). */
  totalCandidates: number;
  /** Total canonical operators evaluated (after grouping). */
  totalOperators: number;
  /** PM-market pairs that passed required + survived excluded. */
  matchedCount: number;
  /** Canonical operators with a passing rollup. */
  matchedOperatorCount: number;
  /** Per-market matched rows, sorted by fitScore desc with a
   *  pmSlug tiebreaker. */
  results: RankedTarget[];
  /** Per-operator rolled-up rows, sorted by fitScore desc with a
   *  canonicalOperatorId tiebreaker. */
  operatorResults: RolledUpTarget[];
}

export async function applyBuyBox(
  buyBox: BuyBoxDefinition
): Promise<TargetListResult> {
  const rows = await prisma.pM.findMany({
    select: {
      slug: true,
      name: true,
      marketId: true,
      claimed: true,
      canonicalOperatorId: true,
      scorecardData: true,
      market: { select: { fullName: true } },
    },
  });

  const canonicals = await prisma.canonicalOperator.findMany({
    select: { canonicalSlug: true, canonicalName: true, marketCount: true },
  });
  const marketCountByCanonical = new Map<string, number>();
  const canonicalNameById = new Map<string, string>();
  for (const c of canonicals) {
    marketCountByCanonical.set(c.canonicalSlug, c.marketCount);
    canonicalNameById.set(c.canonicalSlug, c.canonicalName);
  }

  // Pass 1: parse every PM into PMRecord shape. We keep the whole
  // set in memory because BOTH projections (per-market + per-operator)
  // need it.
  const allRecords: PMRecord[] = [];
  for (const row of rows) {
    let scorecard: ScorecardData;
    try {
      scorecard = JSON.parse(row.scorecardData) as ScorecardData;
    } catch {
      continue; // skip malformed rows defensively
    }
    const canonId = row.canonicalOperatorId ?? null;
    const marketCount = canonId
      ? marketCountByCanonical.get(canonId) ?? 1
      : 1;
    allRecords.push({
      slug: row.slug,
      name: row.name,
      marketId: row.marketId,
      claimed: row.claimed,
      marketCount,
      scorecard,
    });
  }

  // Per-market evaluation (Market view).
  const marketNameBySlug = new Map<string, string>();
  for (const row of rows) marketNameBySlug.set(row.slug, row.market.fullName);

  const matched: RankedTarget[] = [];
  for (const pmRecord of allRecords) {
    const evaluation = evaluateBuyBox(pmRecord, buyBox);
    if (!evaluation.passed || evaluation.fitScore === null) continue;
    matched.push({
      pmSlug: pmRecord.slug,
      name: pmRecord.name,
      marketId: pmRecord.marketId,
      marketName: marketNameBySlug.get(pmRecord.slug) ?? pmRecord.marketId,
      canonicalOperatorId: pmRecord.scorecard.canonicalOperatorId ?? null,
      fitScore: evaluation.fitScore,
      breakdown: evaluation.breakdown,
      pm: pmRecord,
    });
  }
  matched.sort((a, b) => {
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    return a.pmSlug.localeCompare(b.pmSlug);
  });

  // Per-operator evaluation (Operator view — v0.9 default).
  // Group every PM (passing or not) by canonical id, aggregate the
  // bucket, then evaluate the aggregate against the buy box. This
  // gives "URUs T12 > 100" the chance to pass on a multi-market
  // operator whose summed URUs clear 100 even when no single market
  // does on its own.
  const byCanonical = groupByCanonical(allRecords);
  const matchedOperators: RolledUpTarget[] = [];
  for (const [canonId, bucket] of byCanonical.entries()) {
    // Use the per-market marketName lookup we built above so the
    // aggregated record carries human-readable market labels.
    const enrichedBucket: PMRecord[] = bucket.map((b) => ({
      ...b,
      scorecard: {
        ...b.scorecard,
        market: {
          ...b.scorecard.market,
          fullName:
            marketNameBySlug.get(b.slug) ??
            b.scorecard.market?.fullName ??
            b.marketId,
        },
      },
    }));
    const aggregated = aggregateRecords(enrichedBucket);
    const evaluation = evaluateRollup(aggregated, buyBox);
    if (!evaluation.passed || evaluation.fitScore === null) continue;
    matchedOperators.push({
      canonicalOperatorId: canonId,
      canonicalOperatorName:
        canonicalNameById.get(canonId) ?? aggregated.name,
      memberMarketIds: aggregated.memberMarketIds,
      memberMarketNames: aggregated.memberMarketNames,
      memberPmSlugs: aggregated.memberPmSlugs,
      isRollup: aggregated.isRollup,
      quadrant7CellIsMixed: aggregated.quadrant7CellIsMixed,
      fitScore: evaluation.fitScore,
      breakdown: evaluation.breakdown,
      pm: aggregated,
    });
  }
  matchedOperators.sort((a, b) => {
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    return a.canonicalOperatorId.localeCompare(b.canonicalOperatorId);
  });

  return {
    buyBoxId: buyBox.id,
    buyBoxName: buyBox.name,
    generatedAt: new Date().toISOString(),
    totalCandidates: rows.length,
    totalOperators: byCanonical.size,
    matchedCount: matched.length,
    matchedOperatorCount: matchedOperators.length,
    results: matched,
    operatorResults: matchedOperators,
  };
}
