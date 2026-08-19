import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import type { MarketIqDataFreshness, MarketIqDataIssue } from "./types";

export const LONG_HISTORY_SEGMENTS = new Set([
  "apartment:999",
  "apartment:0",
  "apartment:1",
  "apartment:2",
  "house:999",
  "house:2",
  "house:3",
  "house:4",
]);

export function hasLongMsaHistory(report: MarketIqReportSnapshot): boolean {
  const msaCells = report.marketRead.cells.filter((cell) =>
    cell.geographyType === "msa" && LONG_HISTORY_SEGMENTS.has(`${cell.propertyType}:${cell.bedrooms}`),
  );
  return msaCells.length === LONG_HISTORY_SEGMENTS.size && msaCells.every((cell) => cell.series.length >= 30);
}

export function marketIqReportAvailableThrough(report: MarketIqReportSnapshot): string {
  return report.sources.find((source) => source.name === "Dwellsy IQ Trends")?.availableThrough
    ?? report.scope.periodEnd;
}

export function assessMarketIqReportQuality(input: {
  report: MarketIqReportSnapshot | null;
  now?: Date;
  staleAfterDays?: number;
}): {
  freshness: MarketIqDataFreshness;
  sourceAvailableThrough: string | null;
  issues: MarketIqDataIssue[];
} {
  if (!input.report) {
    return { freshness: "missing", sourceAvailableThrough: null, issues: [] };
  }

  const sourceAvailableThrough = marketIqReportAvailableThrough(input.report);
  const sourceDate = new Date(`${sourceAvailableThrough.slice(0, 10)}T00:00:00.000Z`);
  const now = input.now ?? new Date();
  const staleAfterDays = input.staleAfterDays ?? 62;
  const ageDays = Number.isNaN(sourceDate.getTime())
    ? Number.POSITIVE_INFINITY
    : (now.getTime() - sourceDate.getTime()) / 86_400_000;
  const freshness: MarketIqDataFreshness = ageDays > staleAfterDays ? "stale" : "current";
  const issues: MarketIqDataIssue[] = [];

  if (freshness === "stale") {
    issues.push({
      code: "stale_snapshot",
      message: `The latest saved Trends IQ snapshot is through ${sourceAvailableThrough}.`,
    });
  }
  if (!hasLongMsaHistory(input.report)) {
    issues.push({
      code: "partial_history",
      message: "One or more headline segments have fewer than 30 monthly MSA observations.",
    });
  }

  return { freshness, sourceAvailableThrough, issues };
}
