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
import {
  vacancyDetail,
  rentStabilityDetail,
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
  // vacancy/rent-stability/concession cards). "" → fall back to benchmark.
  interpretation: string;
}
export interface OperatingView {
  sectionLabel: ScoreLabel; takeaway: string; strongest: string[]; watch: string[]; metrics: MetricRow[];
  // `interpretation`/`tone`/`definition` bring these re-enriched cards to parity
  // with the scored metric cards (see operating-detail.ts).
  vacancy: { pct: number; cohortMedianPct: number | null; star: "gold" | "silver" | null; interpretation: string; tone: MetricTone; definition: string } | null;
  rentStability: { volatilityPP: number | null; cohortMedianPP: number | null; suppressed: boolean; reason: string | null; star: "gold" | "silver" | null; interpretation: string; tone: MetricTone; definition: string } | null;
  concession: { ratePct: number; marketMedianPct: number | null; patterns: string[]; samples: string[]; interpretation: string; tone: MetricTone; definition: string } | null;
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
    }>;
  };
  marketConcessionMedian: number | null;
  marketCount?: number;
  /** Cross-market aggregate trajectory (multi-market operators only) —
   *  fed by page.tsx via loadOperatorAggregateTrajectory(memberPmSlugs).
   *  Each point's marketsPresent count drives the "footprint" sparkline. */
  aggregateTrajectory?: { points: Array<{ portfolioPoint: number | null; marketsPresent: number }> };
  /** Distinct member-market display names (multi-market operators only). */
  memberMarketNames?: string[];
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
  tenancyCohortMedianMonths: number | null = null
): { value: string; benchmark: string; sub: string[]; interpretation: string } {
  if (k === "dom") {
    const dom = sc.performance?.domT12;
    const mkt = sc.performance?.marketDomT12;
    return {
      value: dom != null ? `${Math.round(dom)}d` : "—",
      benchmark: mkt != null ? `market avg ${Math.round(mkt)}d` : "",
      sub: [sc.performance?.houseDomT12 != null ? `Houses ${Math.round(sc.performance.houseDomT12)}d` : "",
            sc.performance?.aptDomT12 != null ? `Apartments ${Math.round(sc.performance.aptDomT12)}d` : ""].filter(Boolean),
      interpretation: dom == null ? ""
        : mkt != null
          ? `Leases in about ${Math.round(dom)} days, versus a ${Math.round(mkt)}-day market average.`
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
    // The retention metric is overallGap = median months between successive
    // listings of the same unit (longer = stickier); higher is better. NOT
    // multiEpisodePct, which is only the analysis-pool size (% of units listed
    // 2+ times) — surfacing that as the headline made strong operators look
    // weak (e.g. Crye Leike: 13.1mo / 82.7th pctile shown as "44%").
    const gap = sc.tenancy?.overallGap;
    const multiUnits = sc.tenancy?.multiEpisodeUnits;
    return {
      value: gap != null ? `${gap.toFixed(1)}mo` : "—",
      benchmark: tenancyCohortMedianMonths != null ? `cohort ${tenancyCohortMedianMonths.toFixed(1)} mo` : "",
      sub: multiUnits != null ? [`based on ${multiUnits.toLocaleString()} repeat-listed units`] : [],
      interpretation: gap == null ? ""
        : tenancyCohortMedianMonths != null
          ? `Median tenancy of about ${gap.toFixed(1)} months, versus a ${tenancyCohortMedianMonths.toFixed(1)}-month cohort median (longer = stickier).`
          : `Median tenancy of about ${gap.toFixed(1)} months (longer = stickier).`,
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

  // Vacancy / rent-stability / operator-tenure — reuse the Layer-4
  // lending-signal builders (src/lib/lending-signals.ts) rather than
  // recomputing. buildLendingSignals finds its own focal by slug match
  // inside `pool`, so the focal's own scorecard must be present in the
  // pool passed here (the msaPool loaders used elsewhere already include
  // it; test fixtures must too, or these signals come back null).
  const focal = { slug: scorecard.pm.slug, scorecard };
  const lendingPool = pool.some((m) => m.slug === scorecard.pm.slug)
    ? (pool as unknown as PoolPm[])
    : ([focal, ...pool] as unknown as PoolPm[]);
  const marketCount = input.marketCount ?? 1;
  // buildLendingSignals's vacancy/operatorStability builders dereference
  // scorecard.performance/tenancy/coverage directly (no optional chaining)
  // on the focal AND on every pool member (cohort-median computation), so
  // they throw on partial ScorecardData anywhere in lendingPool. The real
  // precondition is that coverage + tenancy are present on every member;
  // guard on that instead of a blanket try/catch so genuine future
  // exceptions inside the builders aren't silently swallowed. True for
  // real seeded ScorecardData — only ad hoc/partial fixtures hit this.
  const lendingPreconditionMet =
    !!scorecard.coverage &&
    !!scorecard.tenancy &&
    lendingPool.every((p) => !!p.scorecard.coverage && !!p.scorecard.tenancy);
  const lendingSignals: ReturnType<typeof buildLendingSignals> =
    lendingPreconditionMet
      ? buildLendingSignals(scorecard, lendingPool, marketCount)
      : { vacancy: null, rentStability: null, operatorStability: null, geographicConcentration: null, pricingTier: null };

  const vacancy: OperatingView["vacancy"] = lendingSignals.vacancy?.vacancyPct != null
    ? {
        pct: lendingSignals.vacancy.vacancyPct,
        cohortMedianPct: lendingSignals.vacancy.dist.cohortMedian,
        star: lendingSignals.vacancy.star,
        ...vacancyDetail(lendingSignals.vacancy.vacancyPct, lendingSignals.vacancy.dist.cohortMedian),
      }
    : null;

  const rentStability: OperatingView["rentStability"] = lendingSignals.rentStability
    ? {
        volatilityPP: lendingSignals.rentStability.volatilityPP,
        cohortMedianPP: lendingSignals.rentStability.cohortMedianVolatility,
        suppressed: lendingSignals.rentStability.suppressed,
        reason: lendingSignals.rentStability.reason ?? null,
        star: lendingSignals.rentStability.star,
        ...rentStabilityDetail(
          lendingSignals.rentStability.volatilityPP,
          lendingSignals.rentStability.cohortMedianVolatility
        ),
      }
    : null;

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
          marketMedianPct: concessionContext.marketMedianRate != null ? concessionContext.marketMedianRate * 100 : null,
          patterns: uniquePatternLabels(concessionContext.patterns),
          samples: concessionContext.samples.slice(0, 3).map(formatConcessionSample),
          ...concessionDetail(
            concessionContext.rate * 100,
            concessionContext.marketMedianRate != null ? concessionContext.marketMedianRate * 100 : null
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

  const scaleFit: ScaleFitView = {
    takeaway: buildScaleFitTakeaway(scorecard),
    observedUnits: scorecard.coverage?.urusT12 ?? null,
    estimate: {
      point: pe?.point ?? null, low: pe?.low ?? null, high: pe?.high ?? null,
      confidence: pe?.confidence ?? null, status: pe?.status ?? "insufficient_data", message: pe?.message ?? null,
    },
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
  if (pe?.point != null) {
    readout[0].value = `${typeLabel} in ${mktShort} · ~${pe.point} est. units`;
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
  // Cohort-median tenancy (months) for the Tenant Retention comparison — the
  // seed carries only a percentile per operator, so median the primary 7-cell
  // cohort's overallGap from the pool. null when the cohort is empty.
  const cohortQ7 = scorecard.pm.quadrant7Cell ?? null;
  const cohortGapMonths = cohortQ7
    ? pool
        .filter((m) => m.scorecard.pm?.quadrant7Cell === cohortQ7 && m.scorecard.tenancy?.overallGap != null)
        .map((m) => m.scorecard.tenancy!.overallGap as number)
        .sort((a, b) => a - b)
    : [];
  const tenancyCohortMedianMonths =
    cohortGapMonths.length > 0
      ? cohortGapMonths[Math.floor((cohortGapMonths.length - 1) / 2)]
      : null;
  const metrics: MetricRow[] = metricKeys
    .filter((k) => pcts[k] != null || metricStar(scorecard, k) != null)
    .map((k) => {
      const vb = metricValueBenchmark(scorecard, k, k === "tenancy" ? tenancyCohortMedianMonths : null);
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
    vacancy, rentStability, concession,
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
  // Cross-market footprint — distinct member markets present per aggregate-
  // trajectory quarter. Empty for single-market operators (no
  // aggregateTrajectory passed in) — the component hides an empty series.
  const footprintSeries = (input.aggregateTrajectory?.points ?? []).map(
    (p) => p.marketsPresent
  );
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
      mkSpark("share", "Listing share", []), // deferred: needs t12ListingsCount history (Phase 4b)
      mkSpark("reach", "Geographic reach", reachSeries),
      mkSpark("quality", "Operating quality", qualitySeries),
      mkSpark("footprint", "Cross-market footprint", footprintSeries), // [] for single-market operators
    ],
  };
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
    estimatedUnits: m.scorecard.portfolioEstimate?.point ?? null,
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
