// v0.6.3 Patch 6 — operator share-of-market trajectory.
// Methodology_v0.6.3_Patches.md §Patch 6 (revised). The initial absolute
// listing-count YoY metric was rejected after a pressure test surfaced
// pipeline-coverage bias, thin-baseline noise, and survivor bias. The
// revised metric is the change in an operator's *share* of continuing-
// cohort listing activity year-over-year — share-based math controls for
// uniform pipeline expansion.
//
// Continuing cohort: ranked operators with ≥30 listings in BOTH the T12
// window AND the prior T24-T12 window. Operators outside this cohort fall
// into "new_in_coverage" (t24t12 ∈ [1, 29]) or "null_baseline" (t24t12 == 0)
// and surface a contextual pill in place of the trajectory display.
//
// Edge case (~1 operator in Phoenix per the spec): an operator ranked in
// the v0.6.3 base seed whose Patch 6-anchored t12ListingsCount drifted to
// 29 by exactly one listing. The seed's coverage.t12Listings is 30 in
// that case (the operator is ranked); we keep the cohort STRICT (uses
// t12ListingsCount ≥30) so the per-market median matches the spec's
// pressure-test table values, and classify the edge-case operator as
// "continuing" for display purposes — computing their share against the
// strict-cohort totals. The denman-realty-group-phoenix-az row is the
// only PM that exercises this branch in the v0.6.3 footprint.
//
// National benchmark is computed once per process and cached on a
// module-level promise. The v0.6.3 footprint pools ~412 continuing PMs
// across 7 markets; recompute cost is negligible but every cache hit
// downstream saves a full prisma round-trip.

import { prisma } from "@/lib/prisma";
import type { PoolPm } from "@/lib/msa-pool";
import type { ScorecardData } from "@/lib/types";

export type TrajectoryEligibility =
  | "continuing"
  | "new_in_coverage"
  | "null_baseline";

export interface ShareTrajectoryView {
  /** Focal operator's eligibility class for trajectory display. */
  eligibility: TrajectoryEligibility;
  /** T12 listing count carried forward to the display when the operator
   *  is in the new_in_coverage / null_baseline branches (so the user sees
   *  some scale even without a comparison). Continuing branch ignores it
   *  in the renderer. */
  t12ListingsCount: number | null;
  t24t12ListingsCount: number | null;
  /** Continuing-only fields. Null for the other branches. */
  shareT12: number | null;
  shareT24T12: number | null;
  shareTrajectoryYoY: number | null;
  /** Median shareTrajectoryYoY across the focal operator's market's
   *  continuing cohort. Null when the market has no continuing operators
   *  (defensive — none of the v0.6.3 markets fall below 27 continuing). */
  cohortMedianShareTrajectoryYoY: number | null;
  /** Continuing cohort size in this market — useful for the "N=27"
   *  sample-size note the spec mentions for thin markets. None of the
   *  current markets fall below 27 but the renderer can surface it. */
  continuingCohortSize: number;
  /** National benchmark — single value across every continuing operator
   *  in every covered MSA. Lifted from the module-level cache. */
  nationalShareTrajectoryYoY: number | null;
  /** National continuing-cohort size — informational, surfaces in the
   *  methodology disclosure copy if/when needed. */
  nationalContinuingCohortSize: number;
  /** v0.6.3 Patch 6 polish — auto-generated narrative paragraph that
   *  does the interpretation work for the reader (six variants keyed on
   *  eligibility + delta-from-cohort thresholds). Pre-rendered server-
   *  side so the section component just prints it; no string assembly
   *  in the React tree. */
  narrative: string;
}

const COHORT_THRESHOLD = 30;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Strict continuing-cohort filter — both windows must have at least the
// COHORT_THRESHOLD listings. Pressure-test table cohort sizes (Patch 6
// spec) all use this strict definition.
function isContinuing(t12: number | null, t24: number | null): boolean {
  return (
    typeof t12 === "number" &&
    t12 >= COHORT_THRESHOLD &&
    typeof t24 === "number" &&
    t24 >= COHORT_THRESHOLD
  );
}

