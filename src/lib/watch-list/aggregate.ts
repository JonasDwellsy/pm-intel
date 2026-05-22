// v0.9 — operator-level rollup.
//
// Collapses per-market PMRecords sharing a canonicalOperatorId into
// one aggregated record so the watch-list results page can show a
// multi-market operator as a single row with summed/averaged
// metrics, then evaluates the watch list against the aggregated row
// to produce a recomputed fit score.
//
// Aggregation rules (per the v0.9 spec):
//   - Sum: urusT12, t12Listings, t24t12Listings, portfolio
//     point/low/high.
//   - Footprint-weighted average (weight = each market's urusT12):
//     concessionRate, domT12, rentPerformance.pmYoyChange, topCity
//     concentration. Listing trajectory YoY is derived from the
//     summed t12/t24 counts (don't average percentages directly).
//   - Modal: quadrant7Cell, institutional, hybrid, portfolio
//     confidence. quadrant7Cell tracks an `isMixed` flag for the UI.
//   - Max: monthsOnPlatform (longest tenure).
//   - Any: claimed (top-level field — "claimed" if any market is).
//
// Criterion evaluation:
//   Non-market criteria evaluate against the aggregated record via
//   the standard evaluator. The `marketIds` field is special: a
//   rolled-up operator has a market SET, not a single market. For
//   each marketIds criterion we OR-walk the member markets so the
//   criterion passes if any member satisfies it (eq/in/contains),
//   or no member matches (ne/notIn). This is the v0.9 ANY-market
//   semantics; explicit ANY/ALL/AGGREGATE modifiers are a v1.0
//   concern.
//
// Pure module — no I/O. apply.ts calls in here with the per-market
// rows it already loaded; tests exercise the math directly without
// touching prisma.

import {
  type FilterCriterion,
  type PMRecord,
  type WeightedCriterion,
} from "./fields";
import {
  evaluateWatchList,
  type WatchListDefinition,
  type WatchListEvaluation,
  type ScoreBreakdownEntry,
} from "./scoring";
import { evaluateCriterion } from "./evaluator";
import { isCriterionComplete } from "./validation";

// ─── public types ────────────────────────────────────────────────

export interface AggregatedPMRecord extends PMRecord {
  /** True for multi-market rollups; false when the operator is a
   *  single-market entity (the aggregation is a 1-element wrap). */
  isRollup: boolean;
  /** All member market ids — for display ("BHM, JAX, KNOX, HSV")
   *  and the multi-market scorecard picker. */
  memberMarketIds: string[];
  /** All member market full names (e.g. "Birmingham-Hoover, AL MSA"). */
  memberMarketNames: string[];
  /** All member PM slugs in the same order as memberMarketIds. */
  memberPmSlugs: string[];
  /** True when member markets disagree on quadrant7Cell — the row
   *  shows the modal value with a "mixed" badge. */
  quadrant7CellIsMixed: boolean;
  /** Original per-market records, preserved for downstream rendering
   *  (market picker, hover details, etc.). */
  members: PMRecord[];
}

export interface RolledUpEvaluation extends WatchListEvaluation {
  /** The aggregated record that was scored. */
  aggregated: AggregatedPMRecord;
}

// ─── aggregation ────────────────────────────────────────────────

/** Collapse N PMRecords (presumed to share a canonicalOperatorId)
 *  into a single AggregatedPMRecord. N == 1 produces a trivial
 *  wrap with isRollup=false; N >= 2 sums/weights/modes per the
 *  spec rules. */
