import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { MarketIqListingEvent } from "@/lib/market-iq/listing-events";
import { buildDailyEventHeadlines } from "@/lib/market-iq/daily-events";

function event(overrides: Partial<MarketIqListingEvent> = {}): MarketIqListingEvent {
  return {
    id: "new:123",
    eventType: "new_listing",
    address: "100 Main St",
    city: "Cleveland",
    zip: "44113",
    propertyType: "apartment",
    bedrooms: 1,
    askingRent: 1_250,
    previousRent: null,
    observedAt: "2026-08-21T14:30:00.000Z",
    ...overrides,
  };
}

describe("buildDailyEventHeadlines", () => {
  it("carries the exact observed event timestamp into new-listing headlines", () => {
    const observedAt = "2026-08-21T14:30:00.000Z";
    const [headline] = buildDailyEventHeadlines([event({ observedAt })]);

    assert.deepEqual({
      section: headline.section,
      observedAt: headline.observedAt,
      headline: headline.headline,
    }, {
      section: "new_to_market",
      observedAt,
      headline: "New 1-bedroom apartment in Cleveland at $1,250",
    });
  });

  it("shows both previous and current asking rent for a confirmed price change", () => {
    const [headline] = buildDailyEventHeadlines([event({
      id: "price:456",
      eventType: "price_change",
      askingRent: 1_175,
      previousRent: 1_250,
    })]);

    assert.equal(headline.section, "rent_changes");
    assert.equal(headline.observedAt, "2026-08-21T14:30:00.000Z");
    assert.match(headline.detail, /from \$1,250 to \$1,175 asking rent/);
  });

  it("does not invent an observation time or an unconfirmed prior rent", () => {
    assert.deepEqual(buildDailyEventHeadlines([
      event({ observedAt: "" }),
      event({ id: "price:missing", eventType: "price_change", previousRent: null }),
    ]), []);
  });
});
