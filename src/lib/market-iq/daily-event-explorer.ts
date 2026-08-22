import type { MarketIqDailyEventHeadline } from "@/lib/market-iq/daily-events";
import type { MarketIqMarketActivity } from "@/lib/market-iq/listing-events";

export type MarketIqDailyEventSection = "all" | MarketIqDailyEventHeadline["section"];
export type MarketIqDailyEventBedrooms = "all" | "studio" | "1" | "2" | "3" | "4_plus";
export type MarketIqDailyEventPropertyType = "all" | "apartment" | "house";
export type MarketIqDailyEventRentDirection = "all" | "increase" | "decrease";
export type MarketIqDailyEventRentMagnitude = 0 | 50 | 100 | 200;

export type MarketIqDailyEventExplorerFilters = {
  query: string;
  section: MarketIqDailyEventSection;
  geography: string;
  bedrooms: MarketIqDailyEventBedrooms;
  propertyType: MarketIqDailyEventPropertyType;
  rentDirection: MarketIqDailyEventRentDirection;
  minimumRentMagnitude: MarketIqDailyEventRentMagnitude;
};

export type MarketIqDailySavedViewFilters = Omit<MarketIqDailyEventExplorerFilters, "query">;

export const EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS: MarketIqDailyEventExplorerFilters = {
  query: "",
  section: "all",
  geography: "all",
  bedrooms: "all",
  propertyType: "all",
  rentDirection: "all",
  minimumRentMagnitude: 0,
};

export const EMPTY_MARKET_IQ_DAILY_SAVED_VIEW_FILTERS: MarketIqDailySavedViewFilters = {
  section: "all",
  geography: "all",
  bedrooms: "all",
  propertyType: "all",
  rentDirection: "all",
  minimumRentMagnitude: 0,
};

const SECTIONS = new Set(["all", "new_to_market", "rent_changes", "off_market", "aging_watch", "concessions"]);
const BEDROOMS = new Set(["all", "studio", "1", "2", "3", "4_plus"]);
const PROPERTY_TYPES = new Set(["all", "apartment", "house"]);
const RENT_DIRECTIONS = new Set(["all", "increase", "decrease"]);
const RENT_MAGNITUDES = new Set([0, 50, 100, 200]);

export function savedMarketIqDailyView(filters: MarketIqDailyEventExplorerFilters): MarketIqDailySavedViewFilters {
  return {
    section: filters.section,
    geography: filters.geography,
    bedrooms: filters.bedrooms,
    propertyType: filters.propertyType,
    rentDirection: filters.rentDirection,
    minimumRentMagnitude: filters.minimumRentMagnitude,
  };
}

export function marketIqDailyExplorerFilters(saved: MarketIqDailySavedViewFilters | null): MarketIqDailyEventExplorerFilters {
  return { ...EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS, ...(saved ?? {}) };
}

export function parseMarketIqDailySavedView(value: string | null | undefined): MarketIqDailySavedViewFilters | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!SECTIONS.has(parsed.section as string)
      || typeof parsed.geography !== "string"
      || !(parsed.geography === "all" || parsed.geography.startsWith("city:") || parsed.geography.startsWith("zip:"))
      || !BEDROOMS.has(parsed.bedrooms as string)
      || !PROPERTY_TYPES.has(parsed.propertyType as string)
      || !RENT_DIRECTIONS.has(parsed.rentDirection as string)
      || !RENT_MAGNITUDES.has(parsed.minimumRentMagnitude as number)) return null;
    return {
      section: parsed.section as MarketIqDailyEventSection,
      geography: parsed.geography,
      bedrooms: parsed.bedrooms as MarketIqDailyEventBedrooms,
      propertyType: parsed.propertyType as MarketIqDailyEventPropertyType,
      rentDirection: parsed.rentDirection as MarketIqDailyEventRentDirection,
      minimumRentMagnitude: parsed.minimumRentMagnitude as MarketIqDailyEventRentMagnitude,
    };
  } catch {
    return null;
  }
}

export function sameMarketIqDailySavedView(left: MarketIqDailySavedViewFilters, right: MarketIqDailySavedViewFilters) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalized(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

function bedroomMatches(bedrooms: number, filter: MarketIqDailyEventBedrooms) {
  if (filter === "all") return true;
  if (filter === "studio") return bedrooms === 0;
  if (filter === "4_plus") return bedrooms >= 4;
  return bedrooms === Number(filter);
}

function geographyMatches(headline: MarketIqDailyEventHeadline, geography: string) {
  if (geography === "all") return true;
  const [kind, ...parts] = geography.split(":");
  const value = normalized(parts.join(":"));
  if (kind === "city") return normalized(headline.event.city) === value;
  if (kind === "zip") return normalized(headline.event.zip) === value;
  return false;
}

function rentMoveMatches(headline: MarketIqDailyEventHeadline, filters: MarketIqDailyEventExplorerFilters) {
  const usesRentFilter = filters.rentDirection !== "all" || filters.minimumRentMagnitude > 0;
  if (!usesRentFilter) return true;
  const event = headline.event;
  if (event.eventType !== "price_change" || event.previousRent === null) return false;
  const difference = event.askingRent - event.previousRent;
  if (filters.rentDirection === "increase" && difference <= 0) return false;
  if (filters.rentDirection === "decrease" && difference >= 0) return false;
  return Math.abs(difference) >= filters.minimumRentMagnitude;
}

export function filterMarketIqDailyEventHeadlines(
  headlines: MarketIqDailyEventHeadline[],
  filters: MarketIqDailyEventExplorerFilters,
) {
  const query = normalized(filters.query);
  return headlines
    .filter((headline) => {
      const event = headline.event;
      const searchable = [event.address, event.city, event.zip].map(normalized).join(" ");
      return (!query || searchable.includes(query))
        && (filters.section === "all" || headline.section === filters.section)
        && geographyMatches(headline, filters.geography)
        && bedroomMatches(event.bedrooms, filters.bedrooms)
        && (filters.propertyType === "all" || event.propertyType === filters.propertyType)
        && rentMoveMatches(headline, filters);
    })
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
}

export function marketIqDailyEventExplorerOptions(headlines: MarketIqDailyEventHeadline[]) {
  const cities = [...new Set(headlines.map((headline) => headline.event.city.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const zipCodes = [...new Set(headlines.map((headline) => headline.event.zip.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en-US", { numeric: true }));
  return { cities, zipCodes };
}

export function marketIqDailyObservedEventTotal(activity: MarketIqMarketActivity) {
  return [
    activity.newListings24h,
    activity.confirmedPriceChanges24h,
    activity.advertisedConcessions24h,
    activity.delistings24h,
    activity.agingThresholds24h,
  ].reduce((total, value) => total + (Number.isFinite(value) && value > 0 ? value : 0), 0);
}