export function aggregateRecords(records: PMRecord[]): AggregatedPMRecord {
  if (records.length === 0) {
    throw new Error("aggregateRecords: empty input");
  }
  if (records.length === 1) {
    const r = records[0];
    return {
      ...r,
      isRollup: false,
      memberMarketIds: [r.marketId],
      memberMarketNames: [r.scorecard.market?.fullName ?? r.marketId],
      memberPmSlugs: [r.slug],
      quadrant7CellIsMixed: false,
      members: [r],
    };
  }

  // Sort members for deterministic output (display order + first-id
  // tie-breakers). Sort by marketId so the rendered "BHM, HSV, JAX,
  // KNOX" list is stable across renders.
  const sorted = records.slice().sort((a, b) => a.marketId.localeCompare(b.marketId));

  const weights = sorted.map((r) => Math.max(0, asNum(r.scorecard.coverage?.urusT12) ?? 0));

  // ── Summed coverage / portfolio fields ──
  const urusT12 = sumOf(sorted, (r) => r.scorecard.coverage?.urusT12);
  const t12Listings = sumOf(sorted, (r) => r.scorecard.coverage?.t12Listings);
  const t12ListingsCount = sumOf(sorted, (r) => r.scorecard.t12ListingsCount);
  const t24t12ListingsCount = sumOf(sorted, (r) => r.scorecard.t24t12ListingsCount);
  const portfolioPoint = sumOf(sorted, (r) => r.scorecard.portfolioEstimate?.point);
  const portfolioLow = sumOf(sorted, (r) => r.scorecard.portfolioEstimate?.low);
  const portfolioHigh = sumOf(sorted, (r) => r.scorecard.portfolioEstimate?.high);

  // ── Footprint-weighted averages (weight = per-market urusT12) ──
  const concessionRate = weightedAvg(
    sorted,
    (r) => r.scorecard.concessionRate,
    weights
  );
  const domT12 = weightedAvg(
    sorted,
    (r) => r.scorecard.performance?.domT12,
    weights
  );
  const rentYoY = weightedAvg(
    sorted,
    (r) => r.scorecard.rentPerformance?.pmYoyChange,
    weights
  );
  const topCityPct = weightedAvg(
    sorted,
    (r) => r.scorecard.geographicCoverage?.topCities?.[0]?.pct,
    weights
  );

  // ── Modal categorical / boolean fields ──
  const q7Modal = modeOf(sorted, (r) => r.scorecard.pm?.quadrant7Cell);
  const institutionalModal = modeOf(sorted, (r) => r.scorecard.pm?.institutional);
  const hybridModal = modeOf(sorted, (r) => r.scorecard.pm?.hybrid);
  const confidenceModal = modeOf(
    sorted,
    (r) => r.scorecard.portfolioEstimate?.confidence
  );

  // ── Max / any ──
  const monthsOnPlatform = maxOf(sorted, (r) => r.scorecard.coverage?.monthsOnPlatform);
  const claimedAny = sorted.some((r) => r.claimed === true);

  // ── First-member identity (canonicalOperatorId is the same for
  //    every member by construction; use member[0]'s name as the
  //    operator display name). ──
  const first = sorted[0];

  // Build the aggregated scorecard by shallow-copying first's
  // scorecard and overwriting the fields we computed. We retain
  // first's scorecard so any field the registry / evaluator reaches
  // for that we haven't explicitly aggregated still resolves to
  // *something* sensible (typically a no-op since we cover every
  // field the field registry uses today).
  const aggregatedScorecard: PMRecord["scorecard"] = {
    ...first.scorecard,
    pm: {
      ...first.scorecard.pm,
      quadrant7Cell: q7Modal.value ?? first.scorecard.pm?.quadrant7Cell,
      institutional:
        institutionalModal.value === undefined
          ? first.scorecard.pm?.institutional
          : (institutionalModal.value as boolean),
      hybrid:
        hybridModal.value === undefined
          ? first.scorecard.pm?.hybrid
          : (hybridModal.value as boolean),
    },
    coverage: {
      ...first.scorecard.coverage,
      urusT12: urusT12 ?? first.scorecard.coverage?.urusT12 ?? 0,
      t12Listings: t12Listings ?? first.scorecard.coverage?.t12Listings ?? 0,
      monthsOnPlatform:
        monthsOnPlatform ?? first.scorecard.coverage?.monthsOnPlatform ?? 0,
    },
    performance: {
      ...first.scorecard.performance,
      domT12: domT12 ?? first.scorecard.performance?.domT12 ?? 0,
    },
    rentPerformance: first.scorecard.rentPerformance
      ? {
          ...first.scorecard.rentPerformance,
          pmYoyChange:
            rentYoY ?? first.scorecard.rentPerformance.pmYoyChange ?? 0,
        }
      : null,
    geographicCoverage: first.scorecard.geographicCoverage
      ? {
          ...first.scorecard.geographicCoverage,
          topCities:
            topCityPct === null
              ? first.scorecard.geographicCoverage.topCities
              : [
                  {
                    name:
                      first.scorecard.geographicCoverage.topCities?.[0]?.name ?? "",
                    pct: topCityPct,
                  },
                  // Drop secondary cities — the rollup's "primary city
                  // density" is a synthetic weighted average; we keep
                  // only the leading slot because anything past it is
                  // no longer comparable across markets.
                ],
        }
      : first.scorecard.geographicCoverage,
    portfolioEstimate: first.scorecard.portfolioEstimate
      ? {
          ...first.scorecard.portfolioEstimate,
          point: portfolioPoint ?? first.scorecard.portfolioEstimate.point,
          low: portfolioLow ?? first.scorecard.portfolioEstimate.low,
          high: portfolioHigh ?? first.scorecard.portfolioEstimate.high,
          confidence:
            (confidenceModal.value as
              | "Low"
              | "Medium"
              | "High"
              | undefined) ?? first.scorecard.portfolioEstimate.confidence,
        }
      : first.scorecard.portfolioEstimate,
    concessionRate:
      concessionRate ?? first.scorecard.concessionRate ?? null,
    t12ListingsCount:
      t12ListingsCount ?? first.scorecard.t12ListingsCount,
    t24t12ListingsCount:
      t24t12ListingsCount ?? first.scorecard.t24t12ListingsCount,
  };

  return {
    slug: first.slug, // canonical-style slug; results-view replaces with canonical id
    name: first.name,
    marketId: first.marketId, // placeholder; market-criteria use member set
    claimed: claimedAny,
    marketCount: sorted.length,
    scorecard: aggregatedScorecard,
    isRollup: true,
    memberMarketIds: sorted.map((r) => r.marketId),
    memberMarketNames: sorted.map((r) => r.scorecard.market?.fullName ?? r.marketId),
    memberPmSlugs: sorted.map((r) => r.slug),
    quadrant7CellIsMixed: q7Modal.isMixed,
    members: sorted,
  };
}

