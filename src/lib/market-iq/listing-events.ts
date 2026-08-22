import type { MarketIqAdvertisedConcession } from "@/lib/market-iq/concessions";

type MarketIqListingEventBase = {
  id: string;
  propertyId?: string | null;
  address?: string | null;
  city: string;
  zip: string;
  propertyType: "apartment" | "house";
  bedrooms: number;
  askingRent: number;
  previousRent: number | null;
  observedAt: string;
  imageUrl?: string | null;
  listingUrl?: string | null;
  propertyName?: string | null;
  propertyManagerName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type MarketIqPropertyBedroomCount = {
  bedrooms: number;
  activeListings: number;
};

export type MarketIqPropertyActivitySummary = {
  propertyId: string;
  propertyName: string | null;
  propertyManagerName: string | null;
  address: string | null;
  city: string;
  zip: string;
  propertyType: "apartment" | "house";
  activeListingCount: number;
  askingRentMin: number;
  askingRentMax: number;
  bedroomCounts: MarketIqPropertyBedroomCount[];
  imageUrl: string | null;
  listingUrl: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type MarketIqLeaseUpAlert = {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyManagerName: string | null;
  address: string | null;
  city: string;
  zip: string;
  newListingCount: number;
  totalUnits: number | null;
  observedAt: string;
  imageUrl: string | null;
  listingUrl: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type MarketIqAgingThresholdDays = 30 | 60 | 90;

export type MarketIqListingEvent = MarketIqListingEventBase & (
  | { eventType: "new_listing" | "price_change"; listingAgeDays?: never }
  | { eventType: "concession"; concession: MarketIqAdvertisedConcession; listingAgeDays?: never }
  | { eventType: "delisting"; listingAgeDays: number }
  | { eventType: "aging_threshold"; listingAgeDays: MarketIqAgingThresholdDays }
);

export type MarketIqMarketActivity = {
  asOf: string;
  newListings24h: number;
  sourceUpdates24h: number;
  confirmedPriceChanges24h: number;
  advertisedConcessions24h: number;
  delistings24h: number;
  agingThresholds24h: number;
  leaseUpAlerts?: MarketIqLeaseUpAlert[];
  propertySummaries?: MarketIqPropertyActivitySummary[];
  eventsTruncated?: boolean;
  events: MarketIqListingEvent[];
};

export type MarketIqMarketActivityAvailability =
  | { state: "available"; activity: MarketIqMarketActivity }
  | { state: "unavailable"; attemptedAt: string };

export async function readMarketIqActivityAvailability(
  read: () => Promise<MarketIqMarketActivity>,
  attemptedAt = new Date(),
): Promise<MarketIqMarketActivityAvailability> {
  try {
    return { state: "available", activity: await read() };
  } catch {
    return { state: "unavailable", attemptedAt: attemptedAt.toISOString() };
  }
}

export function availableMarketIqActivity(
  availability: MarketIqMarketActivityAvailability | undefined,
): MarketIqMarketActivity | undefined {
  return availability?.state === "available" ? availability.activity : undefined;
}
