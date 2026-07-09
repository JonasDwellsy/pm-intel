// v0.24 — assembles the redesigned scorecard's view model from already-loaded
// data + the Phase-1 derivation library. Pure; no I/O. Components consume
// ScorecardView and never touch raw ScorecardData. Never surfaces raw
// rank/composite — only labels, values-vs-benchmark, stars, positions.

import type { ScorecardData } from "@/lib/types";
import { countOperatorStars } from "@/lib/operators/stars";
import { operatingPerformanceLabel, type ScoreLabel, metricLabels, metricCohortPercentile, strongestAndWatch, type MetricKey } from "./labels";
import { momentumDirection, type MomentumDirection } from "./momentum";
import { buildWatchItems, type WatchItem, type WatchTrajectory } from "./watch-items";
import { selectSimilarLocalPlayers, type PeerCandidate, type SelectedPeer } from "./peers";
import { rentTierDetail } from "./rent-tier";
import type { RentTierDetail } from "./rent-tier";
import { buildLendingSignals } from "@/lib/lending-signals";
import type { PoolPm } from "@/lib/msa-pool";
import { buildConcessionContext, uniquePatternLabels, formatConcessionSample } from "@/lib/concession-context";
import { estimatedManagedUnits, DEFAULT_SFR_TURNOVER_MULTIPLIER } from "@/lib/operator-size";
import {
  concessionDetail,
  type MetricTone,
} from "./operating-detail";

export interface HeaderView {
  name: string;
  quadrant7Cell: string | null;
  marketFullName: string;
  singleMarket: boolean;
  goldCount: number;
  silverCount: number;
  dwellsyCompanyUrl: string | null;
  website: string | null;
}

export interface ReadoutRow {
  area: "Scale & Fit" | "Operating Performance" | "Momentum" | "Watch Items";
  value: string;
  label?: ScoreLabel | string;
}

export interface ScaleFitView {
  takeaway: string;
  observedUnits: number | null;
  estimate: { point: number | null; low: number | null; high: number | null; confidence: string | null; status: string; message: string | null };
  topCities: Array<{ name: string; pct: number }>;
  top3Share: number | null;
  cohortTop3: number | null;
  rentTier: RentTierDetail | null;
  communitiesObserved: number | null;
  propertyType: string | null;
  citiesObserved: number | null;
  singleMarket: boolean;
  tenure: { yearsVisible: number; marketCount: number; cohortMedianYears: number | null } | null;
  unitMix: { houseUrus: number; aptUrus: number } | null;
  crossMarket: { canonicalSlug: string; marketNames: string[] } | null;
}

export interface MetricRow {
  key: MetricKey; title: string; label: ScoreLabel; value: string; benchmark: string;
  position: number | null; star: "gold" | "silver" | null; sub: string[];
  // Plain-English note shown at the top of the card (parity with the
  // concession card). "" → fall back to benchmark.
  interpretation: string;
}
export interface OperatingView {
  sectionLabel: ScoreLabel; takeaway: string; strongest: string[]; watch: string[]; metrics: MetricRow[];
  // `interpretation`/`tone`/`definition` bring this re-enriched card to parity
  // with the scored metric cards (see operating-detail.ts).
  concession: { ratePct: number; marketRatePct: number | null; patterns: string[]; samples: string[]; interpretation: string; tone: MetricTone; definition: string } | null;
}

export interface MomentumView {
  direction: MomentumDirection;
  takeaway: string;
  sparklines: Array<{ key: "portfolio" | "share" | "reach" | "quality" | "footprint"; label: string; direction: MomentumDirection; series: number[] }>;
}

export interface ScorecardView {
  header: HeaderView;
  readout: ReadoutRow[];
  scaleFit: ScaleFitView;
  operating: OperatingView;
  momentum: MomentumView;
  watchItems: WatchItem[];
  peers: SelectedPeer[];
  maturityNote: string | null;
}