// ─── rollup-aware watch-list evaluation ─────────────────────────────

/** Evaluate a watch list against an AggregatedPMRecord, with ANY-market
 *  semantics for marketIds criteria. For singletons (isRollup=false)
 *  this delegates straight to the standard evaluator. */
export function evaluateRollup(
  agg: AggregatedPMRecord,
  watchList: WatchListDefinition
): WatchListEvaluation {
  if (!agg.isRollup) {
    return evaluateWatchList(agg, watchList);
  }

  // Pre-walk: handle marketIds criteria using ANY-match semantics
  // against the member market set. Non-market criteria flow into
  // the standard evaluator against the aggregated scorecard.
  const reqSplit = partitionMarket(watchList.requiredCriteria);
  const excSplit = partitionMarket(watchList.excludedCriteria);
  const prefSplit = partitionMarket(watchList.preferredCriteria);

  // 1. excluded — any market-criterion match vetoes
  for (const c of excSplit.market) {
    if (!isCriterionComplete(c)) continue;
    if (anyMarketMatches(agg.memberMarketIds, c)) {
      // Excluded match — full veto. Standard evaluator output shape.
      return {
        passed: false,
        fitScore: null,
        breakdown: {
          required: [],
          preferred: [],
          excluded: [{ field: c.field, operator: c.operator, passed: true }],
          excludedBy: { layer: "excluded", field: c.field, operator: c.operator },
        },
      };
    }
  }

  // 2. required — every market-criterion must match
  for (const c of reqSplit.market) {
    if (!isCriterionComplete(c)) continue;
    if (!anyMarketMatches(agg.memberMarketIds, c)) {
      return {
        passed: false,
        fitScore: null,
        breakdown: {
          required: [{ field: c.field, operator: c.operator, passed: false }],
          preferred: [],
          excluded: [],
          excludedBy: { layer: "required", field: c.field, operator: c.operator },
        },
      };
    }
  }

  // 3. Build a "non-market" watch list for the standard evaluator pass.
  const nonMarketWatchList: WatchListDefinition = {
    ...watchList,
    requiredCriteria: reqSplit.other as FilterCriterion[],
    preferredCriteria: prefSplit.other as WeightedCriterion[],
    excludedCriteria: excSplit.other as FilterCriterion[],
  };
  const stdEval = evaluateWatchList(agg, nonMarketWatchList);

  // 4. If non-market eval excluded the row, return immediately —
  //    the market criteria already passed so the breakdown should
  //    just include the non-market verdict.
  if (!stdEval.passed) {
    return stdEval;
  }

  // 5. Add preferred-marketIds entries to the breakdown using ANY-
  //    match semantics, and recompute the fit score with their
  //    contribution. preferred-market criteria with empty values
  //    skip per isCriterionComplete.
  const prefMarket = prefSplit.market.filter(isCriterionComplete);
  if (prefMarket.length === 0) {
    return stdEval;
  }

  const additionalEntries: ScoreBreakdownEntry[] = prefMarket.map((c) => {
    const passed = anyMarketMatches(agg.memberMarketIds, c);
    const weight = (c as WeightedCriterion).weight ?? 0;
    return {
      field: c.field,
      operator: c.operator,
      passed,
      weight,
      contribution: passed ? weight * 100 : 0,
    };
  });
  const allPreferred = [...stdEval.breakdown.preferred, ...additionalEntries];
  const totalWeight = allPreferred.reduce((s, e) => s + (e.weight ?? 0), 0);
  const weightedHits = allPreferred.reduce(
    (s, e) => s + (e.contribution ?? 0),
    0
  );
  const fitScore =
    totalWeight > 0 ? Math.round(weightedHits / totalWeight) : 100;

  return {
    passed: true,
    fitScore,
    breakdown: {
      ...stdEval.breakdown,
      preferred: allPreferred,
    },
  };
}