// Same operator-edge-case rule the spec calls out: a ranked operator
// with t12ListingsCount just under 30 but coverage.t12Listings ≥30 (~1
// PM in Phoenix) is classified as "continuing" for display purposes even
// though the strict cohort excludes them. Their share is computable
// against the strict-cohort totals because the totals already excluded
// them — they just slot in alongside as a comparable row.
function isContinuingDisplay(
  t12: number | null,
  t24: number | null,
  coverageT12: number | null,
  ranked: boolean
): boolean {
  if (isContinuing(t12, t24)) return true;
  // Edge case: ranked + prior baseline ≥30 + coverage shows substantial
  // current presence even when the Patch 6 anchor put us just under 30.
  if (
    ranked &&
    typeof t24 === "number" &&
    t24 >= COHORT_THRESHOLD &&
    typeof coverageT12 === "number" &&
    coverageT12 >= COHORT_THRESHOLD
  ) {
    return true;
  }
  return false;
}

// Compute per-operator share + share-trajectory against the supplied
// strict-cohort totals. Used for both cohort members (the median seeds
// from these values) and the display-only continuing operators (edge
// case — same formula, same denominators, slots alongside cohort rows).
function shareTrajectoryAgainstTotals(
  t12: number,
  t24: number,
  totalT12: number,
  totalT24: number
): { shareT12: number; shareT24T12: number; shareTrajectoryYoY: number } | null {
  if (totalT12 <= 0 || totalT24 <= 0) return null;
  const shareT12 = t12 / totalT12;
  const shareT24T12 = t24 / totalT24;
  if (shareT24T12 <= 0) return null;
  return {
    shareT12,
    shareT24T12,
    shareTrajectoryYoY: (shareT12 - shareT24T12) / shareT24T12,
  };
}

// Per-market continuing-cohort builder. Walks the parsed MSA pool, picks
// the strict cohort, sums totals, returns the per-PM trajectory values
// plus the cohort median. Cohort size + per-operator values feed into
// the scorecard Layer 5 render via buildShareTrajectoryView below.
interface MarketCohortStats {
  totalT12: number;
  totalT24: number;
  trajectoryByOpSlug: Map<string, number>;
  cohortMedian: number | null;
  cohortSize: number;
}

function computeMarketCohortStats(
  pool: Array<{
    slug: string;
    t12ListingsCount: number | null;
    t24t12ListingsCount: number | null;
  }>
): MarketCohortStats {
  const cohort = pool.filter((p) =>
    isContinuing(p.t12ListingsCount, p.t24t12ListingsCount)
  );
  const totalT12 = cohort.reduce(
    (acc, p) => acc + (p.t12ListingsCount ?? 0),
    0
  );
  const totalT24 = cohort.reduce(
    (acc, p) => acc + (p.t24t12ListingsCount ?? 0),
    0
  );
  const trajectoryByOpSlug = new Map<string, number>();
  const cohortTrajectories: number[] = [];
  for (const p of cohort) {
    const res = shareTrajectoryAgainstTotals(
      p.t12ListingsCount ?? 0,
      p.t24t12ListingsCount ?? 0,
      totalT12,
      totalT24
    );
    if (res) {
      trajectoryByOpSlug.set(p.slug, res.shareTrajectoryYoY);
      cohortTrajectories.push(res.shareTrajectoryYoY);
    }
  }
  return {
    totalT12,
    totalT24,
    trajectoryByOpSlug,
    cohortMedian: median(cohortTrajectories),
    cohortSize: cohort.length,
  };
}

// National benchmark — single value across every continuing operator in
// every covered MSA. The cache is a Promise so concurrent first-callers
// share the in-flight prisma query. Recomputed once per Node process.
interface NationalBenchmark {
  median: number | null;
  size: number;
}
let nationalCachePromise: Promise<NationalBenchmark> | null = null;