export interface BuildViewInput {
  scorecard: ScorecardData;
  pool: unknown[];
  trajectory: {
    points: Array<{
      portfolioPoint: number | null;
      goldCount?: number;
      silverCount?: number;
      submarketCount?: number | null;
      concessionRate?: number | null;
      eligible?: boolean;
      date?: string;
      /** Operator's share (0..1) of its market's T12 listings that snapshot
       *  — drives the "Listing share" sparkline. Populated by
       *  loadOperatorTrajectory; absent for single-point/thin history. */
      shareOfMarket?: number | null;
    }>;
  };
  // Market concession benchmark fed to the watch-item logic. As of the
  // listing-weighted-rate change this carries concessionContext.marketRate
  // (total concession listings ÷ total T12 listings across the market), NOT a
  // median — the field name is retained only to avoid churning every caller.
  marketConcessionMedian: number | null;
  marketCount?: number;
  /** Cross-market aggregate trajectory (multi-market operators only) —
   *  fed by page.tsx via loadOperatorAggregateTrajectory(memberPmSlugs).
   *  Each point's marketsPresent count drives the "footprint" sparkline. */
  aggregateTrajectory?: { points: Array<{ portfolioPoint: number | null; marketsPresent: number }> };
  /** Distinct member-market display names (multi-market operators only). */
  memberMarketNames?: string[];
  /** SFR turnover multiplier (k) for the estimated-managed-units size, from
   *  the admin-tunable app setting. Defaults to DEFAULT_SFR_TURNOVER_MULTIPLIER
   *  so existing callers (and tests) that don't pass it keep working. */
  sfrMultiplier?: number;
}

interface PoolMember { slug: string; name: string; quadrant7Cell: string | null; scorecard: ScorecardData }

const METRIC_TITLES: Record<MetricKey, string> = {
  dom: "Lease-up speed", tenancy: "Tenant retention", rentPerformance: "Rent performance",
  marketing: "Marketing discipline", communityVisibility: "Inventory transparency",
};

function metricStar(sc: ScorecardData, k: MetricKey): "gold" | "silver" | null {
  const s = k === "dom" ? sc.performance?.domStar
    : k === "tenancy" ? sc.tenancy?.star
    : k === "rentPerformance" ? sc.rentPerformance?.star
    : k === "marketing" ? sc.marketing?.star
    : sc.communityVisibility?.star;
  return s === "gold" || s === "silver" ? s : null;
}

