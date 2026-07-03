// v0.24 — assembles the redesigned scorecard's view model from already-loaded
// data + the Phase-1 derivation library. Pure; no I/O. Components consume
// ScorecardView and never touch raw ScorecardData. Never surfaces raw
// rank/composite — only labels, values-vs-benchmark, stars, positions.

import type { ScorecardData } from "@/lib/types";
import { countOperatorStars } from "@/lib/operators/stars";
import { operatingPerformanceLabel, type ScoreLabel, metricLabels, strongestAndWatch, type MetricKey } from "./labels";
import { momentumDirection, type MomentumDirection } from "./momentum";
import { buildWatchItems, type WatchItem } from "./watch-items";
import { selectSimilarLocalPlayers, type PeerCandidate, type SelectedPeer } from "./peers";

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
  estimate: { point: number | null; low: number | null; high: number | null; confidence: string | null; status: string };
  topCities: Array<{ name: string; pct: number }>;
  top3Share: number | null;
  cohortTop3: number | null;
  rentTierPosition: number | null;
  propertyType: string | null;
  citiesObserved: number | null;
  singleMarket: boolean;
}

export interface MetricRow {
  key: MetricKey; title: string; label: ScoreLabel; value: string; benchmark: string;
  position: number | null; star: "gold" | "silver" | null; sub: string[];
}
export interface OperatingView {
  sectionLabel: ScoreLabel; strongest: string[]; watch: string[]; metrics: MetricRow[];
}

export interface MomentumView {
  direction: MomentumDirection;
  takeaway: string;
  sparklines: Array<{ key: "portfolio" | "share" | "reach" | "quality"; label: string; direction: MomentumDirection; series: number[] }>;
}

export interface ScorecardView {
  header: HeaderView;
  readout: ReadoutRow[];
  scaleFit: ScaleFitView;
  operating: OperatingView;
  momentum: MomentumView;
  watchItems: WatchItem[];
  peers: SelectedPeer[];
}