export async function getNationalShareTrajectory(): Promise<NationalBenchmark> {
  if (nationalCachePromise) return nationalCachePromise;
  nationalCachePromise = (async () => {
    const rows = await prisma.pM.findMany({
      select: { slug: true, marketId: true, scorecardData: true },
    });
    // Group by marketId so we compute per-market totals (the cohort math
    // is market-scoped) and pool the per-operator YoY values for the
    // national median.
    const byMarket = new Map<
      string,
      Array<{
        slug: string;
        t12ListingsCount: number | null;
        t24t12ListingsCount: number | null;
      }>
    >();
    for (const row of rows) {
      const sc = JSON.parse(row.scorecardData) as ScorecardData;
      const arr = byMarket.get(row.marketId) ?? [];
      arr.push({
        slug: row.slug,
        t12ListingsCount: sc.t12ListingsCount ?? null,
        t24t12ListingsCount: sc.t24t12ListingsCount ?? null,
      });
      byMarket.set(row.marketId, arr);
    }
    const pooled: number[] = [];
    for (const arr of byMarket.values()) {
      const stats = computeMarketCohortStats(arr);
      for (const yoy of stats.trajectoryByOpSlug.values()) pooled.push(yoy);
    }
    return { median: median(pooled), size: pooled.length };
  })();
  return nationalCachePromise;
}

// v0.6.3 Patch 6 polish — narrative builder. Returns an interpretation-
// first paragraph that does the work for the reader (instead of asking
// them to mentally compare share trajectory vs cohort median). Six
// variants:
//
//   null_baseline    — operator has no prior listings on record
//   new_in_coverage  — operator wasn't substantially tracked in prior period
//   significant_loss — continuing, ≥5pp below cohort median
//   modest_loss      — continuing, within 0..5pp below cohort median
//   modest_gain      — continuing, within 0..5pp above cohort median
//   significant_gain — continuing, ≥5pp above cohort median
//
// All formatting matches the existing display: shares with 2 decimals,
// YoY changes with 1 decimal and a Unicode minus sign for negatives.
// marketName is the friendly MSA name (e.g. "Phoenix") sourced from
// scorecard.market.name (which is the city per types.ts seed mapping).
const SIGNIFICANT_DELTA_PP = 0.05;

function fmtSharePct(decimal: number | null): string {
  if (decimal === null) return "—";
  return `${(decimal * 100).toFixed(2)}%`;
}

