import type { OperatorType, PoolPm } from "@/lib/msa-pool";
import { operatorType, operatorTypeLabel } from "@/lib/msa-pool";
import type {
  CohortLevel,
  ScorecardData,
  StarLevel,
} from "@/lib/types";
import { marketingDataSuppressed } from "@/lib/types";

// Layer 3 metric universe — five performance dimensions that get their own
// card. Community Visibility is gated by `scorecard.communityVisibility !==
// null` per the v0.6.1 scope gate (MF/BTR only with sufficient tenure).
export type Layer3Metric =
  | "dom"
  | "tenancy"
  | "rentPerformance"
  | "marketing"
  | "communityVisibility";

// Direction semantics — used both to sort the cohort and to choose the trend
// arrow on the card headline. "Lower better" means a smaller value is more
// favorable (e.g., DOM days); "higher better" the opposite.
export const METRIC_DIRECTIONS: Record<
  Layer3Metric,
  "lower_better" | "higher_better"
> = {
  dom: "lower_better",
  tenancy: "higher_better",
  rentPerformance: "higher_better",
  marketing: "higher_better",
  communityVisibility: "higher_better",
};

// Pull the comparable scalar value for a metric out of a parsed scorecard.
// Returns null when the operator doesn't have a value (suppressed metric,
// no scope-gate qualifying CV, etc.).
function metricValue(
  sc: ScorecardData,
  metric: Layer3Metric
): number | null {
  switch (metric) {
    case "dom":
      return Number.isFinite(sc.performance.domT12) ? sc.performance.domT12 : null;
    case "tenancy":
      return sc.tenancy.overallGap;
    case "rentPerformance":
      return sc.rentPerformance?.delta ?? null;
    case "marketing":
      // v0.7 follow-up: some v0.6.2 cohorts (Nashville SFR Indep is the
      // worst-affected) have their marketing subscores stuck at 0 due to
      // a data-pipeline computation gap. Treat as null so Layer 3 renders
      // "Insufficient data to compute" rather than a fake 0/100 cohort.
      if (marketingDataSuppressed(sc.marketing)) return null;
      return Number.isFinite(sc.marketing.compositeScore)
        ? sc.marketing.compositeScore
        : null;
    case "communityVisibility":
      return sc.communityVisibility?.ratio ?? null;
  }
}

export interface PeerRow {
  slug: string;
  name: string;
  value: number;
  star: StarLevel;
  isFocal: boolean;
  /** Public scorecard URL for the peer (always opens unlocked). */
  href: string;
}

export interface PeerComparison {
  metric: Layer3Metric;
  cohortLevel: CohortLevel;
  cohortName: string;
  cohortN: number;
  cohortMedian: number | null;
  cohortP25: number | null;
  cohortP75: number | null;
  /** Star derived from focal operator's percentile within the selected cohort. */
  focalStar: StarLevel;
  /** Focal operator's metric value (can be null when suppressed). */
  focalValue: number | null;
  /** Up to 5 rows: focal + up to 4 nearest neighbors. Alphabetical by name. */
  rows: PeerRow[];
  /** Optional caveat shown above the card body (e.g., short-history tenancy,
   *  hybrid operator notice when cohort fell through to MSA). */
  footnote?: string;
}

// Public entry — resolves all 5 metric comparisons for the focal scorecard.
// Takes the MSA pool that the page loaded once (shared with Layer 4 lending
// signals) and runs in-memory cohort filtering + ranking across the metrics.
export function buildPeerComparisons(
  scorecard: ScorecardData,
  pool: PoolPm[]
): Record<Layer3Metric, PeerComparison | null> {
  const focal = pool.find((p) => p.slug === scorecard.pm.slug);
  if (!focal) {
    // The focal scorecard wasn't in the pool — only possible if the PM table
    // was mid-write. Return all-null map; the renderer treats each card as
    // "Insufficient data".
    return {
      dom: null,
      tenancy: null,
      rentPerformance: null,
      marketing: null,
      communityVisibility: null,
    };
  }

  const focalType = operatorType(focal.quadrant7Cell);

  const primaryFilter = (p: PoolPm) =>
    p.quadrant7Cell === focal.quadrant7Cell;
  const fallbackFilter = (p: PoolPm) =>
    operatorType(p.quadrant7Cell) === focalType;

  return {
    dom: buildOneMetric("dom", focal, focalType, pool, primaryFilter, fallbackFilter),
    tenancy: buildOneMetric("tenancy", focal, focalType, pool, primaryFilter, fallbackFilter),
    rentPerformance: buildOneMetric("rentPerformance", focal, focalType, pool, primaryFilter, fallbackFilter),
    marketing: buildOneMetric("marketing", focal, focalType, pool, primaryFilter, fallbackFilter),
    communityVisibility: buildOneMetric(
      "communityVisibility",
      focal,
      focalType,
      pool,
      primaryFilter,
      fallbackFilter
    ),
  };
}

// PoolPm + operatorType helpers re-exported via msa-pool.ts; kept this module
// focused on the peer-comparison algorithm itself.

