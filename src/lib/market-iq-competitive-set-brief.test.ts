import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketIqCompetitiveSetBrief } from "./market-iq/competitive-set-brief";
import type { MarketIqDailyEdition } from "./market-iq/daily-edition-archive";
import { EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS, type MarketIqDailyWatchlistView } from "./market-iq/daily-watchlists";
import type { MarketIqListingEvent, MarketIqMarketActivity } from "./market-iq/listing-events";
import type { MarketIqReportSnapshot } from "./market-iq/report/report";

const DAY_MS = 86_400_000;
const anchor = Date.parse("2026-08-23T09:00:00.000Z");

const watchlist: MarketIqDailyWatchlistView = {
  id: "watch-brief",
  name: "Atlas competitive set",
  marketId: "columbus-oh",
  filters: {
    ...EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS,
    competitiveSet: { latitude: 39.961, longitude: -83.002, radiusMiles: 3, label: "The Atlas", propertyId: "subject-1" },
  },
  visibility: "private",
  isOwner: true,
  isFollowing: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-22T00:00:00.000Z",
};

function event(index: number, overrides: Partial<MarketIqListingEvent> = {}): MarketIqListingEvent {
  return {
    id: `event-${index}`,
    eventType: "new_listing",
    propertyId: index === 0 ? "subject-1" : `peer-${index}`,
    propertyName: index === 0 ? "The Atlas" : `Peer ${index}`,
    address: `${100 + index} Main St`,
    city: "Columbus",
    zip: "43215",
    propertyType: "apartment",
    bedrooms: 2,
    askingRent: 1_600 + index,
    previousRent: null,
    observedAt: new Date(anchor - index * DAY_MS).toISOString(),
    latitude: 39.961,
    longitude: -83.002,
    ...overrides,
  } as MarketIqListingEvent;
}

function edition(index: number, events: MarketIqListingEvent[], eventsTruncated = false): MarketIqDailyEdition<MarketIqReportSnapshot> {
  const asOf = new Date(anchor - index * DAY_MS).toISOString();
  const activity: MarketIqMarketActivity = {
    asOf,
    newListings24h: events.filter((item) => item.eventType === "new_listing").length,
    sourceUpdates24h: events.length,
    confirmedPriceChanges24h: events.filter((item) => item.eventType === "price_change").length,
    advertisedConcessions24h: 0,
    delistings24h: 0,
    agingThresholds24h: 0,
    eventsTruncated,
    events,
  };
  return {
    id: `edition-${index}`,
    observedAt: asOf,
    state: "available",
    value: { marketActivity: { state: "available", activity } } as MarketIqReportSnapshot,
  };
}

test("competitive-set brief deduplicates retained event identity and preserves observed evidence", () => {
  const editions = Array.from({ length: 14 }, (_, index) => edition(index, [event(index)]));
  editions[1] = edition(1, [event(1), event(0)]);
  editions[0] = edition(0, [event(0), event(100, { id: "rent-0", eventType: "price_change", propertyId: "subject-1", observedAt: "2026-08-23T08:00:00.000Z", previousRent: 1_750, askingRent: 1_600 })]);
  const brief = buildMarketIqCompetitiveSetBrief({ watchlist, editions });
  assert.equal(brief.state, "available");
  if (brief.state !== "available") return;
  assert.equal(brief.current7d.coverageDays, 7);
  assert.equal(brief.prior7d.coverageDays, 7);
  assert.equal(brief.current7d.events.length, 8);
  assert.equal(new Set(brief.current7d.events.map((item) => item.key)).size, 8);
  assert.equal(brief.current7d.events.filter((item) => item.key === "new_to_market:event-0").length, 1);
  assert.equal(brief.current7d.events[0]?.observedAt, "2026-08-23T09:00:00.000Z");
  assert.equal(brief.current7d.events[0]?.isSubject, true);
  assert.equal(brief.largestRentMoves[0]?.previousRent, 1_750);
  assert.equal(brief.comparison.available, true);
});

test("competitive-set brief withholds comparisons when retained evidence is incomplete or truncated", () => {
  const editions = Array.from({ length: 14 }, (_, index) => edition(index, [event(index)], index === 2));
  const brief = buildMarketIqCompetitiveSetBrief({ watchlist, editions });
  assert.equal(brief.state, "available");
  if (brief.state !== "available") return;
  assert.equal(brief.current7d.eventsTruncated, true);
  assert.equal(brief.current7d.complete, false);
  assert.equal(brief.comparison.available, false);
});

test("competitive-set brief unavailable state carries only a real attempted read time", () => {
  const attemptedAt = "2026-08-23T09:02:00.000Z";
  const brief = buildMarketIqCompetitiveSetBrief({
    watchlist,
    editions: [{ id: "unavailable", observedAt: attemptedAt, state: "unavailable", value: { marketActivity: { state: "unavailable", attemptedAt } } as MarketIqReportSnapshot }],
  });
  assert.deepEqual(brief, { state: "unavailable", attemptedAt });
});
