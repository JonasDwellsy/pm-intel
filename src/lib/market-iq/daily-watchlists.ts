import {
  EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS,
  filterMarketIqDailyEventHeadlines,
  type MarketIqDailyEventBedrooms,
  type MarketIqDailyEventPropertyType,
  type MarketIqDailyEventRentDirection,
  type MarketIqDailyEventRentMagnitude,
} from "@/lib/market-iq/daily-event-explorer";
import { buildDailyEventHeadlines, type MarketIqDailyEventHeadline } from "@/lib/market-iq/daily-events";
import type { MarketIqLeaseUpAlert, MarketIqMarketActivity } from "@/lib/market-iq/listing-events";

export const MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES = [
  "new_to_market",
  "rent_changes",
  "off_market",
  "aging_watch",
  "concessions",
  "lease_up",
] as const;

export type MarketIqDailyWatchlistEventType = typeof MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES[number];

export type MarketIqDailyWatchlistFilters = {
  query: string;
  eventTypes: MarketIqDailyWatchlistEventType[];
  geography: string;
  bedrooms: MarketIqDailyEventBedrooms;
  propertyType: MarketIqDailyEventPropertyType;
  rentDirection: MarketIqDailyEventRentDirection;
  minimumRentMagnitude: MarketIqDailyEventRentMagnitude;
};

export type MarketIqDailyWatchlistView = {
  id: string;
  name: string;
  marketId: string;
  filters: MarketIqDailyWatchlistFilters;
  createdAt: string;
  updatedAt: string;
};

export type MarketIqDailyWatchlistInput = {
  id?: string;
  name: string;
  filters: MarketIqDailyWatchlistFilters;
};

export type MarketIqDailyWatchlistActionResult =
  | { ok: true; watchlist?: MarketIqDailyWatchlistView }
  | { ok: false; message: string };

export type MarketIqDailyWatchlistMatch = {
  id: string;
  eventType: MarketIqDailyWatchlistEventType;
  headline: string;
  detail: string;
  observedAt: string;
  city: string;
  zip: string;
  propertyManagerName: string | null;
  listingUrl: string | null;
  sectionHref: string;
};

export const EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS: MarketIqDailyWatchlistFilters = {
  query: "",
  eventTypes: [],
  geography: "all",
  bedrooms: "all",
  propertyType: "all",
  rentDirection: "all",
  minimumRentMagnitude: 0,
};

const EVENT_TYPES = new Set<string>(MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES);
const BEDROOMS = new Set(["all", "studio", "1", "2", "3", "4_plus"]);
const PROPERTY_TYPES = new Set(["all", "apartment", "house"]);
const RENT_DIRECTIONS = new Set(["all", "increase", "decrease"]);
const RENT_MAGNITUDES = new Set([0, 50, 100, 200]);

const SECTION_HREFS: Record<MarketIqDailyWatchlistEventType, string> = {
  new_to_market: "#daily-new-listings",
  rent_changes: "#daily-rent-moves",
  off_market: "#daily-off-market",
  aging_watch: "#daily-aging-watch",
  concessions: "#daily-concessions",
  lease_up: "#daily-lease-ups",
};

function normalized(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

function validGeography(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 120
    && (value === "all" || value.startsWith("city:") || value.startsWith("zip:"));
}

function parseFilters(value: unknown): MarketIqDailyWatchlistFilters | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const eventTypes = Array.isArray(candidate.eventTypes)
    ? [...new Set(candidate.eventTypes)]
    : null;
  if (!eventTypes || eventTypes.length > MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES.length
    || eventTypes.some((eventType) => typeof eventType !== "string" || !EVENT_TYPES.has(eventType))) return null;
  if (typeof candidate.query !== "string" || candidate.query.trim().length > 120
    || !validGeography(candidate.geography)
    || !BEDROOMS.has(candidate.bedrooms as string)
    || !PROPERTY_TYPES.has(candidate.propertyType as string)
    || !RENT_DIRECTIONS.has(candidate.rentDirection as string)
    || !RENT_MAGNITUDES.has(candidate.minimumRentMagnitude as number)) return null;
  return {
    query: candidate.query.trim(),
    eventTypes: eventTypes as MarketIqDailyWatchlistEventType[],
    geography: candidate.geography,
    bedrooms: candidate.bedrooms as MarketIqDailyEventBedrooms,
    propertyType: candidate.propertyType as MarketIqDailyEventPropertyType,
    rentDirection: candidate.rentDirection as MarketIqDailyEventRentDirection,
    minimumRentMagnitude: candidate.minimumRentMagnitude as MarketIqDailyEventRentMagnitude,
  };
}