function metricValueBenchmark(
  sc: ScorecardData,
  k: MetricKey,
  cohortMedianRetention18: number | null = null
): { value: string; benchmark: string; sub: string[]; interpretation: string } {
  if (k === "dom") {
    const dom = sc.performance?.domT12;
    // Benchmark against the same-quadrant peer (cohort) median — the population
    // the position bar + star are scored against — NOT the whole-MSA median.
    // The MSA-wide figure mixes in fast-leasing large MF/BTR and makes a
    // scattered-SFR operator look like a laggard against operators that aren't
    // its peers; every other Operating Performance card benchmarks against the
    // cohort median, so this makes Lease-up consistent. Fall back to the
    // MSA-wide median (labeled as such) only when the peer median is missing.
    const cohort = sc.performance?.peerQuadrantDomT12;
    const mkt = sc.performance?.marketDomT12;
    const benchN = cohort != null ? cohort : mkt ?? null;
    const benchIsCohort = cohort != null;
    return {
      value: dom != null ? `${Math.round(dom)}d` : "—",
      benchmark: benchN != null ? `${benchIsCohort ? "cohort" : "market"} ${Math.round(benchN)}d` : "",
      sub: [sc.performance?.houseDomT12 != null ? `Houses ${Math.round(sc.performance.houseDomT12)}d` : "",
            sc.performance?.aptDomT12 != null ? `Apartments ${Math.round(sc.performance.aptDomT12)}d` : ""].filter(Boolean),
      interpretation: dom == null ? ""
        : benchN != null
          ? `Leases in about ${Math.round(dom)} days, versus a ${Math.round(benchN)}-day ${benchIsCohort ? "cohort median" : "market-wide median"}.`
          : `Leases in about ${Math.round(dom)} days.`,
    };
  }
  if (k === "rentPerformance") {
    const pm = sc.rentPerformance?.pmYoyChange;
    const med = sc.rentPerformance?.cohortMedianYoyChange;
    return {
      value: pm != null ? `${(pm * 100).toFixed(1)}%` : "—",
      benchmark: med != null ? `cohort ${(med * 100).toFixed(1)}%` : "",
      sub: [],
      interpretation: pm == null ? ""
        : med != null
          ? `Year-over-year rent change of ${(pm * 100).toFixed(1)}%, versus a ${(med * 100).toFixed(1)}% cohort median.`
          : `Year-over-year rent change of ${(pm * 100).toFixed(1)}%.`,
    };
  }
  if (k === "marketing") {
    const cs = sc.marketing?.compositeScore;
    return {
      value: cs != null ? String(Math.round(cs)) : "—",
      benchmark: "quality / 100", sub: [],
      interpretation: cs != null
        ? `Composite listing-quality score of ${Math.round(cs)} out of 100 (photos, description, completeness).`
        : "",
    };
  }
  if (k === "tenancy") {
    // Survival-based retention metric: retention18Pct = % of tenancies that
    // reach 18 months (higher = stickier). Suppressed (or missing) operators
    // show the caveat reason instead of a value — never overallGap/
    // multiEpisodePct, which are decoys for the old months-based display.
    const r = sc.tenancy?.retention18Pct;
    if (sc.tenancy?.tenancySuppressed || r == null) {
      return {
        value: "—",
        benchmark: "",
        sub: [],
        interpretation: sc.tenancy?.tenancySuppressedReason ?? "",
      };
    }
    // Big value is a clean percentage ("63%") so it fits the fixed-width
    // headline slot the other cards use ("23d", "6.3%"); the "stay 1.5+ years"
    // meaning lives in the interpretation sentence.
    return {
      value: `${Math.round(r)}%`,
      benchmark: cohortMedianRetention18 != null ? `cohort ${Math.round(cohortMedianRetention18)}%` : "",
      sub: [],
      interpretation: cohortMedianRetention18 != null
        ? `About ${Math.round(r)}% of ${sc.pm.name}'s tenancies reach 1.5 years, versus a ${Math.round(cohortMedianRetention18)}% cohort median.`
        : `About ${Math.round(r)}% of ${sc.pm.name}'s tenancies reach 1.5 years.`,
    };
  }
  return { value: "—", benchmark: "", sub: [], interpretation: "" };
}

function buildScaleFitTakeaway(sc: ScorecardData): string {
  const type = sc.pm.quadrant7Cell ?? "operator";
  return `${sc.pm.name} operates in ${sc.market.fullName} as a ${type}.`;
}

function momentumTakeaway(name: string, driver: "portfolio" | "quality" | "reach" | "none", dir: MomentumDirection): string {
  if (driver === "none" || dir === "insufficient") return `Not enough history yet to read ${name}'s trajectory.`;
  if (dir === "volatile") return `${name}'s recent estimates are volatile — interpret recent moves cautiously.`;
  if (driver === "portfolio") {
    return `${name} appears ${dir === "growing" ? "larger" : dir === "declining" ? "smaller" : "steady"} versus when first observed.`;
  }
  if (driver === "quality") {
    return `Operating quality has been trending ${dir === "growing" ? "up" : dir === "declining" ? "down" : "steady"} for ${name}.`;
  }
  return `Geographic footprint has been ${dir === "growing" ? "expanding" : dir === "declining" ? "contracting" : "steady"} for ${name}.`;
}

