import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarketIqDailyWatchlistEmail,
  marketIqDailyDeliveryIsDue,
  parseMarketIqDailyDeliveryCadence,
  uniqueMarketIqDailyMatches,
  type MarketIqPersistedDailyMatch,
} from "./market-iq/daily-watchlist-delivery";

function match(overrides: Partial<MarketIqPersistedDailyMatch> = {}): MarketIqPersistedDailyMatch {
  return {
    id: "match-1",
    watchlistName: "Downtown rent cuts",
    marketId: "cleveland-elyria-mentor-oh",
    editionId: "edition-1",
    eventKey: "price_change:event-1",
    eventType: "price_change",
    headline: "Rent fell at 100 Main St",
    detail: "Advertised asking rent changed from $1,500 to $1,350.",
    observedAt: new Date("2026-08-22T08:30:00.000Z"),
    propertyId: "property-1",
    sectionHref: "#rent-changes",
    ...overrides,
  };
}

test("delivery cadence accepts only the supported explicit choices", () => {
  assert.equal(parseMarketIqDailyDeliveryCadence("daily"), "daily");
  assert.equal(parseMarketIqDailyDeliveryCadence("weekly"), "weekly");
  assert.equal(parseMarketIqDailyDeliveryCadence("in_app_only"), "in_app_only");
  assert.equal(parseMarketIqDailyDeliveryCadence("hourly"), null);
});

test("in-app delivery is never email-due and email cadences respect their windows", () => {
  const now = new Date("2026-08-22T09:00:00.000Z");
  assert.equal(marketIqDailyDeliveryIsDue({ cadence: "in_app_only", lastDeliveredAt: null, now }), false);
  assert.equal(marketIqDailyDeliveryIsDue({ cadence: "daily", lastDeliveredAt: null, now }), true);
  assert.equal(marketIqDailyDeliveryIsDue({ cadence: "daily", lastDeliveredAt: new Date("2026-08-21T14:00:01.000Z"), now }), false);
  assert.equal(marketIqDailyDeliveryIsDue({ cadence: "daily", lastDeliveredAt: new Date("2026-08-21T13:00:00.000Z"), now }), true);
  assert.equal(marketIqDailyDeliveryIsDue({ cadence: "weekly", lastDeliveredAt: new Date("2026-08-16T09:00:00.000Z"), now }), false);
  assert.equal(marketIqDailyDeliveryIsDue({ cadence: "weekly", lastDeliveredAt: new Date("2026-08-15T09:00:00.000Z"), now }), true);
});

test("one event matching several watchlists appears once with all watchlist names", () => {
  const unique = uniqueMarketIqDailyMatches([
    match(),
    match({ id: "match-2", watchlistName: "Large price moves" }),
  ]);
  assert.equal(unique.length, 1);
  assert.deepEqual(unique[0]?.watchlistNames, ["Downtown rent cuts", "Large price moves"]);
});

test("email delivery never sends an empty update", () => {
  assert.equal(buildMarketIqDailyWatchlistEmail({ recipientName: null, cadence: "daily", matches: [], appOrigin: "https://example.test" }), null);
});

test("email links to persisted evidence and preserves disclosure language", () => {
  const email = buildMarketIqDailyWatchlistEmail({ recipientName: "Jonas", cadence: "daily", matches: [match()], appOrigin: "https://example.test" });
  assert.ok(email);
  assert.match(email.html, /market-iq\/property\/property-1/);
  assert.match(email.text, /Observed listing activity only/);
  assert.match(email.text, /off-market means leased or withdrawn, undetermined/);
  assert.deepEqual(email.eventKeys, ["price_change:event-1"]);
});
