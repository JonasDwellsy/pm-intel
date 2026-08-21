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
  } as MarketIqListingEvent;
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

  it("uses the deactivation event timestamp and observed listing age for an off-market headline", () => {
    const observedAt = "2026-08-21T12:45:00.000Z";
    const [headline] = buildDailyEventHeadlines([event({
      id: "delisting:789",
      eventType: "delisting",
      listingAgeDays: 27,
      observedAt,
    })]);

    assert.equal(headline.section, "off_market");
    assert.equal(headline.observedAt, observedAt);
    assert.equal(headline.headline, "1-bedroom apartment in Cleveland went off market after 27 days listed");
    assert.match(headline.detail, /last advertised at \$1,250 asking rent/);
    assert.match(headline.detail, /may have leased or been withdrawn; the outcome is undetermined/);
  });

  it("uses the threshold crossing time and labels live age separately from days on market", () => {
    const observedAt = "2026-08-21T11:15:00.000Z";
    const [headline] = buildDailyEventHeadlines([event({
      id: "aging:321:60",
      eventType: "aging_threshold",
      listingAgeDays: 60,
      observedAt,
    })]);

    assert.equal(headline.section, "aging_watch");
    assert.equal(headline.observedAt, observedAt);
    assert.equal(headline.headline, "1-bedroom apartment in Cleveland reached 60 days live");
    assert.match(headline.detail, /still active at the source read/);
    assert.match(headline.detail, /live age, not days on market/);
  });

  it("does not invent an observation time or an unconfirmed prior rent", () => {
    assert.deepEqual(buildDailyEventHeadlines([
      event({ observedAt: "" }),
      event({ id: "price:missing", eventType: "price_change", previousRent: null }),
    ]), []);
  });
});