export function buildScorecardView(input: BuildViewInput): ScorecardView {
  const { scorecard } = input;
  const pool = input.pool as PoolMember[];
  const { goldCount, silverCount } = countOperatorStars(scorecard);
  const companyId = scorecard.pm.companyId ?? null;

  // Multi-market = the operator's canonical has member markets OTHER than the
  // one being viewed. Every operator carries a canonicalOperatorId (its own
  // canonical), so "has a canonical id" is NOT a multi-market signal — a
  // single-market operator would otherwise show "Also operates in <its own
  // market>" and a "Multi-market" footprint. Exclude the home market from the
  // member list and gate on what remains.
  const otherMarketNames = (input.memberMarketNames ?? []).filter(
    (n) => n !== scorecard.market.fullName
  );
  const isMultiMarket = otherMarketNames.length > 0;

  const header: HeaderView = {
    name: scorecard.pm.name,
    quadrant7Cell: scorecard.pm.quadrant7Cell ?? null,
    marketFullName: scorecard.market.fullName,
    singleMarket: !isMultiMarket,
    goldCount,
    silverCount,
    dwellsyCompanyUrl: companyId ? `https://dwellsy.com/company/${companyId}` : null,
    website: scorecard.pm.website ?? null,
  };

  const opLabel = operatingPerformanceLabel(scorecard);

  // Placeholder value strings are filled by later tasks (scale/momentum/watch).
  const readout: ReadoutRow[] = [
    { area: "Scale & Fit", value: "" },
    { area: "Operating Performance", value: "", label: opLabel },
    { area: "Momentum", value: "" },
    { area: "Watch Items", value: "" },
  ];

  const pe = scorecard.portfolioEstimate;
  const geo = scorecard.geographicCoverage;
  const conc = scorecard.lendingSignals?.geographicConcentration;

  const isMultifamily = (scorecard.pm.quadrant7Cell ?? "").includes("MF/BTR");
  const rawCommunities = scorecard.coverage?.observedCommunities ?? null;
  const communitiesObserved = isMultifamily ? rawCommunities : null;
  const months = scorecard.coverage?.monthsOnPlatform ?? null;
  const thin = isMultifamily && rawCommunities != null && rawCommunities <= 2;

  const focalRentInput = { pm: { slug: scorecard.pm.slug }, rentTrajectory: scorecard.rentTrajectory };
  const poolRentInputs = pool.map((m) => ({ pm: { slug: m.slug }, rentTrajectory: m.scorecard.rentTrajectory }));

  // Rent-stability / operator-tenure — reuse the Layer-4 lending-signal
  // builders (src/lib/lending-signals.ts) rather than recomputing.
  // buildLendingSignals finds its own focal by slug match inside `pool`,
  // so the focal's own scorecard must be present in the pool passed here
  // (the msaPool loaders used elsewhere already include it; test fixtures
  // must too, or these signals come back null).
  const focal = { slug: scorecard.pm.slug, scorecard };
  const lendingPool = pool.some((m) => m.slug === scorecard.pm.slug)
    ? (pool as unknown as PoolPm[])
    : ([focal, ...pool] as unknown as PoolPm[]);
  const marketCount = input.marketCount ?? 1;
  // buildLendingSignals's operatorStability builder dereferences
  // scorecard.performance/tenancy/coverage directly (no optional chaining)
  // on the focal AND on every pool member (cohort-median computation), so
  // it throws on partial ScorecardData anywhere in lendingPool. The real
  // precondition is that coverage + tenancy are present on every member;
  // guard on that instead of a blanket try/catch so genuine future
  // exceptions inside the builder aren't silently swallowed. True for
  // real seeded ScorecardData — only ad hoc/partial fixtures hit this.
  const lendingPreconditionMet =
    !!scorecard.coverage &&
    !!scorecard.tenancy &&
    lendingPool.every((p) => !!p.scorecard.coverage && !!p.scorecard.tenancy);
  const lendingSignals: ReturnType<typeof buildLendingSignals> =
    lendingPreconditionMet
      ? buildLendingSignals(scorecard, lendingPool, marketCount)
      : { operatorStability: null, geographicConcentration: null, pricingTier: null };

  const yearsVisible = scorecard.coverage?.yearsVisible ?? scorecard.tenancy?.yearsVisible ?? null;
  const tenure: ScaleFitView["tenure"] = yearsVisible != null
    ? {
        yearsVisible,
        marketCount,
        cohortMedianYears: lendingSignals.operatorStability?.dist.cohortMedian ?? null,
      }
    : null;

  // Concession detail — reuse the Layer-5 concession-context builder rather
  // than recomputing the market median or pattern/sample formatting.
  // concessionRate is a 0-1 fraction on ScorecardData (mirrored in
  // page.tsx / OperatorProfilePDF.tsx as `rate * 100`); ratePct here
  // scales it to 0-100 for display, matching those call sites. Null when
  // the operator has no concession signal (rate absent) or a literal 0
  // rate (no concessions observed) — a "0%" concession callout isn't a
  // fact worth surfacing on its own row.
  // buildConcessionContext dereferences scorecard.coverage.t12Listings
  // directly (no optional chaining); guard on that precondition rather
  // than assuming it — true for real seeded ScorecardData, but partial
  // fixtures/callers can omit coverage.
  const concessionContext = scorecard.coverage
    ? buildConcessionContext(scorecard, pool as unknown as PoolPm[])
    : null;
  const concession: OperatingView["concession"] =
    concessionContext && concessionContext.rate != null && concessionContext.rate > 0
      ? {
          ratePct: concessionContext.rate * 100,
          marketRatePct: concessionContext.marketRate != null ? concessionContext.marketRate * 100 : null,
          patterns: uniquePatternLabels(concessionContext.patterns),
          samples: concessionContext.samples.slice(0, 3).map(formatConcessionSample),
          ...concessionDetail(
            concessionContext.rate * 100,
            concessionContext.marketRate != null ? concessionContext.marketRate * 100 : null
          ),
        }
      : null;

  // Apartment/house unit mix — only meaningful for operators with
  // both-type visibility (SFR + Hybrid per metric-definitions.ts); pure
  // MF/BTR operators don't carry a house/apt split worth surfacing. Null
  // when the observed split totals zero (nothing to show either way).
  const q7 = scorecard.pm.quadrant7Cell ?? "";
  const isSfrOrHybrid = q7.startsWith("SFR") || q7 === "Hybrid";
  const houseUrusT12 = scorecard.performance?.houseUrusT12 ?? 0;
  const aptUrusT12 = scorecard.performance?.aptUrusT12 ?? 0;
  const unitMix: ScaleFitView["unitMix"] =
    isSfrOrHybrid && houseUrusT12 + aptUrusT12 > 0
      ? { houseUrus: houseUrusT12, aptUrus: aptUrusT12 }
      : null;

  // Cross-market footprint — only when the operator has member markets beyond
  // the one being viewed (isMultiMarket, computed above). marketNames lists
  // only those OTHER markets (home excluded), so "Also operates in" never
  // echoes the current market. page.tsx does the member-enumeration query +
  // loads loadOperatorAggregateTrajectory; the view-model shapes what it's
  // handed. Single-market operators get null (no back-link, no chip list).
  const crossMarket: ScaleFitView["crossMarket"] = isMultiMarket
    ? {
        canonicalSlug: scorecard.canonicalOperatorId!,
        marketNames: otherMarketNames,
      }
    : null;

  // v0.6.5 — the pipeline's portfolioEstimate wins when it carries a point
  // (with its P25–P75 band + confidence). Otherwise fall back to the read-time
  // "estimated managed units": turnover-adjusted urusT12 for SFR, declared
  // community units for MF. Gated on !thin so a thin MF operator (≤2
  // communities) keeps the "self-report needed" framing rather than showing a
  // noisy estimate off almost no data.
  const sfrMultiplier = input.sfrMultiplier ?? DEFAULT_SFR_TURNOVER_MULTIPLIER;
  const fallbackEstPoint = thin
    ? null
    : estimatedManagedUnits(
        {
          quadrant7Cell: scorecard.pm.quadrant7Cell ?? null,
          urusT12: scorecard.coverage?.urusT12 ?? null,
          observedCommunityTotalUnits:
            scorecard.coverage?.observedCommunityTotalUnits ?? null,
        },
        sfrMultiplier
      );
  const estimate: ScaleFitView["estimate"] =
    pe?.point != null
      ? {
          point: pe.point, low: pe.low ?? null, high: pe.high ?? null,
          confidence: pe.confidence ?? null, status: pe.status ?? "estimated", message: pe.message ?? null,
        }
      : fallbackEstPoint != null
        ? {
            point: fallbackEstPoint, low: null, high: null, confidence: null,
            status: "estimated",
            message: "Turnover-adjusted estimate from units observed on-market (T12).",
          }
        : {
            point: null, low: pe?.low ?? null, high: pe?.high ?? null,
            confidence: pe?.confidence ?? null, status: pe?.status ?? "insufficient_data", message: pe?.message ?? null,
          };

  const scaleFit: ScaleFitView = {
    takeaway: buildScaleFitTakeaway(scorecard),
    observedUnits: scorecard.coverage?.urusT12 ?? null,
    estimate,
    topCities: geo?.topCities ?? [],
    top3Share: conc?.top3CityShare ?? null,
    cohortTop3: conc?.cohortMedianTop3 ?? null,
    rentTier: rentTierDetail(focalRentInput, poolRentInputs),
    communitiesObserved,
    propertyType: scorecard.pm.quadrant7Cell ?? null,
    citiesObserved: scorecard.coverage?.citiesObserved ?? null,
    singleMarket: header.singleMarket,
    tenure,
    unitMix,
    crossMarket,
  };

  const maturityLead = (months != null && months >= 18) ? "Limited footprint" : "Early coverage";
  const maturityNote: string | null = thin
    ? `${maturityLead} — ${months ?? "under 12"} months observed across ${communitiesObserved} ${communitiesObserved === 1 ? "community" : "communities"}. Treat estimates, trends, and cohort comparisons as provisional.`
    : null;

  const typeLabel = scorecard.pm.quadrant7Cell ?? "operator";
  const mktShort = scorecard.market.name ?? scorecard.market.fullName;
  const units = scorecard.coverage?.totalObservedUnits ?? scorecard.coverage?.urusT12 ?? "—";
  if (estimate.point != null) {
    readout[0].value = `${typeLabel} in ${mktShort} · ~${estimate.point.toLocaleString()} managed units (est.)`;
  } else if (communitiesObserved != null) {
    readout[0].value = `${typeLabel} in ${mktShort} · ${communitiesObserved} ${communitiesObserved === 1 ? "community" : "communities"} · ${units} units observed — self-report needed for a portfolio estimate`;
  } else {
    readout[0].value = `${typeLabel} in ${mktShort} · ${pe?.message ?? "portfolio size not estimated"}`;
  }

  const labels = metricLabels(scorecard);
  const sw = strongestAndWatch(scorecard);
  const metricKeys: MetricKey[] = ["dom", "tenancy", "rentPerformance", "marketing", "communityVisibility"];
  // Position bar uses the primary 7-cell cohort percentile (same population as
  // the star + label), not the MSA-wide flat value — so bar, label, and star
  // all read against the same "same-cohort peers" the section describes.
  const pcts = Object.fromEntries(
    metricKeys.map((k) => [k, metricCohortPercentile(scorecard, k)])
  ) as Record<MetricKey, number | null>;
  // Cohort-median retention (% reaching 18 months) for the Tenant Retention
  // comparison — median the primary 7-cell cohort's retention18Pct across
  // QUALIFIED peers from the pool. null when the cohort is empty.
  const cohortQ7 = scorecard.pm.quadrant7Cell ?? null;
  const cohortRetention = cohortQ7
    ? pool
        .filter((m) => m.scorecard.pm?.quadrant7Cell === cohortQ7
          && m.scorecard.tenancy?.tenancyQualified === true
          && m.scorecard.tenancy?.retention18Pct != null)
        .map((m) => m.scorecard.tenancy!.retention18Pct as number)
        .sort((a, b) => a - b)
    : [];
  const cohortMedianRetention18 =
    cohortRetention.length > 0
      ? cohortRetention[Math.floor((cohortRetention.length - 1) / 2)]
      : null;
  const metrics: MetricRow[] = metricKeys
    .filter((k) => pcts[k] != null || metricStar(scorecard, k) != null
      || (k === "tenancy" && scorecard.tenancy?.tenancySuppressed === true))
    .map((k) => {
      const vb = metricValueBenchmark(scorecard, k, k === "tenancy" ? cohortMedianRetention18 : null);
      return { key: k, title: METRIC_TITLES[k], label: labels[k], value: vb.value,
        benchmark: vb.benchmark, position: pcts[k] != null ? pcts[k]! / 100 : null,
        star: metricStar(scorecard, k), sub: vb.sub, interpretation: vb.interpretation };
    });
  const aboveCount = metrics.filter((m) => m.label === "strong" || m.label === "good").length;
  const operatingTakeaway = metrics.length === 0
    ? "Insufficient data to score operating performance."
    : aboveCount === metrics.length
      ? `Above the cohort median on all ${metrics.length} scored dimensions.`
      : aboveCount === 0
        ? `Below the cohort median on all ${metrics.length} scored dimensions.`
        : `Above the cohort median on ${aboveCount} of ${metrics.length} scored dimensions.`;
  const operating: OperatingView = {
    sectionLabel: opLabel, takeaway: operatingTakeaway,
    strongest: sw.strongest.map((k) => METRIC_TITLES[k]),
    watch: sw.watch.map((k) => METRIC_TITLES[k]), metrics,
    concession,
  };
  readout[1].value = `Above cohort median on ${aboveCount} of ${metrics.length} scored dimensions`;

  const portfolioSeries = (input.trajectory?.points ?? [])
    .map((p) => p.portfolioPoint)
    .filter((n): n is number => n != null);
  const reachSeries = (input.trajectory?.points ?? [])
    .map((p) => p.submarketCount)
    .filter((n): n is number => n != null);
  const qualitySeries = (input.trajectory?.points ?? [])
    .map((p) =>
      p.goldCount != null || p.silverCount != null
        ? (p.goldCount ?? 0) * 2 + (p.silverCount ?? 0)
        : null
    )
    .filter((n): n is number => n != null);
  // Listing share: operator's fraction of its market's T12 listings per
  // snapshot. momentumDirection is scale-invariant (relative to first), so
  // the raw fraction drives both the sparkline shape and its direction.
  const shareSeries = (input.trajectory?.points ?? [])
    .map((p) => p.shareOfMarket)
    .filter((n): n is number => n != null);
  // Cross-market footprint — distinct member markets present per aggregate-
  // trajectory quarter. Gated on isMultiMarket so a single-market operator
  // never shows a footprint sparkline even if an aggregateTrajectory is
  // passed in (matches the ScaleFit cross-market block's gate).
  const footprintSeries = isMultiMarket
    ? (input.aggregateTrajectory?.points ?? []).map((p) => p.marketsPresent)
    : [];
  const portfolioDir = momentumDirection({ values: portfolioSeries });
  const reachDir = momentumDirection({ values: reachSeries });
  const qualityDir = momentumDirection({ values: qualitySeries });
  const mkSpark = (key: "portfolio" | "share" | "reach" | "quality" | "footprint", label: string, series: number[]) =>
    ({ key, label, series, direction: momentumDirection({ values: series }) });

  // Best-available series drives the section direction + readout, in priority
  // order [portfolio, quality, reach] — MF/BTR operators with no self-report
  // have an empty portfolio series (portfolioEstimate.status = "insufficient_data")
  // but may still have 50+ months of real reach/quality history.
  const driver: "portfolio" | "quality" | "reach" | "none" =
    portfolioDir !== "insufficient" ? "portfolio"
    : qualityDir !== "insufficient" ? "quality"
    : reachDir !== "insufficient" ? "reach"
    : "none";
  const sectionDirection: MomentumDirection =
    driver === "portfolio" ? portfolioDir
    : driver === "quality" ? qualityDir
    : driver === "reach" ? reachDir
    : "insufficient";

  const momentum: MomentumView = {
    direction: sectionDirection,
    takeaway: momentumTakeaway(scorecard.pm.name, driver, sectionDirection),
    sparklines: [
      mkSpark("portfolio", "Portfolio", portfolioSeries),
      mkSpark("share", "Listing share", shareSeries),
      mkSpark("reach", "Geographic reach", reachSeries),
      mkSpark("quality", "Operating quality", qualitySeries),
      mkSpark("footprint", "Cross-market footprint", footprintSeries), // [] for single-market operators
    ],
  };
  // Surface the momentum direction as a chip in the 30-second readout (parity
  // with the sidebar nav + the Momentum section header). Omit "insufficient"
  // so a "building history" operator shows no chip, matching the nav.
  readout[2].label = sectionDirection === "insufficient" ? undefined : sectionDirection;
  if (driver === "portfolio") {
    if (portfolioDir === "growing") {
      readout[2].value = "Portfolio larger than when first observed";
    } else if (portfolioDir === "declining") {
      readout[2].value = "Portfolio smaller than when first observed";
    } else if (portfolioDir === "stable") {
      readout[2].value = "Portfolio steady since first observed";
    } else {
      readout[2].value = "Long-term trend up, recent estimates volatile";
    }
  } else if (driver === "quality") {
    readout[2].value = `Operating quality trending ${qualityDir === "growing" ? "up" : qualityDir === "declining" ? "down" : qualityDir === "volatile" ? "volatile" : "flat"}`;
  } else if (driver === "reach") {
    readout[2].value = `Geographic reach ${reachDir === "growing" ? "expanding" : reachDir === "declining" ? "contracting" : reachDir === "volatile" ? "volatile" : "steady"}`;
  } else {
    readout[2].value = `Building history${months != null ? ` (${months} mo observed)` : ""}`;
  }

  const watchItems = buildWatchItems(
    scorecard,
    input.marketConcessionMedian,
    input.trajectory as unknown as WatchTrajectory | undefined
  );
  const candidates: PeerCandidate[] = pool.map((m) => ({
    slug: m.slug, name: m.name, quadrant7Cell: m.quadrant7Cell,
    // Same size basis as the focal operator so peer matching compares like
    // with like: pipeline estimate when present, else read-time estimate.
    estimatedUnits:
      m.scorecard.portfolioEstimate?.point ??
      estimatedManagedUnits(
        {
          quadrant7Cell: m.quadrant7Cell,
          urusT12: m.scorecard.coverage?.urusT12 ?? null,
          observedCommunityTotalUnits:
            m.scorecard.coverage?.observedCommunityTotalUnits ?? null,
        },
        sfrMultiplier
      ),
    operatingLabel: operatingPerformanceLabel(m.scorecard),
  }));
  const peers = selectSimilarLocalPlayers(scorecard.pm.slug, candidates, { limit: 4 });
  const flagged = watchItems.filter((w) => w.kind !== "positive").map((w) => w.headline);
  readout[3].value = flagged.length > 0
    ? flagged.slice(0, 3).join(" · ")
    : (watchItems.length > 0 ? "positives only" : "none");
  readout[3].label = flagged.length > 0 ? `${flagged.length} to review` : undefined;

  return { header, readout, scaleFit, operating, momentum, watchItems, peers, maturityNote };
}
