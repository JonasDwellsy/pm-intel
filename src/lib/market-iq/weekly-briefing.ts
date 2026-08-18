import type { MarketIqHomeMarketSummary } from "@/lib/market-iq/home-summary";
import type { MarketIqEditionComparison, MarketIqEditionFinding } from "@/lib/market-iq/report/report";

export type MarketIqWeeklyBriefingMarket = {
  summary: MarketIqHomeMarketSummary;
  comparison: MarketIqEditionComparison | null;
};

export function parseMarketIqEditionComparison(value: string | null | undefined): MarketIqEditionComparison | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<MarketIqEditionComparison>;
    if (!parsed.state || !Array.isArray(parsed.findings) || typeof parsed.heading !== "string" || typeof parsed.narrative !== "string") return null;
    return parsed as MarketIqEditionComparison;
  } catch {
    return null;
  }
}

function findingMagnitude(finding: MarketIqEditionFinding) {
  return Math.abs((finding.currentValue ?? 0) - (finding.priorValue ?? 0));
}

export function buildMarketIqWeeklyBriefing(markets: MarketIqWeeklyBriefingMarket[]) {
  const reviews = markets
    .filter((item) => item.summary.draft)
    .map((item) => ({
      market: item.summary.market,
      draft: item.summary.draft!,
      comparison: item.comparison,
      findings: [...(item.comparison?.findings ?? [])]
        .sort((a, b) => (a.importance === b.importance ? findingMagnitude(b) - findingMagnitude(a) : a.importance === "high" ? -1 : 1))
        .slice(0, 3),
    }))
    .sort((a, b) => b.draft.materialChangeCount - a.draft.materialChangeCount);

  const currentMoves = markets
    .filter((item) => item.summary.source === "dwellsy_trends" && typeof item.summary.notable?.yearOverYearPct === "number")
    .map((item) => ({
      market: item.summary.market,
      cell: item.summary.notable!,
      latestMonth: item.summary.latestMonth,
    }))
    .sort((a, b) => Math.abs(b.cell.yearOverYearPct ?? 0) - Math.abs(a.cell.yearOverYearPct ?? 0));

  const sourceGaps = markets.filter((item) => item.summary.configured && item.summary.source !== "dwellsy_trends");
  const setupNeeds = markets.filter((item) => !item.summary.configured);
  const currentMarkets = markets.filter((item) => item.summary.source === "dwellsy_trends");

  const headline = reviews.length
    ? `${reviews.length} ${reviews.length === 1 ? "market has" : "markets have"} a new edition to review`
    : setupNeeds.length
      ? `${setupNeeds.length} ${setupNeeds.length === 1 ? "market needs" : "markets need"} setup before monitoring can begin`
      : sourceGaps.length
        ? `${sourceGaps.length} ${sourceGaps.length === 1 ? "market is" : "markets are"} waiting for authoritative Trends IQ data`
        : "Every configured market is current";

  return {
    headline,
    reviews,
    currentMoves,
    sourceGaps,
    setupNeeds,
    currentMarkets,
    marketCount: markets.length,
  };
}
