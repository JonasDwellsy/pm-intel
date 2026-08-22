export type ListingFeedRecord = {
  sourceListingId: string;
  sourcePropertyId: string;
  askingRent: number;
  propertyType: string;
  city: string | null;
  postalCode: string | null;
  sourceUpdatedAt: Date | null;
};

export const MARKET_IQ_LISTING_FEED_MINIMUM_RECORDS = 250;
export const MARKET_IQ_LISTING_FEED_MAX_SOURCE_AGE_MS = 48 * 60 * 60 * 1_000;

export type ListingFeedEventType =
  | "new"
  | "relisted"
  | "reactivated"
  | "price_change"
  | "deactivated";

export type ListingFeedEventDraft = {
  eventType: ListingFeedEventType;
  sourceListingId: string;
  sourcePropertyId: string;
  propertyType: string;
  city: string | null;
  postalCode: string | null;
  previousRent: number | null;
  currentRent: number | null;
  sourceOccurredAt: Date | null;
};

export function classifyListingFeedChanges(input: {
  previous: ListingFeedRecord[];
  current: ListingFeedRecord[];
  historicallySeenListingIds?: ReadonlySet<string>;
  historicallySeenPropertyIds?: ReadonlySet<string>;
  baseline?: boolean;
}): ListingFeedEventDraft[] {
  if (input.baseline) return [];
  const previousByListing = new Map(input.previous.map((listing) => [listing.sourceListingId, listing]));
  const currentByListing = new Map(input.current.map((listing) => [listing.sourceListingId, listing]));
  const seenListings = input.historicallySeenListingIds ?? new Set<string>();
  const seenProperties = input.historicallySeenPropertyIds ?? new Set<string>();
  const events: ListingFeedEventDraft[] = [];

  for (const listing of input.current) {
    const prior = previousByListing.get(listing.sourceListingId);
    if (prior) {
      if (Math.abs(prior.askingRent - listing.askingRent) >= 0.01) {
        events.push({
          eventType: "price_change",
          sourceListingId: listing.sourceListingId,
          sourcePropertyId: listing.sourcePropertyId,
          propertyType: listing.propertyType,
          city: listing.city,
          postalCode: listing.postalCode,
          previousRent: prior.askingRent,
          currentRent: listing.askingRent,
          sourceOccurredAt: listing.sourceUpdatedAt,
        });
      }
      continue;
    }
    const eventType: ListingFeedEventType = seenListings.has(listing.sourceListingId)
      ? "reactivated"
      : seenProperties.has(listing.sourcePropertyId)
        ? "relisted"
        : "new";
    events.push({
      eventType,
      sourceListingId: listing.sourceListingId,
      sourcePropertyId: listing.sourcePropertyId,
      propertyType: listing.propertyType,
      city: listing.city,
      postalCode: listing.postalCode,
      previousRent: null,
      currentRent: listing.askingRent,
      sourceOccurredAt: listing.sourceUpdatedAt,
    });
  }

  for (const listing of input.previous) {
    if (currentByListing.has(listing.sourceListingId)) continue;
    events.push({
      eventType: "deactivated",
      sourceListingId: listing.sourceListingId,
      sourcePropertyId: listing.sourcePropertyId,
      propertyType: listing.propertyType,
      city: listing.city,
      postalCode: listing.postalCode,
      previousRent: listing.askingRent,
      currentRent: null,
      sourceOccurredAt: null,
    });
  }
  return events;
}

export function listingFeedEventCounts(events: ListingFeedEventDraft[]) {
  const count = (eventType: ListingFeedEventType) => events.filter((event) => event.eventType === eventType).length;
  return {
    newCount: count("new"),
    relistedCount: count("relisted"),
    reactivatedCount: count("reactivated"),
    priceChangeCount: count("price_change"),
    deactivatedCount: count("deactivated"),
  };
}

export function listingEventFingerprint(input: {
  marketId: string;
  runId: string;
  event: ListingFeedEventDraft;
}) {
  const rent = input.event.currentRent ?? input.event.previousRent ?? "none";
  return [input.marketId, input.event.eventType, input.event.sourceListingId, rent, input.runId].join(":");
}
