export type MarketIqListingEvent = {
  id: string;
  eventType: "new_listing" | "price_change";
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
};

export type MarketIqMarketActivity = {
  asOf: string;
  newListings24h: number;
  sourceUpdates24h: number;
  confirmedPriceChanges24h: number;
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
