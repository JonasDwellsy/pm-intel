import type { MarketIqDailyEdition } from "@/lib/market-iq/daily-edition-archive";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import type { MarketIqLeaseUpAlert, MarketIqListingEvent, MarketIqMarketActivity } from "@/lib/market-iq/listing-events";
import {
  matchMarketIqDailyWatchlist,
  type MarketIqDailyWatchlistEventType,
  type MarketIqDailyWatchlistMatch,
  type MarketIqDailyWatchlistView,
} from "@/lib/market-iq/daily-watchlists";

export const MARKET_IQ_COMPETITIVE_SET_BRIEF_EVENT_TYPES = [
  "new_to_market",
  "rent_changes",
  "off_market",
  "aging_watch",
  "concessions",
  "lease_up",
] as const;

export type MarketIqCompetitiveSetBriefCounts = Record<MarketIqDailyWatchlistEventType, number>;

export type MarketIqCompetitiveSetBriefEvent = MarketIqDailyWatchlistMatch & {
  key: string;
  editionId: string;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  isSubject: boolean;
  previousRent: number | null;
  askingRent: number | null;
};

export type MarketIqCompetitiveSetBriefPeriod = {
  startAt: string;
  endAt: string;
  expectedDays: number;
  coverageDays: number;
  complete: boolean;
  eventsTruncated: boolean;
  events: MarketIqCompetitiveSetBriefEvent[];
  counts: MarketIqCompetitiveSetBriefCounts;
};

export type MarketIqCompetitiveSetBriefComparison = {
  available: boolean;
  metrics: Array<{
    eventType: MarketIqDailyWatchlistEventType;
    current: number;
    previous: number;
    difference: number;
  }>;
};

export type MarketIqCompetitiveSetBrief =
  | { state: "unavailable"; attemptedAt: string | null }
  | {
    state: "available";
    watchlist: MarketIqDailyWatchlistView;
    sourceAsOf: string;
    subjectPropertyId: string | null;
    current24h: MarketIqCompetitiveSetBriefPeriod;
    current7d: MarketIqCompetitiveSetBriefPeriod;
    prior7d: MarketIqCompetitiveSetBriefPeriod;
    comparison: MarketIqCompetitiveSetBriefComparison;
    largestRentMoves: MarketIqCompetitiveSetBriefEvent[];
    sevenDayListingEvents: MarketIqListingEvent[];
    sevenDayLeaseUpAlerts: MarketIqLeaseUpAlert[];
  };

type EvidenceRecord = {
  key: string;
  editionId: string;
  match: MarketIqDailyWatchlistMatch;
  listingEvent: MarketIqListingEvent | null;
  leaseUpAlert: MarketIqLeaseUpAlert | null;
};

const DAY_MS = 24 * 60 * 60 * 1_000;

function matchEventType(event: MarketIqListingEvent): MarketIqDailyWatchlistEventType {
  if (event.eventType === "new_listing") return "new_to_market";
  if (event.eventType === "price_change") return "rent_changes";
  if (event.eventType === "delisting") return "off_market";
  if (event.eventType === "aging_threshold") return "aging_watch";
  return "concessions";
}

function eventKey(eventType: MarketIqDailyWatchlistEventType, id: string) {
  return `${eventType}:${id}`;
}

function counts(events: MarketIqCompetitiveSetBriefEvent[]): MarketIqCompetitiveSetBriefCounts {
  const result = Object.fromEntries(MARKET_IQ_COMPETITIVE_SET_BRIEF_EVENT_TYPES.map((eventType) => [eventType, 0])) as MarketIqCompetitiveSetBriefCounts;
  for (const event of events) result[event.eventType] += 1;
  return result;
}

