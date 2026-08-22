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

export const EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS: MarketIqDailyEventExplorerFilters = {
  query: "",
  section: "all",
  geography: "all",
  bedrooms: "all",
  propertyType: "all",
  rentDirection: "all",
  minimumRentMagnitude: 0,
};

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
