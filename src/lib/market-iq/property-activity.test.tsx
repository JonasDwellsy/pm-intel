import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { MarketIqDailyEdition } from "@/lib/market-iq/daily-edition-archive";
import type { MarketIqMarketActivityAvailability } from "@/lib/market-iq/listing-events";
import { buildMarketIqPropertyActivityView, marketIqPropertyActivityPath } from "@/lib/market-iq/property-activity";

function edition(input: {
  id: string;
  asOf: string;
  askingRent: number;
  observedAt?: string;
}): MarketIqDailyEdition<{ marketActivity: MarketIqMarketActivityAvailability }> {
  return {
    id: input.id,
    observedAt: input.asOf,
    state: "available",
    value: {
      marketActivity: {
        state: "available",
        activity: {
          asOf: input.asOf,
          newListings24h: 1,
          sourceUpdates24h: 1,
          confirmedPriceChanges24h: 0,
          advertisedConcessions24h: 0,
          delistings24h: 0,
          agingThresholds24h: 0,
          events: [{
            id: "new:41",
            eventType: "new_listing",
            propertyId: "9001",
            address: "100 Lake Ave",
            city: "Cleveland",
            zip: "44101",
            propertyType: "apartment",
            bedrooms: 1,
            askingRent: input.askingRent,
            previousRent: null,
            observedAt: input.observedAt ?? "2026-08-21T10:00:00.000Z",
            propertyName: "Lake House",
            propertyManagerName: "North Shore Management",
            imageUrl: "https://images.example/property.jpg",
            listingUrl: "https://dwellsy.com/details/9001",
            latitude: 41.5,
            longitude: -81.7,
          }],
          propertySummaries: [{
            propertyId: "9001",
            propertyName: "Lake House",
            propertyManagerName: "North Shore Management",
            address: "100 Lake Ave",
            city: "Cleveland",
            zip: "44101",
            propertyType: "apartment",
            activeListingCount: 3,
            askingRentMin: 1100,
            askingRentMax: 1450,
            bedroomCounts: [{ bedrooms: 1, activeListings: 2 }, { bedrooms: 2, activeListings: 1 }],
            imageUrl: "https://images.example/property.jpg",
            listingUrl: "https://dwellsy.com/details/9001",
            latitude: 41.5,
            longitude: -81.7,
          }],
        },
      },
    },
  };
}

describe("property activity view", () => {
  it("uses the latest exact property summary and deduplicates repeated persisted events", () => {
    const latest = edition({ id: "edition-new", asOf: "2026-08-22T10:00:00.000Z", askingRent: 1200 });
    const previous = edition({ id: "edition-old", asOf: "2026-08-21T10:00:00.000Z", askingRent: 1200 });
    const view = buildMarketIqPropertyActivityView({ propertyId: "9001", editions: [latest, previous] });
    assert.ok(view);
    assert.equal(view.latestSummary?.activeListingCount, 3);
    assert.equal(view.latestSummary?.askingRentMin, 1100);
    assert.equal(view.latestSummary?.askingRentMax, 1450);
    assert.deepEqual(view.latestSummary?.bedroomCounts, [{ bedrooms: 1, activeListings: 2 }, { bedrooms: 2, activeListings: 1 }]);
    assert.equal(view.activity.length, 1);
    assert.equal(view.activity[0].observedAt, "2026-08-21T10:00:00.000Z");
    assert.equal(view.activity[0].editionId, "edition-new");
  });

  it("ignores legacy events without a stable parent property identity", () => {
    const legacy = edition({ id: "legacy", asOf: "2026-08-20T10:00:00.000Z", askingRent: 1200 });
    const availability = legacy.value.marketActivity;
    if (availability.state === "available") {
      availability.activity.events[0].propertyId = undefined;
      availability.activity.propertySummaries = [];
    }
    assert.equal(buildMarketIqPropertyActivityView({ propertyId: "9001", editions: [legacy] }), null);
  });

  it("builds a market-scoped internal path", () => {
    assert.equal(marketIqPropertyActivityPath("cleveland-elyria-mentor-oh", "9001"), "/market-iq/property/9001?market=cleveland-elyria-mentor-oh");
  });
});
