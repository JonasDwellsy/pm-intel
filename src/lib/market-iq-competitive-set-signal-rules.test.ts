import assert from "node:assert/strict";
import test from "node:test";

import type { MarketIqCompetitiveSetBrief, MarketIqCompetitiveSetBriefEvent, MarketIqCompetitiveSetBriefPeriod } from "./market-iq/competitive-set-brief";
import {
  evaluateMarketIqCompetitiveSetSignalRule,
  parseMarketIqCompetitiveSetSignalRuleInput,
  type MarketIqCompetitiveSetSignalRuleInput,
} from "./market-iq/competitive-set-signal-rules";
import { EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS } from "./market-iq/daily-watchlists";

function event(id: string, observedAt: string, isSubject = false): MarketIqCompetitiveSetBriefEvent {
  return {
    id,
    key: `rent_changes:${id}`,
    editionId: "edition-1",
    eventType: "rent_changes",
    headline: `Rent changed at ${id}`,
    detail: "Advertised asking rent changed.",
    observedAt,
    city: "Columbus",
    zip: "43215",
    propertyManagerName: null,
    propertyId: isSubject ? "subject-1" : `peer-${id}`,
    listingUrl: null,
    sectionHref: "#daily-rent-moves",
    latitude: 39.96,
    longitude: -83,
    imageUrl: null,
    isSubject,
    previousRent: 1_500,
    askingRent: 1_400,
  };
}

function period(events: MarketIqCompetitiveSetBriefEvent[], complete = true): MarketIqCompetitiveSetBriefPeriod {
  return {
    startAt: "2026-08-16T09:00:00.000Z",
    endAt: "2026-08-23T09:00:00.000Z",
    expectedDays: 7,
    coverageDays: complete ? 7 : 6,
    complete,
    eventsTruncated: !complete,
    events,
    counts: { new_to_market: 0, rent_changes: events.length, off_market: 0, aging_watch: 0, concessions: 0, lease_up: 0 },
  };
}

function brief(current: MarketIqCompetitiveSetBriefEvent[], prior: MarketIqCompetitiveSetBriefEvent[] = [], complete = true): MarketIqCompetitiveSetBrief {
  const current7d = period(current, complete);
  const prior7d = period(prior, complete);
  return {
    state: "available",
    watchlist: {
      id: "watch-1",
      name: "Atlas peers",
      marketId: "columbus-oh",
      filters: { ...EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS, competitiveSet: { latitude: 39.96, longitude: -83, radiusMiles: 3, label: "Atlas", propertyId: "subject-1" } },
      visibility: "private",
      isOwner: true,
      isFollowing: true,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:00.000Z",
    },
    sourceAsOf: "2026-08-23T09:00:00.000Z",
    subjectPropertyId: "subject-1",
    current24h: { ...period(current.filter((item) => Date.parse(item.observedAt) > Date.parse("2026-08-22T09:00:00.000Z")), complete), expectedDays: 1, coverageDays: complete ? 1 : 0 },
    current7d,
    prior7d,
    comparison: { available: complete, metrics: [] },
    largestRentMoves: current,
    sevenDayListingEvents: [],
    sevenDayLeaseUpAlerts: [],
  };
}

const countRule: MarketIqCompetitiveSetSignalRuleInput = {
  eventType: "rent_changes",
  propertyScope: "peers",
  windowDays: 1,
  condition: "count_at_least",
  threshold: 2,
  enabled: true,
};

test("competitive signal rules reject invalid thresholds and one-day comparisons", () => {
  assert.equal(parseMarketIqCompetitiveSetSignalRuleInput({ ...countRule, threshold: 0 }).ok, false);
  assert.equal(parseMarketIqCompetitiveSetSignalRuleInput({ ...countRule, condition: "increase_at_least" }).ok, false);
});

test("count rules group peer evidence and preserve the newest real observation time", () => {
  const result = evaluateMarketIqCompetitiveSetSignalRule({
    rule: countRule,
    brief: brief([
      event("newer", "2026-08-23T08:15:00.000Z"),
      event("older", "2026-08-23T07:00:00.000Z"),
      event("subject", "2026-08-23T08:45:00.000Z", true),
    ]),
  });
  assert.equal(result.state, "triggered");
  if (result.state !== "triggered") return;
  assert.equal(result.current, 2);
  assert.equal(result.evidence.length, 2);
  assert.equal(result.observedAt, "2026-08-23T08:15:00.000Z");
  assert.equal(result.headline, "2 peer rent moves observed within 24 hours");
});

test("comparison rules require complete current and prior evidence windows", () => {
  const rule: MarketIqCompetitiveSetSignalRuleInput = { ...countRule, windowDays: 7, condition: "increase_at_least", threshold: 2 };
  const current = [event("1", "2026-08-23T08:00:00.000Z"), event("2", "2026-08-22T08:00:00.000Z"), event("3", "2026-08-21T08:00:00.000Z")];
  const prior = [event("old", "2026-08-15T08:00:00.000Z")];
  assert.equal(evaluateMarketIqCompetitiveSetSignalRule({ rule, brief: brief(current, prior) }).state, "triggered");
  assert.deepEqual(evaluateMarketIqCompetitiveSetSignalRule({ rule, brief: brief(current, prior, false) }), { state: "unavailable", reason: "coverage_incomplete" });
});

test("unavailable archives never produce competitive signals", () => {
  assert.deepEqual(evaluateMarketIqCompetitiveSetSignalRule({
    rule: countRule,
    brief: { state: "unavailable", attemptedAt: "2026-08-23T09:01:00.000Z" },
  }), { state: "unavailable", reason: "source_unavailable" });
});
