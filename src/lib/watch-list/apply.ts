// v0.9 — applyWatchList: load every PM from the database, evaluate
// the watch list at two levels of granularity, return both lists.
//
// Two parallel projections:
//   1. results          — one row per PM-market pair (the v0.8
//                          behavior; still used by the "Market view"
//                          toggle).
//   2. operatorResults  — one row per canonical operator, members
//                          aggregated per aggregate.ts rules and
//                          re-scored against the watch list. This is
//                          the v0.9 default view.
//
// A single DB pass feeds both. The CanonicalOperator table is
// queried separately for marketCount lookups; it's tiny (≤ ~50
// rows in production), so the join cost is negligible.

import { prisma } from "@/lib/prisma";
import type { ScorecardData } from "@/lib/types";
import { parseScorecard } from "@/lib/scorecard/parse";
import {
  isMarketEntitled,
  type MarketEntitlement,
} from "@/lib/auth/market-entitlements";
import { type PMRecord } from "./fields";
import {
  evaluateWatchList,
  type WatchListDefinition,
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
  /** True when this row is present only because it was manually
   *  pinned to the watch list (kind: "pinned" membership), not
   *  because it matched the criteria. Display-only — never affects
   *  sorting or entitlement scoping. See unionPinnedRecords below. */
  pinned?: boolean;
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
  /** True when this operator is present only because it (or one of
   *  its member PMs) was manually pinned, not because the rollup
   *  matched the criteria. Display-only. See unionPinnedOperators. */
  pinned?: boolean;
}