export interface BuildViewInput {
  scorecard: ScorecardData;
  pool: unknown[];
  trajectory: { points: Array<{ portfolioPoint: number | null }> };
  marketConcessionMedian: number | null;
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

function metricValueBenchmark(sc: ScorecardData, k: MetricKey): { value: string; benchmark: string; sub: string[] } {
  if (k === "dom") return {
    value: sc.performance?.domT12 != null ? `${Math.round(sc.performance.domT12)}d` : "—",
    benchmark: sc.performance?.marketDomT12 != null ? `market avg ${Math.round(sc.performance.marketDomT12)}d` : "",
    sub: [sc.performance?.houseDomT12 != null ? `Houses ${Math.round(sc.performance.houseDomT12)}d` : "",
          sc.performance?.aptDomT12 != null ? `Apartments ${Math.round(sc.performance.aptDomT12)}d` : ""].filter(Boolean),
  };
  if (k === "rentPerformance") return {
    value: sc.rentPerformance?.pmYoyChange != null ? `${(sc.rentPerformance.pmYoyChange * 100).toFixed(1)}%` : "—",
    benchmark: sc.rentPerformance?.cohortMedianYoyChange != null ? `cohort ${(sc.rentPerformance.cohortMedianYoyChange * 100).toFixed(1)}%` : "",
    sub: [],
  };
  if (k === "marketing") return {
    value: sc.marketing?.compositeScore != null ? String(Math.round(sc.marketing.compositeScore)) : "—",
    benchmark: "quality / 100", sub: [],
  };
  if (k === "tenancy") return {
    value: sc.tenancy?.multiEpisodePct != null ? `${Math.round(sc.tenancy.multiEpisodePct * 100)}%` : "—",
    benchmark: "re-list rate (lower = stickier)", sub: [],
  };
  return { value: "—", benchmark: "", sub: [] };
}

function buildScaleFitTakeaway(sc: ScorecardData): string {
  const type = sc.pm.quadrant7Cell ?? "operator";
  return `${sc.pm.name} operates in ${sc.market.fullName} as a ${type}.`;
}

function momentumTakeaway(name: string, dir: MomentumDirection): string {
  if (dir === "insufficient") return `Not enough history yet to read ${name}'s trajectory.`;
  if (dir === "volatile") return `${name}'s recent estimates are volatile — interpret recent moves cautiously.`;
  return `${name} appears ${dir === "growing" ? "larger" : dir === "declining" ? "smaller" : "steady"} versus when first observed.`;
}

function momentumReadout(dir: MomentumDirection): string {
  return dir === "insufficient" ? "Building history" : dir[0].toUpperCase() + dir.slice(1);
}

export function buildScorecardView(input: BuildViewInput): ScorecardView {
  const { scorecard } = input;
  const { goldCount, silverCount } = countOperatorStars(scorecard);
  const companyId = scorecard.pm.companyId ?? null;

  const header: HeaderView = {
    name: scorecard.pm.name,
    quadrant7Cell: scorecard.pm.quadrant7Cell ?? null,
    marketFullName: scorecard.market.fullName,
    singleMarket:
      !scorecard.canonicalOperatorId ||
      scorecard.canonicalOperatorId === scorecard.pm.slug,
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
  const scaleFit: ScaleFitView = {
    takeaway: buildScaleFitTakeaway(scorecard),
    observedUnits: scorecard.coverage?.urusT12 ?? null,
    estimate: {
      point: pe?.point ?? null, low: pe?.low ?? null, high: pe?.high ?? null,
      confidence: pe?.confidence ?? null, status: pe?.status ?? "insufficient_data",
    },
    topCities: geo?.topCities ?? [],
    top3Share: conc?.top3CityShare ?? null,
    cohortTop3: conc?.cohortMedianTop3 ?? null,
    rentTierPosition: null, // computed in the components/pricing phase from operator rent vs MSA distribution
    propertyType: scorecard.pm.quadrant7Cell ?? null,
    citiesObserved: scorecard.coverage?.citiesObserved ?? null,
    singleMarket: header.singleMarket,
  };

  readout[0].value = pe?.point != null
    ? `~${pe.point} est. units · ${pe.confidence ?? "unrated"} confidence`
    : (pe?.message ?? "Portfolio size not estimated");

  const labels = metricLabels(scorecard);
  const sw = strongestAndWatch(scorecard);
  const metricKeys: MetricKey[] = ["dom", "tenancy", "rentPerformance", "marketing", "communityVisibility"];
  const pcts = scorecard.rank?.percentiles ?? ({} as Record<MetricKey, number | null>);
  const metrics: MetricRow[] = metricKeys
    .filter((k) => pcts[k] != null || metricStar(scorecard, k) != null)
    .map((k) => {
      const vb = metricValueBenchmark(scorecard, k);
      return { key: k, title: METRIC_TITLES[k], label: labels[k], value: vb.value,
        benchmark: vb.benchmark, position: pcts[k] != null ? pcts[k]! / 100 : null,
        star: metricStar(scorecard, k), sub: vb.sub };
    });
  const operating: OperatingView = {
    sectionLabel: opLabel, strongest: sw.strongest.map((k) => METRIC_TITLES[k]),
    watch: sw.watch.map((k) => METRIC_TITLES[k]), metrics,
  };
  const aboveCount = metrics.filter((m) => m.label === "strong" || m.label === "good").length;
  readout[1].value = `Above cohort median on ${aboveCount} of ${metrics.length} scored dimensions`;

  const portfolioSeries = (input.trajectory?.points ?? [])
    .map((p) => p.portfolioPoint)
    .filter((n): n is number => n != null);
  const portfolioDir = momentumDirection({ values: portfolioSeries });
  const mkSpark = (key: "portfolio" | "share" | "reach" | "quality", label: string, series: number[]) =>
    ({ key, label, series, direction: momentumDirection({ values: series }) });
  const momentum: MomentumView = {
    direction: portfolioDir,
    takeaway: momentumTakeaway(scorecard.pm.name, portfolioDir),
    sparklines: [
      mkSpark("portfolio", "Portfolio", portfolioSeries),
      mkSpark("share", "Listing share", []),   // filled by pipeline phase
      mkSpark("reach", "Geographic reach", []), // filled by pipeline phase
      mkSpark("quality", "Operating quality", []), // filled by pipeline phase
    ],
  };
  readout[2].value = momentumReadout(portfolioDir);

  const pool = input.pool as PoolMember[];
  const watchItems = buildWatchItems(scorecard, input.marketConcessionMedian);
  const candidates: PeerCandidate[] = pool.map((m) => ({
    slug: m.slug, name: m.name, quadrant7Cell: m.quadrant7Cell,
    estimatedUnits: m.scorecard.portfolioEstimate?.point ?? null,
    operatingLabel: operatingPerformanceLabel(m.scorecard),
  }));
  const peers = selectSimilarLocalPlayers(scorecard.pm.slug, candidates, { limit: 4 });
  const nonPositive = watchItems.filter((w) => w.kind !== "positive").length;
  readout[3].value = nonPositive > 0
    ? `${nonPositive} to review${watchItems.length > nonPositive ? " · 1+ positive" : ""}`
    : (watchItems.length > 0 ? "positives only" : "none");

  return { header, readout, scaleFit, operating, momentum, watchItems, peers };
}