export function parseMarketIqDailyWatchlistInput(value: unknown):
  | { ok: true; value: MarketIqDailyWatchlistInput }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Enter a valid watchlist." };
  const candidate = value as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!name || name.length > 60) return { ok: false, error: "Use a watchlist name between 1 and 60 characters." };
  const filters = parseFilters(candidate.filters);
  if (!filters) return { ok: false, error: "Choose valid Daily Edition filters." };
  const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : undefined;
  if (id && id.length > 100) return { ok: false, error: "This watchlist could not be updated." };
  return { ok: true, value: { id, name, filters } };
}

export function parseMarketIqDailyWatchlistFilters(value: string): MarketIqDailyWatchlistFilters | null {
  try {
    return parseFilters(JSON.parse(value));
  } catch {
    return null;
  }
}

function eventMatch(headline: MarketIqDailyEventHeadline): MarketIqDailyWatchlistMatch {
  return {
    id: headline.id,
    eventType: headline.section,
    headline: headline.headline,
    detail: headline.detail,
    observedAt: headline.observedAt,
    city: headline.event.city,
    zip: headline.event.zip,
    propertyManagerName: headline.event.propertyManagerName ?? null,
    listingUrl: headline.event.listingUrl ?? null,
    sectionHref: SECTION_HREFS[headline.section],
  };
}

function leaseUpMatches(alert: MarketIqLeaseUpAlert, filters: MarketIqDailyWatchlistFilters) {
  if (filters.bedrooms !== "all" || filters.propertyType === "house"
    || filters.rentDirection !== "all" || filters.minimumRentMagnitude > 0) return false;
  if (filters.geography !== "all") {
    const [kind, ...parts] = filters.geography.split(":");
    const value = normalized(parts.join(":"));
    if (kind === "city" && normalized(alert.city) !== value) return false;
    if (kind === "zip" && normalized(alert.zip) !== value) return false;
  }
  const query = normalized(filters.query);
  if (!query) return true;
  return [alert.propertyName, alert.propertyManagerName, alert.address, alert.city, alert.zip]
    .map(normalized)
    .join(" ")
    .includes(query);
}

function leaseUpMatch(alert: MarketIqLeaseUpAlert): MarketIqDailyWatchlistMatch {
  return {
    id: alert.id,
    eventType: "lease_up",
    headline: `${alert.propertyName} arrived with ${alert.newListingCount.toLocaleString("en-US")} new listings`,
    detail: `${alert.address ? `${alert.address} · ` : ""}${alert.city}, ${alert.zip}. Lease-up signal from advertised inventory, not verified construction or occupancy.`,
    observedAt: alert.observedAt,
    city: alert.city,
    zip: alert.zip,
    propertyManagerName: alert.propertyManagerName,
    listingUrl: alert.listingUrl,
    sectionHref: SECTION_HREFS.lease_up,
  };
}

export function matchMarketIqDailyWatchlist(
  watchlist: Pick<MarketIqDailyWatchlistView, "filters">,
  activity: MarketIqMarketActivity,
): MarketIqDailyWatchlistMatch[] {
  const { filters } = watchlist;
  const includedTypes = new Set(filters.eventTypes);
  const includesAll = includedTypes.size === 0;
  const eventMatches = filterMarketIqDailyEventHeadlines(
    buildDailyEventHeadlines(activity.events),
    {
      ...EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS,
      query: filters.query,
      geography: filters.geography,
      bedrooms: filters.bedrooms,
      propertyType: filters.propertyType,
      rentDirection: filters.rentDirection,
      minimumRentMagnitude: filters.minimumRentMagnitude,
    },
  )
    .filter((headline) => includesAll || includedTypes.has(headline.section))
    .map(eventMatch);
  const leaseUpMatchesForScope = (includesAll || includedTypes.has("lease_up"))
    ? (activity.leaseUpAlerts ?? []).filter((alert) => leaseUpMatches(alert, filters)).map(leaseUpMatch)
    : [];
  return [...eventMatches, ...leaseUpMatchesForScope]
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
}

export function marketIqDailyWatchlistScopeLabel(filters: MarketIqDailyWatchlistFilters) {
  const labels: string[] = [];
  if (filters.geography !== "all") labels.push(filters.geography.replace(/^city:/, "").replace(/^zip:/, "ZIP "));
  if (filters.query) labels.push(`“${filters.query}”`);
  if (filters.propertyType !== "all") labels.push(filters.propertyType === "house" ? "Houses" : "Apartments");
  if (filters.bedrooms !== "all") labels.push(filters.bedrooms === "studio" ? "Studios" : filters.bedrooms === "4_plus" ? "4+ bedrooms" : `${filters.bedrooms} bedrooms`);
  if (filters.rentDirection !== "all") labels.push(`${filters.rentDirection}s`);
  if (filters.minimumRentMagnitude) labels.push(`$${filters.minimumRentMagnitude}+ moves`);
  return labels.length ? labels.join(" · ") : "All retained daily activity";
}