export interface TargetListResult {
  watchListId: string;
  watchListName: string;
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

export async function applyWatchList(
  watchList: WatchListDefinition,
  // v0.22 — when provided, only operators in the org's entitled markets
  // are evaluated, so results (per-market and per-operator rollups)
  // never surface operators in markets the org didn't buy. Omit for the
  // unscoped evaluation.
  entitlement?: MarketEntitlement,
  // v0.27 (Task 5) — manually-pinned company keys (canonicalOperatorId
  // ?? pmSlug) for this watch list's "pinned" membership. When
  // provided, a pinned company is unioned into `results`/
  // `operatorResults` even if it didn't match the criteria. ENTITLEMENT
  // SAFETY: the union reads only from `allRecords`/`byCanonical` below,
  // which are built from `rows` — the array already filtered by
  // isMarketEntitled. A pinned key for a company with zero entitled-
  // market rows is simply never encountered by the union step, so it
  // can never surface. See unionPinnedRecords/unionPinnedOperators.
  pinnedKeys?: ReadonlySet<string>
): Promise<TargetListResult> {
  // PM-only universe. Brokers are scored in their own cohort and hidden from
  // the platform's ranked lists by default; a watch list is a ranked target
  // list, so brokers don't belong here (and there's no field to exclude them).
  const allRows = await prisma.pM.findMany({
    where: { operatorType: "pm" },
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
  const rows =
    entitlement === undefined
      ? allRows
      : allRows.filter((r) => isMarketEntitled(entitlement, r.marketId));

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
      scorecard = parseScorecard(row);
    } catch {
      continue; // skip malformed rows defensively
    }
    // Never surface platform rank/composite through the watch list. The whole
    // scorecard blob rides along on each result row (results API + client
    // bundle), so scrub the rank block at this single choke point. The
    // watch-list fit score / fit ordinal are the list's own ranking and stay;
    // nothing in the evaluator or scoring reads scorecard.rank.
    delete (scorecard as { rank?: ScorecardData["rank"] }).rank;
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

  const matchedRaw: RankedTarget[] = [];
  for (const pmRecord of allRecords) {
    const evaluation = evaluateWatchList(pmRecord, watchList);
    if (!evaluation.passed || evaluation.fitScore === null) continue;
    matchedRaw.push({
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
  // Union pinned companies in BEFORE the sort so pinned rows take
  // their natural position by score, same as everything else — the
  // `pinned` flag is purely a display hint (badge), never a sort key.
  const matched = pinnedKeys
    ? unionPinnedRecords(matchedRaw, allRecords, pinnedKeys, watchList, marketNameBySlug)
    : matchedRaw;
  matched.sort((a, b) => {
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    return a.pmSlug.localeCompare(b.pmSlug);
  });

  // Per-operator evaluation (Operator view — v0.9 default).
  // Group every PM (passing or not) by canonical id, aggregate the
  // bucket, then evaluate the aggregate against the watch list. This
  // gives "URUs T12 > 100" the chance to pass on a multi-market
  // operator whose summed URUs clear 100 even when no single market
  // does on its own.
  const byCanonical = groupByCanonical(allRecords);
  const matchedOperatorsRaw: RolledUpTarget[] = [];
  for (const [canonId, bucket] of byCanonical.entries()) {
    const { evaluation, target } = buildRolledUpTarget(
      canonId,
      bucket,
      marketNameBySlug,
      canonicalNameById,
      watchList
    );
    if (!evaluation.passed || evaluation.fitScore === null) continue;
    matchedOperatorsRaw.push({
      ...target,
      fitScore: evaluation.fitScore,
      breakdown: evaluation.breakdown,
    });
  }
  // Union pinned operators in — only keys present in `byCanonical`
  // (built strictly from the entitlement-filtered `allRecords` above)
  // are ever reachable here, so a pinned operator with zero entitled
  // markets is correctly absent.
  const matchedOperators = pinnedKeys
    ? unionPinnedOperators(
        matchedOperatorsRaw,
        byCanonical,
        pinnedKeys,
        watchList,
        marketNameBySlug,
        canonicalNameById
      )
    : matchedOperatorsRaw;
  matchedOperators.sort((a, b) => {
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    return a.canonicalOperatorId.localeCompare(b.canonicalOperatorId);
  });

  return {
    watchListId: watchList.id,
    watchListName: watchList.name,
    generatedAt: new Date().toISOString(),
    totalCandidates: rows.length,
    totalOperators: byCanonical.size,
    matchedCount: matched.length,
    matchedOperatorCount: matchedOperators.length,
    results: matched,
    operatorResults: matchedOperators,
  };
}

// ─── pin union (pure — no I/O) ───────────────────────────────────────
//
// Task 5 (v0.27): a watch list of kind "pinned" lets a user manually
// add companies regardless of whether they match the watch list's
// criteria. These helpers union those pins into the criteria-matched
// results applyWatchList already computed.
//
// ENTITLEMENT SAFETY: every helper below reads exclusively from the
// caller-supplied `allRecords` / `byCanonical`, which applyWatchList
// builds from `rows` — the PM rows already filtered by
// isMarketEntitled (see the `rows = entitlement === undefined ? ... :
// allRows.filter(...)` line above). A pinned key never bypasses that
// filter because these functions have no path to the unfiltered
// `allRows` at all — a pinned company with zero entitled-market rows
// simply never appears in `allRecords`/`byCanonical`, so the loops
// below never encounter it and it is correctly, silently absent.
//
// Extracted as standalone exports (rather than inlined in
// applyWatchList) specifically so they can be unit-tested without a
// database: applyWatchList itself is DB-bound (prisma.pM.findMany),
// but everything past that DB read — evaluation, aggregation, union —
// is pure and deterministic given the same inputs.

/** Union pinned companies into the per-market (Market view) results.
 *  For every record in `allRecords` whose company key
 *  (canonicalOperatorId ?? slug) is pinned and isn't already present
 *  in `matched` (by pmSlug), score it against the watch list and push
 *  it in, flagged `pinned: true`. A pinned multi-market operator
 *  contributes one row per member PM record present in `allRecords` —
 *  i.e. per entitled market only. */
export function unionPinnedRecords(
  matched: RankedTarget[],
  allRecords: PMRecord[],
  pinnedKeys: ReadonlySet<string>,
  watchList: WatchListDefinition,
  marketNameBySlug: ReadonlyMap<string, string>
): RankedTarget[] {
  if (pinnedKeys.size === 0) return matched;
  const alreadyMatched = new Set(matched.map((m) => m.pmSlug));
  const additions: RankedTarget[] = [];
  for (const pmRecord of allRecords) {
    const key = pmRecord.scorecard.canonicalOperatorId ?? pmRecord.slug;
    if (!pinnedKeys.has(key)) continue;
    if (alreadyMatched.has(pmRecord.slug)) continue;
    const evaluation = evaluateWatchList(pmRecord, watchList);
    additions.push({
      pmSlug: pmRecord.slug,
      name: pmRecord.name,
      marketId: pmRecord.marketId,
      marketName: marketNameBySlug.get(pmRecord.slug) ?? pmRecord.marketId,
      canonicalOperatorId: pmRecord.scorecard.canonicalOperatorId ?? null,
      // Sentinel 0 when the record didn't pass — it has no meaningful
      // fit score, but the row still needs a sortable number.
      fitScore: evaluation.fitScore ?? 0,
      breakdown: evaluation.breakdown,
      pm: pmRecord,
      pinned: true,
    });
  }
  return additions.length === 0 ? matched : matched.concat(additions);
}

/** Aggregate one canonical bucket and evaluate it against the watch
 *  list, returning both the evaluation and the non-score fields of a
 *  RolledUpTarget. Shared by the main per-operator loop in
 *  applyWatchList and unionPinnedOperators below so a pinned operator
 *  is scored identically to a naturally-matched one. */
function buildRolledUpTarget(
  canonId: string,
  bucket: PMRecord[],
  marketNameBySlug: ReadonlyMap<string, string>,
  canonicalNameById: ReadonlyMap<string, string>,
  watchList: WatchListDefinition
): {
  evaluation: ReturnType<typeof evaluateRollup>;
  target: Omit<RolledUpTarget, "fitScore" | "breakdown" | "pinned">;
} {
  // Use the per-market marketName lookup so the aggregated record
  // carries human-readable market labels.
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
  const evaluation = evaluateRollup(aggregated, watchList);
  return {
    evaluation,
    target: {
      canonicalOperatorId: canonId,
      canonicalOperatorName: canonicalNameById.get(canonId) ?? aggregated.name,
      memberMarketIds: aggregated.memberMarketIds,
      memberMarketNames: aggregated.memberMarketNames,
      memberPmSlugs: aggregated.memberPmSlugs,
      isRollup: aggregated.isRollup,
      quadrant7CellIsMixed: aggregated.quadrant7CellIsMixed,
      pm: aggregated,
    },
  };
}

/** Union pinned companies into the per-operator (Operator view, v0.9
 *  default) results. For every pinned key present as a bucket key in
 *  `byCanonical` but not already in `matchedOperators`, aggregate the
 *  bucket, evaluate it, and push a RolledUpTarget flagged
 *  `pinned: true`. A pinned key with no bucket in `byCanonical` (i.e.
 *  no entitled-market record contributed to it) is correctly skipped —
 *  it never had a chance to be aggregated in the first place. */
export function unionPinnedOperators(
  matchedOperators: RolledUpTarget[],
  byCanonical: ReadonlyMap<string, PMRecord[]>,
  pinnedKeys: ReadonlySet<string>,
  watchList: WatchListDefinition,
  marketNameBySlug: ReadonlyMap<string, string>,
  canonicalNameById: ReadonlyMap<string, string>
): RolledUpTarget[] {
  if (pinnedKeys.size === 0) return matchedOperators;
  const alreadyMatched = new Set(
    matchedOperators.map((m) => m.canonicalOperatorId)
  );
  const additions: RolledUpTarget[] = [];
  for (const key of pinnedKeys) {
    if (alreadyMatched.has(key)) continue;
    const bucket = byCanonical.get(key);
    if (!bucket || bucket.length === 0) continue;
    const { evaluation, target } = buildRolledUpTarget(
      key,
      bucket,
      marketNameBySlug,
      canonicalNameById,
      watchList
    );
    additions.push({
      ...target,
      fitScore: evaluation.fitScore ?? 0,
      breakdown: evaluation.breakdown,
      pinned: true,
    });
  }
  return additions.length === 0
    ? matchedOperators
    : matchedOperators.concat(additions);
}
