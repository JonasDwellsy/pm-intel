import { describe, expect, it } from "vitest";

import {
  EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS,
  marketIqDailyWatchlistRecipientIds,
  matchMarketIqDailyWatchlist,
  parseMarketIqDailyWatchlistFilters,
  parseMarketIqDailyWatchlistInput,
  type MarketIqDailyWatchlistView,
} from "@/lib/market-iq/daily-watchlists";
import type { MarketIqMarketActivity } from "@/lib/market-iq/listing-events";

const activity: MarketIqMarketActivity = {
  asOf: "2026-08-22T20:00:00.000Z",
  newListings24h: 1,
  sourceUpdates24h: 3,
  confirmedPriceChanges24h: 1,
  advertisedConcessions24h: 0,
  delistings24h: 0,
  agingThresholds24h: 0,
  events: [
    {
      id: "new-1",
      eventType: "new_listing",
      address: "100 Main St, Apt 2",
      city: "Columbus",
      zip: "43215",
      propertyType: "apartment",
      bedrooms: 2,
      askingRent: 1_600,
      previousRent: null,
      observedAt: "2026-08-22T19:00:00.000Z",
      propertyName: "The Atlas",
      propertyManagerName: "Northstar Residential",
      listingUrl: "https://example.com/new-1",
      latitude: 39.961,
      longitude: -83.002,
    },
    {
      id: "rent-1",
      eventType: "price_change",
      address: "45 Oak Ave",
      city: "Dublin",
      zip: "43017",
      propertyType: "house",
      bedrooms: 3,
      askingRent: 2_250,
      previousRent: 2_400,
      observedAt: "2026-08-22T18:00:00.000Z",
      propertyManagerName: "Northstar Residential",
      latitude: 40.10,
      longitude: -83.11,
    },
  ],
  leaseUpAlerts: [{
    id: "lease-1",
    propertyId: "property-1",
    propertyName: "River House",
    propertyManagerName: "Harbor Management",
    address: "20 Water St",
    city: "Columbus",
    zip: "43215",
    newListingCount: 31,
    totalUnits: 180,
    observedAt: "2026-08-22T19:30:00.000Z",
    imageUrl: null,
    listingUrl: "https://example.com/lease-1",
    latitude: 39.96,
    longitude: -83,
  }],
};

function watchlist(filters: Partial<MarketIqDailyWatchlistView["filters"]>): MarketIqDailyWatchlistView {
  return {
    id: "watch-1",
    name: "Personal scope",
    marketId: "columbus-oh",
    filters: { ...EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS, ...filters },
    visibility: "private",
    isOwner: true,
    isFollowing: true,
    createdAt: "2026-08-22T17:00:00.000Z",
    updatedAt: "2026-08-22T17:00:00.000Z",
  };
}

describe("personal Daily Watchlists", () => {
  it("matches multiple observed event types while preserving their actual timestamps", () => {
    const matches = matchMarketIqDailyWatchlist(watchlist({
      geography: "city:Columbus",
      eventTypes: ["new_to_market", "lease_up"],
    }), activity);
    expect(matches.map((match) => match.id)).toEqual(["lease-1", "new-1"]);
    expect(matches.map((match) => match.observedAt)).toEqual([
      "2026-08-22T19:30:00.000Z",
      "2026-08-22T19:00:00.000Z",
    ]);
  });

  it("can target a property manager and a material rent reduction", () => {
    const matches = matchMarketIqDailyWatchlist(watchlist({
      query: "Northstar",
      eventTypes: ["rent_changes"],
      rentDirection: "decrease",
      minimumRentMagnitude: 100,
    }), activity);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ id: "rent-1", eventType: "rent_changes" });
  });

  it("does not let bedroom or rent filters accidentally match property-level lease-up signals", () => {
    expect(matchMarketIqDailyWatchlist(watchlist({ eventTypes: ["lease_up"], bedrooms: "2" }), activity)).toEqual([]);
    expect(matchMarketIqDailyWatchlist(watchlist({ eventTypes: ["lease_up"], minimumRentMagnitude: 50 }), activity)).toEqual([]);
  });

  it("matches only source-located activity inside a saved competitive-set radius", () => {
    const matches = matchMarketIqDailyWatchlist(watchlist({
      competitiveSet: { latitude: 39.96, longitude: -83, radiusMiles: 1, label: "River House" },
    }), activity);
    expect(matches.map((match) => match.id)).toEqual(["lease-1", "new-1"]);
  });

  it("excludes records without coordinates when a competitive-set radius is active", () => {
    const withoutCoordinates = { ...activity, events: [{ ...activity.events[0], latitude: null, longitude: null }] };
    const matches = matchMarketIqDailyWatchlist(watchlist({
      eventTypes: ["new_to_market"],
      competitiveSet: { latitude: 39.96, longitude: -83, radiusMiles: 3, label: "Pinned point" },
    }), withoutCoordinates);
    expect(matches).toEqual([]);
  });

  it("validates names, scopes, event types, and bounded free-text queries", () => {
    expect(parseMarketIqDailyWatchlistInput({
      name: "Downtown arrivals",
      filters: { ...EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS, eventTypes: ["new_to_market"] },
    }).ok).toBe(true);
    expect(parseMarketIqDailyWatchlistInput({
      name: "Invalid",
      filters: { ...EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS, eventTypes: ["monthly_trend"] },
    }).ok).toBe(false);
    expect(parseMarketIqDailyWatchlistInput({
      name: "Invalid",
      filters: { ...EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS, query: "x".repeat(121) },
    }).ok).toBe(false);
    expect(parseMarketIqDailyWatchlistInput({
      name: "Invalid radius",
      filters: { ...EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS, competitiveSet: { latitude: 39.96, longitude: -83, radiusMiles: 25, label: "Too broad" } },
    }).ok).toBe(false);
    expect(parseMarketIqDailyWatchlistInput({
      name: "Downtown radius",
      filters: { ...EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS, competitiveSet: { latitude: 39.96, longitude: -83, radiusMiles: 3, label: "River House" } },
    }).ok).toBe(true);
  });

  it("keeps existing saved watchlists valid with no competitive-set radius", () => {
    const legacy = { ...EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS } as Record<string, unknown>;
    delete legacy.competitiveSet;
    expect(parseMarketIqDailyWatchlistFilters(JSON.stringify(legacy))?.competitiveSet).toBeNull();
  });

  it("defaults legacy watchlist inputs to private and validates team visibility", () => {
    const legacy = parseMarketIqDailyWatchlistInput({ name: "Legacy private", filters: EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS });
    expect(legacy.ok && legacy.value.visibility).toBe("private");
    const shared = parseMarketIqDailyWatchlistInput({ name: "Team watch", visibility: "organization", filters: EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS });
    expect(shared.ok && shared.value.visibility).toBe("organization");
    expect(parseMarketIqDailyWatchlistInput({ name: "Public leak", visibility: "public", filters: EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS }).ok).toBe(false);
  });

  it("materializes private matches only for the owner and shared matches for distinct followers", () => {
    expect(marketIqDailyWatchlistRecipientIds({
      ownerUserId: "owner",
      visibility: "private",
      subscriberUserIds: ["teammate"],
    })).toEqual(["owner"]);
    expect(marketIqDailyWatchlistRecipientIds({
      ownerUserId: "owner",
      visibility: "organization",
      subscriberUserIds: ["teammate", "owner", "teammate"],
    })).toEqual(["owner", "teammate"]);
  });
});
