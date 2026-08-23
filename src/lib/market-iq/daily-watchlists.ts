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
export const MARKET_IQ_DAILY_WATCHLIST_VISIBILITIES = ["private", "organization"] as const;
export type MarketIqDailyWatchlistVisibility = typeof MARKET_IQ_DAILY_WATCHLIST_VISIBILITIES[number];

export const MARKET_IQ_COMPETITIVE_SET_RADII_MILES = [1, 3, 5] as const;
export type MarketIqCompetitiveSetRadiusMiles = typeof MARKET_IQ_COMPETITIVE_SET_RADII_MILES[number];

export type MarketIqDailyCompetitiveSet = {
  latitude: number;
  longitude: number;
  radiusMiles: MarketIqCompetitiveSetRadiusMiles;
  label: string;
};

export type MarketIqDailyWatchlistFilters = {
  query: string;
  eventTypes: MarketIqDailyWatchlistEventType[];
  geography: string;
  bedrooms: MarketIqDailyEventBedrooms;
  propertyType: MarketIqDailyEventPropertyType;
  rentDirection: MarketIqDailyEventRentDirection;
  minimumRentMagnitude: MarketIqDailyEventRentMagnitude;
  competitiveSet: MarketIqDailyCompetitiveSet | null;
};

export type MarketIqDailyWatchlistView = {
  id: string;
  name: string;
  marketId: string;
  filters: MarketIqDailyWatchlistFilters;
  visibility: MarketIqDailyWatchlistVisibility;
  isOwner: boolean;
  isFollowing: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MarketIqDailyWatchlistInput = {
  id?: string;
  name: string;
  filters: MarketIqDailyWatchlistFilters;
  visibility?: MarketIqDailyWatchlistVisibility;
};

export type MarketIqDailyWatchlistActionResult =
  | { ok: true; watchlist?: MarketIqDailyWatchlistView }
  | { ok: false; message: string };

export type MarketIqDailyWatchlistFollowResult =
  | { ok: true; isFollowing: boolean }
  | { ok: false; message: string };

export function marketIqDailyWatchlistRecipientIds(input: {
  ownerUserId: string;
  visibility: MarketIqDailyWatchlistVisibility;
  subscriberUserIds: string[];
}) {
  return input.visibility === "organization"
    ? [...new Set([input.ownerUserId, ...input.subscriberUserIds])]
    : [input.ownerUserId];
}

export type MarketIqDailyWatchlistMatch = {
  id: string;
  eventType: MarketIqDailyWatchlistEventType;
  headline: string;
  detail: string;
  observedAt: string;
  city: string;
  zip: string;
  propertyManagerName: string | null;
  propertyId: string | null;
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
  competitiveSet: null,
};

const EVENT_TYPES = new Set<string>(MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES);
const VISIBILITIES = new Set<string>(MARKET_IQ_DAILY_WATCHLIST_VISIBILITIES);
const BEDROOMS = new Set(["all", "studio", "1", "2", "3", "4_plus"]);
const PROPERTY_TYPES = new Set(["all", "apartment", "house"]);
const RENT_DIRECTIONS = new Set(["all", "increase", "decrease"]);
const RENT_MAGNITUDES = new Set([0, 50, 100, 200]);
const COMPETITIVE_SET_RADII = new Set<number>(MARKET_IQ_COMPETITIVE_SET_RADII_MILES);

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

function parseCompetitiveSet(value: unknown): MarketIqDailyCompetitiveSet | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.latitude !== "number" || !Number.isFinite(candidate.latitude)
    || candidate.latitude < -90 || candidate.latitude > 90
    || typeof candidate.longitude !== "number" || !Number.isFinite(candidate.longitude)
    || candidate.longitude < -180 || candidate.longitude > 180
    || !COMPETITIVE_SET_RADII.has(candidate.radiusMiles as number)
    || typeof candidate.label !== "string" || !candidate.label.trim() || candidate.label.trim().length > 120) return undefined;
  return {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    radiusMiles: candidate.radiusMiles as MarketIqCompetitiveSetRadiusMiles,
    label: candidate.label.trim(),
  };
}

function parseFilters(value: unknown): MarketIqDailyWatchlistFilters | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const eventTypes = Array.isArray(candidate.eventTypes)
    ? [...new Set(candidate.eventTypes)]
    : null;
  const competitiveSet = parseCompetitiveSet(candidate.competitiveSet);
  if (!eventTypes || eventTypes.length > MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES.length
    || eventTypes.some((eventType) => typeof eventType !== "string" || !EVENT_TYPES.has(eventType))) return null;
  if (typeof candidate.query !== "string" || candidate.query.trim().length > 120
    || !validGeography(candidate.geography)
    || !BEDROOMS.has(candidate.bedrooms as string)
    || !PROPERTY_TYPES.has(candidate.propertyType as string)
    || !RENT_DIRECTIONS.has(candidate.rentDirection as string)
    || !RENT_MAGNITUDES.has(candidate.minimumRentMagnitude as number)
    || competitiveSet === undefined) return null;
  return {
    query: candidate.query.trim(),
    eventTypes: eventTypes as MarketIqDailyWatchlistEventType[],
    geography: candidate.geography,
    bedrooms: candidate.bedrooms as MarketIqDailyEventBedrooms,
    propertyType: candidate.propertyType as MarketIqDailyEventPropertyType,
    rentDirection: candidate.rentDirection as MarketIqDailyEventRentDirection,
    minimumRentMagnitude: candidate.minimumRentMagnitude as MarketIqDailyEventRentMagnitude,
    competitiveSet,
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
  const visibility = candidate.visibility === undefined ? "private" : candidate.visibility;
  if (typeof visibility !== "string" || !VISIBILITIES.has(visibility)) return { ok: false, error: "Choose a valid watchlist visibility." };
  return { ok: true, value: { id, name, filters, visibility: visibility as MarketIqDailyWatchlistVisibility } };
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
    propertyId: headline.event.propertyId ?? null,
    listingUrl: headline.event.listingUrl ?? null,
    sectionHref: SECTION_HREFS[headline.section],
  };
}

function validCoordinates(latitude: number | null | undefined, longitude: number | null | undefined) {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export function marketIqDistanceMiles(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const firstLatitude = radians(left.latitude);
  const secondLatitude = radians(right.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 3_958.7613 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function competitiveSetMatches(latitude: number | null | undefined, longitude: number | null | undefined, competitiveSet: MarketIqDailyCompetitiveSet | null) {
  if (!competitiveSet) return true;
  if (!validCoordinates(latitude, longitude)) return false;
  return marketIqDistanceMiles(competitiveSet, { latitude: latitude!, longitude: longitude! }) <= competitiveSet.radiusMiles;
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
  if (!competitiveSetMatches(alert.latitude, alert.longitude, filters.competitiveSet)) return false;
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
    propertyId: alert.propertyId,
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
    .filter((headline) => competitiveSetMatches(headline.event.latitude, headline.event.longitude, filters.competitiveSet))
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
  if (filters.competitiveSet) labels.push(`Within ${filters.competitiveSet.radiusMiles} mi of ${filters.competitiveSet.label}`);
  return labels.length ? labels.join(" · ") : "All retained daily activity";
}
