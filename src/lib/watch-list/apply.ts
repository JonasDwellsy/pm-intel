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
   *  pinned to the watch list (WatchListMember membership), not
   *  because it matched the criteria. Display-only — never affects
   *  sorting or entitlement scoping. See unionPinnedRecords below. */
  pinned?: boolean;
  /** True when this row passed the watch list's criteria. A row may be
   *  both matched and pinned (→ "Pinned + matches"). Display-only. */
  matched?: boolean;
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
  /** True when this row passed the watch list's criteria. A row may be
   *  both matched and pinned (→ "Pinned + matches"). Display-only. */
  matched?: boolean;
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
  pinnedKeys?: ReadonlySet<string>,
  // True for a pins-only list (no criteria). Such a list's
  // requiredCriteria/preferredCriteria/excludedCriteria are all empty,
  // and an EMPTY criteria set trivially "passes" every operator in the
  // universe (see scoring.ts: no required criteria to fail, no excluded
  // criteria to veto, fitScore defaults to 100 with no preferred
  // criteria). Left unguarded, a pins-only list's natural criteria-match
  // loop below would silently include the ENTIRE operator universe as
  // "matched" — which both misrepresents the list's membership (the
  // index's "N companies" would then bear no relation to what
  // /results actually renders) and, more importantly, would make the
  // `pinned` flag near-meaningless: unionPinnedRecords/unionPinnedOperators
  // flip `pinned: true` onto a pinned key's existing row when it's
  // already in the naturally-matched set, and with an empty criteria
  // set literally EVERY row is already "naturally matched" — so every
  // row in the universe would flip to `pinned: true`, not just the
  // ones the user actually pinned. So skipCriteriaMatch bypasses the
  // natural loops entirely for a pins-only list — the results consist
  // purely of the pin union, every row correctly flagged
  // `pinned: true` (and only those rows). Lists WITH criteria (smart or
  // hybrid) — including a deliberately blank "Start from Scratch" one
  // that hasn't gained criteria yet — pass false here, preserving the
  // "empty criteria matches everyone" behavior. Callers derive this via
  // shouldSkipCriteriaMatch() (= !hasCriteria), never a stored column.
  skipCriteriaMatch?: boolean
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

  const matchedRaw = computeCriteriaMatchedRecords(
    allRecords,
    watchList,
    marketNameBySlug,
    skipCriteriaMatch ?? false
  );
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
  const matchedOperatorsRaw = computeCriteriaMatchedOperators(
    byCanonical,
    watchList,
    marketNameBySlug,
    canonicalNameById,
    skipCriteriaMatch ?? false
  );
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
// Task 5 (v0.27): manual pins let a user add companies to a watch list
// regardless of whether they match the list's criteria. These helpers
// union those pins into the criteria-matched results applyWatchList
// already computed.
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
//
// v0.28 (Task 7): computeCriteriaMatchedRecords/computeCriteriaMatchedOperators
// below gate the NATURAL (non-pinned) match loops on `skipCriteriaMatch` —
// see applyWatchList's doc comment for why a pins-only list
// (empty criteria) needs this bypass for the `pinned` flag
// to ever be meaningful.

/** Natural per-market (Market view) criteria match — evaluates every
 *  record in `allRecords` against `watchList` and keeps the ones that
 *  pass. Returns `[]` unconditionally when `skipCriteriaMatch` is true:
 *  a pins-only list's criteria are empty, and
 *  an empty required/excluded set trivially passes everyone (see
 *  scoring.ts) — running this loop for such a list would make the
 *  entire operator universe "matched", and since unionPinnedRecords now
 *  flips `pinned: true` on any pinned key that overlaps an already-
 *  matched row, that would flip `pinned: true` on EVERY row in the
 *  universe, not just the ones the user actually pinned. Extracted as
 *  a pure, exported function so this gate is unit-testable without a
 *  database. */
export function computeCriteriaMatchedRecords(
  allRecords: PMRecord[],
  watchList: WatchListDefinition,
  marketNameBySlug: ReadonlyMap<string, string>,
  skipCriteriaMatch: boolean
): RankedTarget[] {
  if (skipCriteriaMatch) return [];
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
      matched: true,
    });
  }
  return matchedRaw;
}

