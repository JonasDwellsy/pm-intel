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

export const MARKET_IQ_BRIEFING_PAYLOAD_VERSION = 1;

export function marketIqBriefingWeekOf(date: Date) {
  const day = date.getUTCDay();
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((day + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

export function buildMarketIqBriefingArchivePayload(
  briefing: ReturnType<typeof buildMarketIqWeeklyBriefing>,
  preparedAt: Date,
) {
  return {
    version: MARKET_IQ_BRIEFING_PAYLOAD_VERSION,
    preparedAt: preparedAt.toISOString(),
    weekOf: marketIqBriefingWeekOf(preparedAt),
    headline: briefing.headline,
    counts: {
      markets: briefing.marketCount,
      currentSources: briefing.currentMarkets.length,
      reviews: briefing.reviews.length,
      exceptions: briefing.sourceGaps.length + briefing.setupNeeds.length,
    },
    reviews: briefing.reviews.map((item) => ({
      marketId: item.market.id,
      marketName: item.market.fullName,
      periodEnd: String(item.draft.periodEnd),
      materialChangeCount: item.draft.materialChangeCount,
      findings: item.findings,
    })),
    currentMoves: briefing.currentMoves.map((item) => ({
      marketId: item.market.id,
      marketName: item.market.fullName,
      geographyLabel: item.cell.geographyLabel,
      segmentLabel: item.cell.label,
      rent: item.cell.rent,
      yearOverYearPct: item.cell.yearOverYearPct,
      sourcePeriodEnd: item.latestMonth,
    })),
    exceptions: [
      ...briefing.setupNeeds.map((item) => ({ marketId: item.summary.market.id, marketName: item.summary.market.fullName, kind: "setup" as const })),
      ...briefing.sourceGaps.map((item) => ({ marketId: item.summary.market.id, marketName: item.summary.market.fullName, kind: "source" as const })),
    ],
    sourcePeriods: Object.fromEntries(briefing.currentMarkets.map((item) => [item.summary.market.id, item.summary.latestMonth])),
  };
}

export type MarketIqBriefingArchivePayload = ReturnType<typeof buildMarketIqBriefingArchivePayload>;

function moveKey(move: MarketIqBriefingArchivePayload["currentMoves"][number]) {
  return [move.marketId, move.geographyLabel, move.segmentLabel].join("::");
}

export function compareMarketIqBriefingArchives(
  current: MarketIqBriefingArchivePayload,
  prior: MarketIqBriefingArchivePayload | null,
) {
  if (!prior) return null;

  const priorMoves = new Map(prior.currentMoves.map((move) => [moveKey(move), move]));
  const moveChanges = current.currentMoves.flatMap((move) => {
    const previous = priorMoves.get(moveKey(move));
    if (!previous) return [];
    const rentChange = move.rent !== null && previous.rent !== null ? move.rent - previous.rent : null;
    const directionChange = move.yearOverYearPct !== null && previous.yearOverYearPct !== null
      ? move.yearOverYearPct - previous.yearOverYearPct
      : null;
    return [{ ...move, previous, rentChange, directionChange }];
  }).sort((a, b) => Math.abs(b.directionChange ?? 0) - Math.abs(a.directionChange ?? 0));

  const priorExceptions = new Map(prior.exceptions.map((exception) => [`${exception.marketId}::${exception.kind}`, exception]));
  const currentExceptions = new Map(current.exceptions.map((exception) => [`${exception.marketId}::${exception.kind}`, exception]));
  const addedExceptions = current.exceptions.filter((exception) => !priorExceptions.has(`${exception.marketId}::${exception.kind}`));
  const resolvedExceptions = prior.exceptions.filter((exception) => !currentExceptions.has(`${exception.marketId}::${exception.kind}`));

  const priorReviews = new Map(prior.reviews.map((review) => [review.marketId, review]));
  const reviewChanges = current.reviews.map((review) => ({
    ...review,
    previousCount: priorReviews.get(review.marketId)?.materialChangeCount ?? 0,
    countChange: review.materialChangeCount - (priorReviews.get(review.marketId)?.materialChangeCount ?? 0),
  }));

  return {
    countChanges: {
      markets: current.counts.markets - prior.counts.markets,
      currentSources: current.counts.currentSources - prior.counts.currentSources,
      reviews: current.counts.reviews - prior.counts.reviews,
      exceptions: current.counts.exceptions - prior.counts.exceptions,
    },
    moveChanges,
    reviewChanges,
    addedExceptions,
    resolvedExceptions,
  };
}

export function parseMarketIqBriefingArchivePayload(value: string): MarketIqBriefingArchivePayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<MarketIqBriefingArchivePayload>;
    if (
      parsed.version !== MARKET_IQ_BRIEFING_PAYLOAD_VERSION
      || typeof parsed.preparedAt !== "string"
      || typeof parsed.weekOf !== "string"
      || typeof parsed.headline !== "string"
      || !parsed.counts
      || !Array.isArray(parsed.reviews)
      || !Array.isArray(parsed.currentMoves)
      || !Array.isArray(parsed.exceptions)
    ) return null;
    return parsed as MarketIqBriefingArchivePayload;
  } catch {
    return null;
  }
}
