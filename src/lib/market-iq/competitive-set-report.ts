import type { MarketIqCompetitiveSetBrief } from "@/lib/market-iq/competitive-set-brief";
import type { MarketIqDailyWatchlistEventType } from "@/lib/market-iq/daily-watchlists";
import { MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES } from "@/lib/market-iq/daily-watchlists";

export type MarketIqCompetitiveSetReportSection = {
  watchlistId: string;
  watchlistName: string;
  marketId: string;
  centerLabel: string;
  radiusMiles: number;
  sourceAsOf: string;
  windowStartAt: string;
  windowEndAt: string;
  coverageDays: number;
  expectedDays: number;
  eventsTruncated: boolean;
  findings: Array<{
    key: string;
    eventType: MarketIqDailyWatchlistEventType;
    headline: string;
    detail: string;
    observedAt: string;
    propertyId: string | null;
    isSubject: boolean;
  }>;
  disclosure: string;
};

export function buildMarketIqCompetitiveSetReportSection(
  brief: Extract<MarketIqCompetitiveSetBrief, { state: "available" }>,
  selectedEventKeys: string[],
): MarketIqCompetitiveSetReportSection | null {
  const selected = new Set(selectedEventKeys.slice(0, 10));
  const findings = brief.current7d.events.filter((event) => selected.has(event.key)).slice(0, 10);
  const scope = brief.watchlist.filters.competitiveSet;
  if (!scope || !findings.length) return null;
  return {
    watchlistId: brief.watchlist.id,
    watchlistName: brief.watchlist.name,
    marketId: brief.watchlist.marketId,
    centerLabel: scope.label,
    radiusMiles: scope.radiusMiles,
    sourceAsOf: brief.sourceAsOf,
    windowStartAt: brief.current7d.startAt,
    windowEndAt: brief.current7d.endAt,
    coverageDays: brief.current7d.coverageDays,
    expectedDays: brief.current7d.expectedDays,
    eventsTruncated: brief.current7d.eventsTruncated,
    findings: findings.map((event) => ({
      key: event.key,
      eventType: event.eventType,
      headline: event.headline,
      detail: event.detail,
      observedAt: event.observedAt,
      propertyId: event.propertyId,
      isSubject: event.isSubject,
    })),
    disclosure: "Observed listing activity only. Asking rents are advertised, concessions are not verified, and off-market means leased or withdrawn, undetermined. No occupancy, achieved rent, or causation is inferred.",
  };
}

export function isMarketIqCompetitiveSetReportSection(value: unknown): value is MarketIqCompetitiveSetReportSection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MarketIqCompetitiveSetReportSection>;
  return typeof candidate.watchlistId === "string"
    && typeof candidate.watchlistName === "string"
    && typeof candidate.marketId === "string"
    && typeof candidate.centerLabel === "string"
    && typeof candidate.radiusMiles === "number"
    && [1, 3, 5].includes(candidate.radiusMiles)
    && typeof candidate.sourceAsOf === "string" && Number.isFinite(Date.parse(candidate.sourceAsOf))
    && typeof candidate.windowStartAt === "string" && Number.isFinite(Date.parse(candidate.windowStartAt))
    && typeof candidate.windowEndAt === "string" && Number.isFinite(Date.parse(candidate.windowEndAt))
    && typeof candidate.coverageDays === "number"
    && typeof candidate.expectedDays === "number"
    && typeof candidate.eventsTruncated === "boolean"
    && Array.isArray(candidate.findings)
    && candidate.findings.length <= 10
    && candidate.findings.every((finding) => finding
      && typeof finding.key === "string"
      && typeof finding.eventType === "string" && MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES.includes(finding.eventType as MarketIqDailyWatchlistEventType)
      && typeof finding.headline === "string"
      && typeof finding.detail === "string"
      && typeof finding.observedAt === "string" && Number.isFinite(Date.parse(finding.observedAt))
      && (finding.propertyId === null || typeof finding.propertyId === "string")
      && typeof finding.isSubject === "boolean")
    && typeof candidate.disclosure === "string";
}
