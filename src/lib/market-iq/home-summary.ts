import type { MarketIqMarketDefinition } from "@/data/market-iq/markets";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";

export type MarketIqHomeMarketInput = {
  market: MarketIqMarketDefinition;
  snapshot: MarketIqReportSnapshot | null;
  source: "dwellsy_trends" | "verified_seed" | "unavailable";
  configured: boolean;
  recurringEnabled: boolean;
  draft: { id: string; periodEnd: Date | string; materialChangeCount: number } | null;
  latestPublishedAt: Date | string | null;
  clientAdvisoryEnabled: boolean;
};

function msaCell(snapshot: MarketIqReportSnapshot | null, propertyType: "apartment" | "house", bedrooms: number) {
  return snapshot?.marketRead.cells.find((cell) =>
    cell.geographyType === "msa"
    && cell.propertyType === propertyType
    && cell.bedrooms === bedrooms
    && cell.status === "reportable",
  ) ?? null;
}

function notableLocalCell(snapshot: MarketIqReportSnapshot | null) {
  return snapshot?.marketRead.cells
    .filter((cell) => cell.geographyType !== "msa" && cell.status === "reportable" && cell.yearOverYearPct !== null)
    .sort((a, b) => Math.abs(b.yearOverYearPct ?? 0) - Math.abs(a.yearOverYearPct ?? 0))[0] ?? null;
}

export function buildMarketIqHomeMarketSummary(input: MarketIqHomeMarketInput) {
  const apartment = msaCell(input.snapshot, "apartment", 1);
  const house = msaCell(input.snapshot, "house", 3);
  const notable = notableLocalCell(input.snapshot);
  const latestMonth = input.snapshot?.scope.periodEnd ?? null;

  if (input.draft) {
    return {
      ...input,
      apartment,
      house,
      notable,
      latestMonth,
      priority: 100 + input.draft.materialChangeCount,
      status: "Review needed" as const,
      headline: `${input.draft.materialChangeCount} material ${input.draft.materialChangeCount === 1 ? "change" : "changes"} waiting for review`,
      actionLabel: "Review draft",
      actionHref: `/market-iq/review?market=${encodeURIComponent(input.market.id)}`,
    };
  }

  if (!input.configured) {
    return {
      ...input,
      apartment,
      house,
      notable,
      latestMonth,
      priority: 90,
      status: "Setup needed" as const,
      headline: `Choose the ${input.market.shortLabel} geographies and segments your team follows`,
      actionLabel: "Configure market",
      actionHref: `/market-iq/get-started?market=${encodeURIComponent(input.market.id)}`,
    };
  }

  if (!input.snapshot || input.source !== "dwellsy_trends") {
    return {
      ...input,
      apartment: null,
      house: null,
      notable: null,
      latestMonth: null,
      priority: 80,
      status: "Source unavailable" as const,
      headline: "The latest Trends IQ market read is temporarily unavailable",
      actionLabel: "Open market",
      actionHref: `/market-iq/market?market=${encodeURIComponent(input.market.id)}`,
    };
  }

  const biggestMove = Math.max(
    Math.abs(apartment?.yearOverYearPct ?? 0),
    Math.abs(house?.yearOverYearPct ?? 0),
    Math.abs(notable?.yearOverYearPct ?? 0),
  );
  return {
    ...input,
    apartment,
    house,
    notable,
    latestMonth,
    priority: 10 + biggestMove,
    status: input.recurringEnabled ? "Monitoring" as const : "Current" as const,
    headline: notable
      ? `${notable.geographyLabel} ${notable.label.toLowerCase()} moved ${notable.yearOverYearPct! >= 0 ? "+" : ""}${notable.yearOverYearPct!.toFixed(1)}% year over year`
      : "The latest MSA rent benchmarks are ready",
    actionLabel: "Open market read",
    actionHref: `/market-iq/market?market=${encodeURIComponent(input.market.id)}`,
  };
}

export type MarketIqHomeMarketSummary = ReturnType<typeof buildMarketIqHomeMarketSummary>;

export function rankMarketIqHomeMarkets(inputs: MarketIqHomeMarketInput[]) {
  return inputs.map(buildMarketIqHomeMarketSummary).sort((a, b) => b.priority - a.priority);
}