// ─── helpers ─────────────────────────────────────────────────────

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function sumOf<T>(arr: T[], pick: (t: T) => unknown): number | null {
  let total = 0;
  let any = false;
  for (const item of arr) {
    const v = asNum(pick(item));
    if (v === null) continue;
    total += v;
    any = true;
  }
  return any ? total : null;
}

function maxOf<T>(arr: T[], pick: (t: T) => unknown): number | null {
  let best: number | null = null;
  for (const item of arr) {
    const v = asNum(pick(item));
    if (v === null) continue;
    if (best === null || v > best) best = v;
  }
  return best;
}

/** Footprint-weighted average. Falls back to a simple arithmetic mean
 *  if every weight is zero (operator has no urusT12 anywhere — rare
 *  but possible for placeholder records). Markets with a missing
 *  value are excluded from both numerator and denominator so the
 *  average isn't biased toward 0. */
function weightedAvg<T>(
  arr: T[],
  pick: (t: T) => unknown,
  weights: number[]
): number | null {
  let weightedSum = 0;
  let weightUsed = 0;
  let plainSum = 0;
  let plainCount = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = asNum(pick(arr[i]));
    if (v === null) continue;
    const w = weights[i] ?? 0;
    weightedSum += v * w;
    weightUsed += w;
    plainSum += v;
    plainCount += 1;
  }
  if (weightUsed > 0) return weightedSum / weightUsed;
  if (plainCount > 0) return plainSum / plainCount;
  return null;
}