function validDate(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function inWindow(value: string, start: number, end: number) {
  const time = validDate(value);
  return time !== null && time > start && time <= end;
}

function availableActivity(edition: MarketIqDailyEdition<MarketIqReportSnapshot>) {
  const availability = edition.value.marketActivity;
  return availability?.state === "available" ? availability.activity : null;
}

function editionRecords(watchlist: MarketIqDailyWatchlistView, editionId: string, activity: MarketIqMarketActivity): EvidenceRecord[] {
  const matches = matchMarketIqDailyWatchlist(watchlist, activity);
  const listingEvents = new Map(activity.events.map((event) => [eventKey(matchEventType(event), event.id), event]));
  const leaseUps = new Map((activity.leaseUpAlerts ?? []).map((alert) => [eventKey("lease_up", alert.id), alert]));
  return matches.map((match) => {
    const key = eventKey(match.eventType, match.id);
    return {
      key,
      editionId,
      match,
      listingEvent: listingEvents.get(key) ?? null,
      leaseUpAlert: leaseUps.get(key) ?? null,
    };
  });
}

function inferredSubjectPropertyId(
  watchlist: MarketIqDailyWatchlistView,
  records: EvidenceRecord[],
) {
  const scope = watchlist.filters.competitiveSet;
  if (!scope) return null;
  if (scope.propertyId) return scope.propertyId;
  for (const record of records) {
    const source = record.listingEvent ?? record.leaseUpAlert;
    if (!source?.propertyId || typeof source.latitude !== "number" || typeof source.longitude !== "number") continue;
    if (Math.abs(source.latitude - scope.latitude) <= 0.00001 && Math.abs(source.longitude - scope.longitude) <= 0.00001) {
      return source.propertyId;
    }
  }
  return null;
}

function briefEvent(record: EvidenceRecord, subjectPropertyId: string | null): MarketIqCompetitiveSetBriefEvent {
  const source = record.listingEvent ?? record.leaseUpAlert;
  const listingEvent = record.listingEvent;
  return {
    ...record.match,
    key: record.key,
    editionId: record.editionId,
    latitude: typeof source?.latitude === "number" ? source.latitude : null,
    longitude: typeof source?.longitude === "number" ? source.longitude : null,
    imageUrl: source?.imageUrl ?? null,
    isSubject: Boolean(subjectPropertyId && source?.propertyId === subjectPropertyId),
    previousRent: listingEvent?.eventType === "price_change" ? listingEvent.previousRent : null,
    askingRent: listingEvent ? listingEvent.askingRent : null,
  };
}

function period(input: {
  allEvents: MarketIqCompetitiveSetBriefEvent[];
  editions: MarketIqDailyEdition<MarketIqReportSnapshot>[];
  start: number;
  end: number;
  expectedDays: number;
}): MarketIqCompetitiveSetBriefPeriod {
  const contributing = input.editions.flatMap((edition) => {
    const activity = availableActivity(edition);
    return activity && inWindow(activity.asOf, input.start, input.end) ? [activity] : [];
  });
  const events = input.allEvents.filter((event) => inWindow(event.observedAt, input.start, input.end));
  const eventsTruncated = contributing.some((activity) => activity.eventsTruncated === true);
  const coverageDays = Math.min(input.expectedDays, contributing.length);
  return {
    startAt: new Date(input.start).toISOString(),
    endAt: new Date(input.end).toISOString(),
    expectedDays: input.expectedDays,
    coverageDays,
    complete: coverageDays >= input.expectedDays && !eventsTruncated,
    eventsTruncated,
    events,
    counts: counts(events),
  };
}

export function buildMarketIqCompetitiveSetBrief(input: {
  watchlist: MarketIqDailyWatchlistView;
  editions: MarketIqDailyEdition<MarketIqReportSnapshot>[];
}): MarketIqCompetitiveSetBrief {
  const availableEditions = input.editions.filter((edition) => availableActivity(edition) !== null);
  const anchorEdition = availableEditions[0];
  const anchorActivity = anchorEdition ? availableActivity(anchorEdition) : null;
  const anchor = anchorActivity ? validDate(anchorActivity.asOf) : null;
  if (!anchorActivity || anchor === null) {
    return {
      state: "unavailable",
      attemptedAt: input.editions.find((edition) => edition.state === "unavailable")?.observedAt ?? null,
    };
  }

  const recordsByKey = new Map<string, EvidenceRecord>();
  for (const edition of availableEditions) {
    const activity = availableActivity(edition)!;
    for (const record of editionRecords(input.watchlist, edition.id, activity)) {
      if (!recordsByKey.has(record.key)) recordsByKey.set(record.key, record);
    }
  }
  const records = [...recordsByKey.values()];
  const subjectPropertyId = inferredSubjectPropertyId(input.watchlist, records);
  const allEvents = records
    .map((record) => briefEvent(record, subjectPropertyId))
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
  const current24h = period({ allEvents, editions: availableEditions, start: anchor - DAY_MS, end: anchor, expectedDays: 1 });
  const current7d = period({ allEvents, editions: availableEditions, start: anchor - 7 * DAY_MS, end: anchor, expectedDays: 7 });
  const prior7d = period({ allEvents, editions: availableEditions, start: anchor - 14 * DAY_MS, end: anchor - 7 * DAY_MS, expectedDays: 7 });
  const comparisonAvailable = current7d.complete && prior7d.complete;
  const comparison = {
    available: comparisonAvailable,
    metrics: MARKET_IQ_COMPETITIVE_SET_BRIEF_EVENT_TYPES.map((eventType) => ({
      eventType,
      current: current7d.counts[eventType],
      previous: prior7d.counts[eventType],
      difference: current7d.counts[eventType] - prior7d.counts[eventType],
    })),
  };
  const currentKeys = new Set(current7d.events.map((event) => event.key));
  const sevenDayListingEvents = [...recordsByKey.values()].flatMap((record) =>
    currentKeys.has(record.key) && record.listingEvent ? [record.listingEvent] : []
  );
  const sevenDayLeaseUpAlerts = [...recordsByKey.values()].flatMap((record) =>
    currentKeys.has(record.key) && record.leaseUpAlert ? [record.leaseUpAlert] : []
  );
  return {
    state: "available",
    watchlist: input.watchlist,
    sourceAsOf: anchorActivity.asOf,
    subjectPropertyId,
    current24h,
    current7d,
    prior7d,
    comparison,
    largestRentMoves: current7d.events
      .filter((event) => event.eventType === "rent_changes" && event.previousRent !== null && event.askingRent !== null)
      .sort((left, right) => Math.abs((right.askingRent! - right.previousRent!)) - Math.abs((left.askingRent! - left.previousRent!)))
      .slice(0, 5),
    sevenDayListingEvents,
    sevenDayLeaseUpAlerts,
  };
}
