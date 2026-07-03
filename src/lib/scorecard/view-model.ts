// v0.24 — assembles the redesigned scorecard's view model from already-loaded
// data + the Phase-1 derivation library. Pure; no I/O. Components consume
// ScorecardView and never touch raw ScorecardData. Never surfaces raw
// rank/composite — only labels, values-vs-benchmark, stars, positions.

import type { ScorecardData } from "@/lib/types";
import { countOperatorStars } from "@/lib/operators/stars";
import { operatingPerformanceLabel, type ScoreLabel } from "./labels";

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
  propertyType: string | null;
  citiesObserved: number | null;
  singleMarket: boolean;
}

export interface ScorecardView {
  header: HeaderView;
  readout: ReadoutRow[];
  scaleFit: ScaleFitView;
}

export interface BuildViewInput {
  scorecard: ScorecardData;
  pool: unknown[];
  trajectory: { points: Array<{ portfolioPoint: number | null }> };
  marketConcessionMedian: number | null;
}

function buildScaleFitTakeaway(sc: ScorecardData): string {
  const type = sc.pm.quadrant7Cell ?? "operator";
  return `${sc.pm.name} operates in ${sc.market.fullName} as a ${type}.`;
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
      confidence: pe?.confidence ?? null, status: pe?.status ?? "estimated",
    },
    topCities: geo?.topCities ?? [],
    top3Share: conc?.top3CityShare ?? null,
    cohortTop3: conc?.cohortMedianTop3 ?? null,
    propertyType: scorecard.pm.quadrant7Cell ?? null,
    citiesObserved: scorecard.coverage?.citiesObserved ?? null,
    singleMarket: header.singleMarket,
  };

  readout[0].value = pe?.point != null
    ? `~${pe.point} est. units · ${pe.confidence ?? "unrated"} confidence`
    : (pe?.message ?? "Portfolio size not estimated");

  return { header, readout, scaleFit };
}