function buildOneMetric(
  metric: Layer3Metric,
  focal: PoolPm,
  focalType: OperatorType,
  all: PoolPm[],
  primaryFilter: (p: PoolPm) => boolean,
  fallbackFilter: (p: PoolPm) => boolean
): PeerComparison | null {
  // Community Visibility doesn't render at all for non-qualifying operators.
  if (
    metric === "communityVisibility" &&
    focal.scorecard.communityVisibility === null
  ) {
    return null;
  }

  const focalValue = metricValue(focal.scorecard, metric);
  const marketName = focal.scorecard.market.name;

  // Resolve cohort. Try primary → fallback → MSA. N ≥ 10 threshold per
  // Section 2 of the design spec.
  type Candidate = { pm: PoolPm; value: number };

  function pool(filter: (p: PoolPm) => boolean): Candidate[] {
    return all
      .filter((p) => p.slug !== focal.slug && filter(p))
      .map((p) => ({ pm: p, value: metricValue(p.scorecard, metric) }))
      .filter((c): c is Candidate => c.value !== null);
  }

  const primary = pool(primaryFilter);
  const fallback = pool(fallbackFilter);
  const msa = pool(() => true);

  // Cohort N includes the focal operator (if it has a value).
  const focalContributes = focalValue !== null ? 1 : 0;

  let cohortLevel: CohortLevel;
  let cohortValues: Candidate[];
  let cohortName: string;

  if (primary.length + focalContributes >= 10) {
    cohortLevel = "primary";
    cohortValues = primary;
    cohortName = `${marketName} ${focal.quadrant7Cell ?? ""} cohort`.trim();
  } else if (fallback.length + focalContributes >= 10) {
    cohortLevel = "fallback";
    cohortValues = fallback;
    cohortName = `${marketName} ${operatorTypeLabel(focalType)} cohort`;
  } else {
    cohortLevel = "msa";
    cohortValues = msa;
    cohortName = `${marketName} MSA cohort`;
  }

  // Empty cohort: surface the metric with no peer table.
  if (cohortValues.length === 0 || focalValue === null) {
    return {
      metric,
      cohortLevel,
      cohortName,
      cohortN: cohortValues.length + focalContributes,
      cohortMedian: null,
      cohortP25: null,
      cohortP75: null,
      focalStar: null,
      focalValue,
      rows:
        focalValue !== null
          ? [
              {
                slug: focal.slug,
                name: focal.scorecard.pm.name,
                value: focalValue,
                star: null,
                isFocal: true,
                href: focal.href,
              },
            ]
          : [],
    };
  }

  // Direction-aware sort: index 0 is the most-favorable operator. Lower DOM is
  // more favorable; higher tenancy is more favorable; etc.
  const direction = METRIC_DIRECTIONS[metric];
  const all3: Candidate[] = [
    ...cohortValues,
    { pm: focal, value: focalValue },
  ].sort((a, b) =>
    direction === "higher_better" ? b.value - a.value : a.value - b.value
  );

  const focalIndex = all3.findIndex((c) => c.pm.slug === focal.slug);
  const n = all3.length;

  function starAtIndex(idx: number): StarLevel {
    if (n < 2) return null;
    const pct = ((n - 1 - idx) / (n - 1)) * 100;
    if (pct >= 75) return "gold";
    if (pct >= 50) return "silver";
    return null;
  }

  const focalStar = starAtIndex(focalIndex);

  // Pick up to 4 nearest neighbors — prefer 2 above + 2 below, but greedily
  // borrow from one side when the other can't supply (focal near cohort edge).
  const above = all3.slice(Math.max(0, focalIndex - 2), focalIndex);
  const below = all3.slice(focalIndex + 1, focalIndex + 3);
  let nearest = [...above, ...below];
  if (nearest.length < 4) {
    if (above.length < 2) {
      const need = 4 - nearest.length;
      const extras = all3.slice(focalIndex + 1 + below.length, focalIndex + 1 + below.length + need);
      nearest = [...above, ...below, ...extras];
    } else if (below.length < 2) {
      const need = 4 - nearest.length;
      const startFrom = Math.max(0, focalIndex - 2 - need);
      const endTo = focalIndex - above.length;
      const extras = all3.slice(startFrom, endTo);
      nearest = [...extras, ...above, ...below];
    }
  }

  const focalRow: PeerRow = {
    slug: focal.slug,
    name: focal.scorecard.pm.name,
    value: focalValue,
    star: focalStar,
    isFocal: true,
    href: focal.href,
  };
  const peerRows: PeerRow[] = nearest.map((c) => ({
    slug: c.pm.slug,
    name: c.pm.name,
    value: c.value,
    star: starAtIndex(all3.indexOf(c)),
    isFocal: false,
    href: c.pm.href,
  }));

  const rows = [focalRow, ...peerRows].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Cohort quartiles for the distribution chart.
  const ascending = [...all3].map((c) => c.value).sort((a, b) => a - b);
  const cohortP25 = quantile(ascending, 0.25);
  const cohortMedian = quantile(ascending, 0.5);
  const cohortP75 = quantile(ascending, 0.75);

  // Hybrid footnote — surfaced when the focal is Hybrid AND the cohort
  // selection fell through to MSA. Dominant-side cohort assignment requires
  // upstream data that v0.6.2 doesn't pre-compute; v0.7 patch territory.
  const footnote =
    focalType === "hybrid" && cohortLevel === "msa"
      ? `${focal.scorecard.pm.name} is a hybrid operator. Comparison shown against MSA cohort (dominant-side resolution deferred to v0.7).`
      : undefined;

  return {
    metric,
    cohortLevel,
    cohortName,
    cohortN: n,
    cohortMedian,
    cohortP25,
    cohortP75,
    focalStar,
    focalValue,
    rows,
    footnote,
  };
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