/** Union pinned companies into the per-market (Market view) results.
 *  For every record in `allRecords` whose company key
 *  (canonicalOperatorId ?? slug) is pinned: if that pmSlug is already
 *  present in `matched` (a natural criteria match), flip that existing
 *  row's `pinned` to `true` in place (→ "Pinned + matches") rather than
 *  adding a duplicate. Otherwise score it against the watch list and
 *  push a NEW row in, flagged `pinned: true` (matched left falsy). A
 *  pinned multi-market operator contributes one row per member PM
 *  record present in `allRecords` — i.e. per entitled market only. */
export function unionPinnedRecords(
  matched: RankedTarget[],
  allRecords: PMRecord[],
  pinnedKeys: ReadonlySet<string>,
  watchList: WatchListDefinition,
  marketNameBySlug: ReadonlyMap<string, string>
): RankedTarget[] {
  if (pinnedKeys.size === 0) return matched;
  // Map by pmSlug so a pinned key that's ALSO a natural criteria match
  // flips that existing row's `pinned` flag (→ "Pinned + matches")
  // rather than being dropped. Only un-matched pinned keys become new
  // rows (pinned:true, matched left falsy).
  const matchedBySlug = new Map(matched.map((m) => [m.pmSlug, m]));
  const additions: RankedTarget[] = [];
  for (const pmRecord of allRecords) {
    const key = pmRecord.scorecard.canonicalOperatorId ?? pmRecord.slug;
    if (!pinnedKeys.has(key)) continue;
    const existing = matchedBySlug.get(pmRecord.slug);
    if (existing) {
      existing.pinned = true;
      continue;
    }
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

/** Natural per-operator (Operator view) criteria match — aggregates
 *  every bucket in `byCanonical` and evaluates it against `watchList`,
 *  keeping the ones that pass. Returns `[]` unconditionally when
 *  `skipCriteriaMatch` is true, for the same reason as
 *  computeCriteriaMatchedRecords above: a pick list's empty criteria
 *  would otherwise roll up as "matched" for the entire operator
 *  universe, and since unionPinnedOperators now flips `pinned: true`
 *  on any pinned key that overlaps an already-matched operator, that
 *  would flip `pinned: true` on EVERY operator in the universe, not
 *  just the ones the user actually pinned. */
export function computeCriteriaMatchedOperators(
  byCanonical: ReadonlyMap<string, PMRecord[]>,
  watchList: WatchListDefinition,
  marketNameBySlug: ReadonlyMap<string, string>,
  canonicalNameById: ReadonlyMap<string, string>,
  skipCriteriaMatch: boolean
): RolledUpTarget[] {
  if (skipCriteriaMatch) return [];
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
      matched: true,
    });
  }
  return matchedOperatorsRaw;
}

/** Union pinned companies into the per-operator (Operator view, v0.9
 *  default) results. For every pinned key present as a bucket key in
 *  `byCanonical`: if that key is already present in `matchedOperators`
 *  (a natural criteria match), flip that existing row's `pinned` to
 *  `true` in place (→ "Pinned + matches") rather than adding a
 *  duplicate. Otherwise aggregate the bucket, evaluate it, and push a
 *  NEW RolledUpTarget flagged `pinned: true` (matched left falsy). A
 *  pinned key with no bucket in `byCanonical` (i.e. no entitled-market
 *  record contributed to it) is correctly skipped — it never had a
 *  chance to be aggregated in the first place. */
export function unionPinnedOperators(
  matchedOperators: RolledUpTarget[],
  byCanonical: ReadonlyMap<string, PMRecord[]>,
  pinnedKeys: ReadonlySet<string>,
  watchList: WatchListDefinition,
  marketNameBySlug: ReadonlyMap<string, string>,
  canonicalNameById: ReadonlyMap<string, string>
): RolledUpTarget[] {
  if (pinnedKeys.size === 0) return matchedOperators;
  const matchedById = new Map(
    matchedOperators.map((m) => [m.canonicalOperatorId, m])
  );
  const additions: RolledUpTarget[] = [];
  for (const key of pinnedKeys) {
    const existingOp = matchedById.get(key);
    if (existingOp) {
      existingOp.pinned = true;
      continue;
    }
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