function fmtYoyPct(decimal: number | null): string {
  if (decimal === null) return "—";
  const pct = decimal * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

export function buildShareTrajectoryNarrative({
  operatorName,
  marketName,
  eligibility,
  shareT12,
  shareT24T12,
  shareTrajectoryYoY,
  cohortMedianShareTrajectoryYoY,
  t12ListingsCount,
}: {
  operatorName: string;
  marketName: string;
  eligibility: TrajectoryEligibility;
  shareT12: number | null;
  shareT24T12: number | null;
  shareTrajectoryYoY: number | null;
  cohortMedianShareTrajectoryYoY: number | null;
  t12ListingsCount: number | null;
}): string {
  if (eligibility === "null_baseline") {
    return `${operatorName} is new to our coverage with no prior listings on record. Current 12-month period: ${t12ListingsCount ?? 0} listings.`;
  }
  if (eligibility === "new_in_coverage") {
    return `${operatorName} did not have substantial presence in ${marketName} in the prior 12-month period. The ${t12ListingsCount ?? 0} listings observed in the current period are new to our coverage — may reflect a newly tracked operator, market entry, or recent expansion.`;
  }
  // continuing branch — narrative depends on delta from cohort median.
  // Categories are RELATIVE to the cohort, so "gain" / "loss" in the
  // narrative refers to relative position. The absolute share movement
  // can be the opposite of the category (e.g. a Memphis operator whose
  // YoY is −3% while the cohort median is −10% is a "modest gain" in
  // relative position but their absolute share declined). To keep the
  // copy honest, the verbs ("rose to" / "fell to" / "held at") track the
  // ABSOLUTE share direction; the "outpacing peers" / "trailing peers"
  // framing carries the RELATIVE-vs-cohort meaning.
  const yoy = shareTrajectoryYoY ?? 0;
  const cohort = cohortMedianShareTrajectoryYoY ?? 0;
  const delta = yoy - cohort;
  const s12 = fmtSharePct(shareT12);
  const s24 = fmtSharePct(shareT24T12);
  const cohortPct = fmtYoyPct(cohortMedianShareTrajectoryYoY);
  const absDirection: "up" | "down" | "flat" =
    shareT12 !== null && shareT24T12 !== null
      ? shareT12 > shareT24T12
        ? "up"
        : shareT12 < shareT24T12
          ? "down"
          : "flat"
      : "flat";
  // "rose to X% from Y%" / "fell to X% from Y%" / "held at X% (was Y%)".
  // The flat case is rare in real data (exact equality of two fractional
  // shares is a measure-zero event) but kept for completeness.
  const sharePhrase =
    absDirection === "up"
      ? `rose to ${s12} from ${s24}`
      : absDirection === "down"
        ? `fell to ${s12} from ${s24}`
        : `held at ${s12} (was ${s24})`;

  if (delta > SIGNIFICANT_DELTA_PP) {
    // Significant gain in relative position. The "share consolidation"
    // framing only reads true when the absolute share actually grew;
    // when the cohort is shrinking faster, the operator is "holding
    // ground" rather than consolidating.
    const headlineNoun =
      absDirection === "up"
        ? "share consolidation"
        : "relative share strength";
    return `${operatorName}'s share of ${marketName} listing activity ${sharePhrase} over the past 12 months. This meaningfully outpaced the ${cohortPct} peer median, suggesting ${headlineNoun}. Possible drivers include organic portfolio growth, recent acquisitions, or new property management mandates.`;
  }
  if (delta > 0) {
    return `${operatorName}'s share of ${marketName} listing activity ${sharePhrase} over the past 12 months, slightly outpacing the ${cohortPct} peer median. Modest gain in relative position.`;
  }
  if (delta >= -SIGNIFICANT_DELTA_PP) {
    return `${operatorName}'s share of ${marketName} listing activity ${sharePhrase} over the past 12 months, slightly trailing the ${cohortPct} peer median. May reflect mild competitive pressure or improved tenant retention.`;
  }
  // Significant loss — relative position dropped meaningfully. Same
  // honesty rule: framing only says "decline" when the absolute share
  // actually fell; when the cohort outgrew an absolute-up operator, the
  // operator "lost relative ground" without literally declining.
  const headlineFraming =
    absDirection === "down" ? "decline" : "drop in relative position";
  return `${operatorName}'s share of ${marketName} listing activity ${sharePhrase} over the past 12 months. With the peer median running at ${cohortPct}, this ${headlineFraming} stands out. The operator may be losing share to new competitive entrants, or may have improved tenant retention — reducing turnover and the need for new listings.`;
}

// Scorecard-page entrypoint. Consumes the already-parsed MSA pool that
// peer-comparison + lending-signals already load (loadMsaPool), runs the
// market-level cohort math once, looks up the focal operator's slot,
// and returns the render-ready ShareTrajectoryView.
export async function buildShareTrajectoryView(
  focalScorecard: ScorecardData & { slug?: string },
  focalSlug: string,
  msaPool: PoolPm[]
): Promise<ShareTrajectoryView> {
  // Resolve the focal operator's t12 / t24 from the focalScorecard (which
  // came from the same prisma row the route loaded directly) rather than
  // chasing it through the pool.
  const focalT12 = focalScorecard.t12ListingsCount ?? null;
  const focalT24 = focalScorecard.t24t12ListingsCount ?? null;
  const focalCoverageT12 = focalScorecard.coverage?.t12Listings ?? null;
  const focalRanked =
    focalScorecard.rank?.overall !== null &&
    focalScorecard.rank?.overall !== undefined;

  // Build the strict per-market cohort stats from the pool.
  const poolForCohort = msaPool.map((p) => ({
    slug: p.slug,
    t12ListingsCount: p.scorecard.t12ListingsCount ?? null,
    t24t12ListingsCount: p.scorecard.t24t12ListingsCount ?? null,
  }));
  const stats = computeMarketCohortStats(poolForCohort);

  // Classify the focal operator.
  let eligibility: TrajectoryEligibility;
  if (focalT24 === null || focalT24 === 0) {
    eligibility = "null_baseline";
  } else if (isContinuingDisplay(focalT12, focalT24, focalCoverageT12, focalRanked)) {
    eligibility = "continuing";
  } else {
    // t24 ∈ [1, 29] OR (t24 ≥30 but t12 < 30 and not ranked, etc.)
    eligibility = "new_in_coverage";
  }

  // National benchmark (cache hit on warm; in-flight Promise share on cold).
  const national = await getNationalShareTrajectory();

  // Friendly names for the narrative — operator H1 name + city-level MSA
  // name. scorecard.market.name is the city per the seed (e.g. "Phoenix"),
  // not the full MSA designation. operatorName falls back to the slug to
  // avoid a "undefined" string in the rendered narrative if .pm.name is
  // somehow missing.
  const operatorName = focalScorecard.pm?.name ?? focalSlug;
  const marketName = focalScorecard.market?.name ?? "this market";

  if (eligibility !== "continuing") {
    const narrative = buildShareTrajectoryNarrative({
      operatorName,
      marketName,
      eligibility,
      shareT12: null,
      shareT24T12: null,
      shareTrajectoryYoY: null,
      cohortMedianShareTrajectoryYoY: stats.cohortMedian,
      t12ListingsCount: focalT12,
    });
    return {
      eligibility,
      t12ListingsCount: focalT12,
      t24t12ListingsCount: focalT24,
      shareT12: null,
      shareT24T12: null,
      shareTrajectoryYoY: null,
      cohortMedianShareTrajectoryYoY: stats.cohortMedian,
      continuingCohortSize: stats.cohortSize,
      nationalShareTrajectoryYoY: national.median,
      nationalContinuingCohortSize: national.size,
      narrative,
    };
  }

  // Continuing branch — compute focal's share against the strict-cohort
  // totals. Works for both strict-cohort members (totals include them)
  // and the edge-case display-only operator (totals don't include them
  // but the share is still comparable to the cohort rows).
  const share = shareTrajectoryAgainstTotals(
    focalT12 ?? 0,
    focalT24 ?? 0,
    stats.totalT12,
    stats.totalT24
  );
  const narrative = buildShareTrajectoryNarrative({
    operatorName,
    marketName,
    eligibility: "continuing",
    shareT12: share?.shareT12 ?? null,
    shareT24T12: share?.shareT24T12 ?? null,
    shareTrajectoryYoY: share?.shareTrajectoryYoY ?? null,
    cohortMedianShareTrajectoryYoY: stats.cohortMedian,
    t12ListingsCount: focalT12,
  });
  return {
    eligibility: "continuing",
    t12ListingsCount: focalT12,
    t24t12ListingsCount: focalT24,
    shareT12: share?.shareT12 ?? null,
    shareT24T12: share?.shareT24T12 ?? null,
    shareTrajectoryYoY: share?.shareTrajectoryYoY ?? null,
    cohortMedianShareTrajectoryYoY: stats.cohortMedian,
    continuingCohortSize: stats.cohortSize,
    nationalShareTrajectoryYoY: national.median,
    nationalContinuingCohortSize: national.size,
    narrative,
  };
}
