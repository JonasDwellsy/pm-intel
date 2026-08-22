import { describe, expect, it } from "vitest";

import {
  EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS,
  filterMarketIqDailyEventHeadlines,
  marketIqDailyEventExplorerOptions,
  marketIqDailyExplorerFilters,
  marketIqDailyObservedEventTotal,
  parseMarketIqDailySavedView,
  savedMarketIqDailyView,
} from "@/lib/market-iq/daily-event-explorer";
import { buildDailyEventHeadlines } from "@/lib/market-iq/daily-events";
import type { MarketIqListingEvent, MarketIqMarketActivity } from "@/lib/market-iq/listing-events";

const events: MarketIqListingEvent[] = [
  { id: "new", eventType: "new_listing", address: "100 Main St", city: "Cleveland", zip: "44113", propertyType: "apartment", bedrooms: 0, askingRent: 1_100, previousRent: null, observedAt: "2026-08-22T15:00:00.000Z" },
  { id: "increase", eventType: "price_change", address: "200 Lake Ave", city: "Lakewood", zip: "44107", propertyType: "house", bedrooms: 3, askingRent: 1_750, previousRent: 1_600, observedAt: "2026-08-22T14:00:00.000Z" },
  { id: "decrease", eventType: "price_change", address: "300 Euclid Ave", city: "Cleveland", zip: "44114", propertyType: "apartment", bedrooms: 2, askingRent: 1_300, previousRent: 1_550, observedAt: "2026-08-22T13:00:00.000Z" },
  { id: "departure", eventType: "delisting", address: "400 Lee Rd", city: "Cleveland Heights", zip: "44118", propertyType: "house", bedrooms: 4, askingRent: 2_400, previousRent: null, listingAgeDays: 41, observedAt: "2026-08-22T12:00:00.000Z" },
];

const headlines = buildDailyEventHeadlines(events);

describe("Daily Event Explorer filtering", () => {
  it("searches saved address, city, and ZIP fields and orders results newest first", () => {
    expect(filterMarketIqDailyEventHeadlines(headlines, { ...EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS, query: "lake" }).map((item) => item.id)).toEqual(["increase"]);
    expect(filterMarketIqDailyEventHeadlines(headlines, { ...EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS, query: "4411" }).map((item) => item.id)).toEqual(["new", "decrease", "departure"]);
  });

  it("combines event, geography, bedroom, and property filters", () => {
    const result = filterMarketIqDailyEventHeadlines(headlines, {
      ...EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS,
      section: "rent_changes",
      geography: "city:cleveland",
      bedrooms: "2",
      propertyType: "apartment",
    });
    expect(result.map((item) => item.id)).toEqual(["decrease"]);
  });

  it("applies rent direction and absolute dollar magnitude only to price changes", () => {
    expect(filterMarketIqDailyEventHeadlines(headlines, {
      ...EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS,
      rentDirection: "decrease",
      minimumRentMagnitude: 200,
    }).map((item) => item.id)).toEqual(["decrease"]);
    expect(filterMarketIqDailyEventHeadlines(headlines, {
      ...EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS,
      rentDirection: "increase",
      minimumRentMagnitude: 200,
    })).toEqual([]);
  });

  it("builds stable city and ZIP choices from retained records", () => {
    expect(marketIqDailyEventExplorerOptions(headlines)).toEqual({
      cities: ["Cleveland", "Cleveland Heights", "Lakewood"],
      zipCodes: ["44107", "44113", "44114", "44118"],
    });
  });

  it("totals exact observed event categories without source-update noise", () => {
    const activity = {
      asOf: "2026-08-22T15:00:00.000Z",
      newListings24h: 46,
      sourceUpdates24h: 50_000,
      confirmedPriceChanges24h: 14,
      advertisedConcessions24h: 8,
      delistings24h: 52,
      agingThresholds24h: 20,
      events: [],
    } satisfies MarketIqMarketActivity;
    expect(marketIqDailyObservedEventTotal(activity)).toBe(140);
  });

  it("round-trips saved structured filters without retaining address search", () => {
    const saved = savedMarketIqDailyView({
      ...EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS,
      query: "100 Main St",
      section: "rent_changes",
      geography: "city:Cleveland",
      bedrooms: "2",
      rentDirection: "decrease",
      minimumRentMagnitude: 100,
    });
    expect(saved).not.toHaveProperty("query");
    expect(marketIqDailyExplorerFilters(parseMarketIqDailySavedView(JSON.stringify(saved)))).toEqual({
      ...saved,
      query: "",
    });
    expect(parseMarketIqDailySavedView(JSON.stringify({ ...saved, query: "100 Main St" }))).not.toHaveProperty("query");
  });

  it("rejects malformed or unsupported saved-filter payloads", () => {
    expect(parseMarketIqDailySavedView("not-json")).toBeNull();
    expect(parseMarketIqDailySavedView(JSON.stringify({
      section: "monthly_trend",
      geography: "all",
      bedrooms: "all",
      propertyType: "all",
      rentDirection: "all",
      minimumRentMagnitude: 0,
    }))).toBeNull();
  });
});
