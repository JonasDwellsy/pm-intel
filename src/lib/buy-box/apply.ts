// v0.8 — applyBuyBox: load every PM from the database, build the
// PMRecord shape the evaluator expects, score against the buy box,
// return a ranked target list.
//
// Single DB pass per call. The PM table carries the row-level
// `claimed` bit + the canonicalOperatorId; the parsed scorecardData
// blob carries everything else (including the v0.7 portfolioEstimate
// baked at seed time). marketCount comes from the CanonicalOperator
// table for multi-market entities — single-market operators get
// marketCount=1 from the v0.6.4 convention (canonicalOperatorId ===
// pm.slug means a single-market entry).

import { prisma } from "@/lib/prisma";
import type { ScorecardData } from "@/lib/types";
import { type PMRecord } from "./fields";
import {
  evaluateBuyBox,
  type BuyBoxDefinition,
  type ScoreBreakdown,
} from "./scoring";

export interface RankedTarget {
  pmSlug: string;
  name: string;
  marketId: string;
  marketName: string;
  canonicalOperatorId: string | null;
  fitScore: number;
  breakdown: ScoreBreakdown;
  /** Full PM payload for drill-down rendering in the future results
   *  table. Includes the parsed scorecard so callers don't need to
   *  re-fetch + re-parse for the row-level columns. */
  pm: PMRecord;
}

export interface TargetListResult {
  buyBoxId: string;
  buyBoxName: string;
  generatedAt: string;
  /** Total operators evaluated (all PMs in the database). */
  totalCandidates: number;
  /** Count that passed required + survived excluded. */
  matchedCount: number;
  /** Sorted by fitScore desc (stable tiebreaker on pmSlug for
   *  deterministic output across requests). */
  results: RankedTarget[];
}

export async function applyBuyBox(
  buyBox: BuyBoxDefinition
): Promise<TargetListResult> {
  // Single-query load of every PM. The scorecardData JSON is large
  // (~10-50KB each) but we need it for evaluation; consumers in the
  // existing app already pay this cost on the market view loaders.
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

  // Build a lookup of canonical marketCount so we can fill PMRecord
  // without a per-row DB hit. The CanonicalOperator table only carries
  // multi-market entities; anyone not in the map is single-market
  // (marketCount = 1 per the v0.6.4 convention).
  const canonicals = await prisma.canonicalOperator.findMany({
    select: { canonicalSlug: true, marketCount: true },
  });
  const marketCountByCanonical = new Map<string, number>();
  for (const c of canonicals) marketCountByCanonical.set(c.canonicalSlug, c.marketCount);

  const matched: RankedTarget[] = [];
  for (const row of rows) {
    let scorecard: ScorecardData;
    try {
      scorecard = JSON.parse(row.scorecardData) as ScorecardData;
    } catch {
      // Skip rows with malformed scorecard JSON rather than crash the
      // whole apply pass. Logging would surface a real issue; this
      // path is defensive.
      continue;
    }
    const canonId = row.canonicalOperatorId ?? null;
    // marketCount: lookup table for multi-market entities, fallback to
    // 1 for single-market operators (their canonicalOperatorId === slug
    // per the v0.6.4 seed convention).
    const marketCount = canonId
      ? marketCountByCanonical.get(canonId) ?? 1
      : 1;

    const pmRecord: PMRecord = {
      slug: row.slug,
      name: row.name,
      marketId: row.marketId,
      claimed: row.claimed,
      marketCount,
      scorecard,
    };

    const evaluation = evaluateBuyBox(pmRecord, buyBox);
    if (!evaluation.passed || evaluation.fitScore === null) continue;

    matched.push({
      pmSlug: row.slug,
      name: row.name,
      marketId: row.marketId,
      marketName: row.market.fullName,
      canonicalOperatorId: canonId,
      fitScore: evaluation.fitScore,
      breakdown: evaluation.breakdown,
      pm: pmRecord,
    });
  }

  // Sort by fit score desc, stable on slug for deterministic results
  // across re-applies (so the UI's row order doesn't shuffle on every
  // page refresh).
  matched.sort((a, b) => {
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    return a.pmSlug.localeCompare(b.pmSlug);
  });

  return {
    buyBoxId: buyBox.id,
    buyBoxName: buyBox.name,
    generatedAt: new Date().toISOString(),
    totalCandidates: rows.length,
    matchedCount: matched.length,
    results: matched,
  };
}