/** Return the modal value across an array (ties broken by the value
 *  that appears earliest). `isMixed` is true when more than one
 *  distinct value appears. */
export function modeOf<T, V>(
  arr: T[],
  pick: (t: T) => V | undefined | null
): { value: V | undefined; isMixed: boolean } {
  const tally = new Map<V, { count: number; firstIdx: number }>();
  let distinct = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = pick(arr[i]);
    if (v === undefined || v === null) continue;
    const existing = tally.get(v);
    if (!existing) {
      tally.set(v, { count: 1, firstIdx: i });
      distinct += 1;
    } else {
      existing.count += 1;
    }
  }
  if (tally.size === 0) return { value: undefined, isMixed: false };
  let best: V | undefined;
  let bestCount = -1;
  let bestIdx = Number.POSITIVE_INFINITY;
  for (const [v, meta] of tally.entries()) {
    if (
      meta.count > bestCount ||
      (meta.count === bestCount && meta.firstIdx < bestIdx)
    ) {
      best = v;
      bestCount = meta.count;
      bestIdx = meta.firstIdx;
    }
  }
  return { value: best, isMixed: distinct > 1 };
}

/** Pull marketIds criteria out of a watch list layer; returns both
 *  buckets so the caller can evaluate the rest normally. */
function partitionMarket<C extends FilterCriterion | WeightedCriterion>(
  criteria: C[]
): { market: C[]; other: C[] } {
  const market: C[] = [];
  const other: C[] = [];
  for (const c of criteria) {
    if (c.field === "marketIds") market.push(c);
    else other.push(c);
  }
  return { market, other };
}

/** OR-walk a marketIds criterion across all member market ids. For
 *  positive operators (eq/in/contains) returns true if any member
 *  matches; for negative operators (ne/notIn) returns true only when
 *  no member matches the configured value. */
function anyMarketMatches(memberMarketIds: string[], c: FilterCriterion): boolean {
  // Synthesize a tiny PMRecord wrapper per member market and reuse
  // evaluator semantics so this code path doesn't drift from the
  // standard one. evaluator's eq/ne/in/notIn handling already covers
  // the operators marketIds supports.
  const isNegative = c.operator === "ne" || c.operator === "notIn";
  if (isNegative) {
    // Negative: passes when NO member matches the inverse positive
    // form. evaluateCriterion with "ne" returns true when the
    // pmValue != configured; we want passes-for-all-members. Flip
    // the operator and check "no member positive-match" → "all
    // members negative-match" → return true.
    for (const m of memberMarketIds) {
      const fake: PMRecord = {
        slug: "",
        name: "",
        marketId: m,
        claimed: false,
        marketCount: 0,
        // The evaluator only touches scorecard when the field's
        // accessor reads from it; marketIds reads pm.marketId.
        // The empty scorecard is fine here — but TS requires a
        // shape match, so we cast.
        scorecard: {} as PMRecord["scorecard"],
      };
      if (!evaluateCriterion(fake, c)) return false;
    }
    return true;
  }
  for (const m of memberMarketIds) {
    const fake: PMRecord = {
      slug: "",
      name: "",
      marketId: m,
      claimed: false,
      marketCount: 0,
      scorecard: {} as PMRecord["scorecard"],
    };
    if (evaluateCriterion(fake, c)) return true;
  }
  return false;
}

// ─── grouping helpers used by apply.ts ───────────────────────────

/** Group records by their canonicalOperatorId, falling back to the
 *  PM slug for operators that don't carry a canonical id (which
 *  v0.6.4+ shouldn't, but the fallback keeps the rollup safe under
 *  partial data). */
export function groupByCanonical(records: PMRecord[]): Map<string, PMRecord[]> {
  const out = new Map<string, PMRecord[]>();
  for (const r of records) {
    const key = r.scorecard.canonicalOperatorId ?? r.slug;
    const bucket = out.get(key) ?? [];
    bucket.push(r);
    out.set(key, bucket);
  }
  return out;
}
