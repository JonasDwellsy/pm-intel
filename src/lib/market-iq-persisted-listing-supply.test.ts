import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePersistedMarketListingPulse,
  type PersistedMarketIqListingSupplySnapshot,
} from "./market-iq/persisted-listing-supply";

const now = new Date("2026-08-23T16:00:00.000Z");

function snapshot(overrides: Partial<PersistedMarketIqListingSupplySnapshot> = {}): PersistedMarketIqListingSupplySnapshot {
  return {
    sourceAvailableThrough: new Date("2026-08-23T15:45:00.000Z"),
    capturedAt: new Date("2026-08-23T15:50:00.000Z"),
    activeListings: 1_000,
    apartmentListings: 700,
    houseListings: 300,
    ageObservedListings: 800,
    medianActiveAgeDays: 18,
    activeOver30Days: 250,
    activeOver30SharePct: 31.3,
    activatedLast7Days: 120,
    activatedLast30Days: 450,
    age0To7Days: 120,
    age8To14Days: 180,
    age15To30Days: 250,
    age31To60Days: 150,
    age61PlusDays: 100,
    feedRun: {
      status: "complete",
      newCount: 4,
      relistedCount: 1,
      reactivatedCount: 2,
      priceChangeCount: 6,
      deactivatedCount: 3,
    },
    ...overrides,
  };
}

test("a complete current persisted snapshot produces listing supply without a live read", () => {
  const result = resolvePersistedMarketListingPulse({ marketName: "Columbus", now, snapshot: snapshot() });
  assert.equal(result.status, "healthy");
  assert.equal(result.sourceAvailableThrough?.toISOString(), "2026-08-23T15:45:00.000Z");
  assert.equal(result.activeListings, 1_000);
  assert.equal(result.listingAgeBuckets.length, 5);
  assert.equal(result.listingAgeBuckets.reduce((total, item) => total + item.count, 0), 800);
  assert.equal(result.priceChangeEvents, 6);
  assert.equal(result.attemptedAt, null);
});

test("missing evidence exposes only an attempted read time and no data freshness", () => {
  const result = resolvePersistedMarketListingPulse({ marketName: "Columbus", now, snapshot: null });
  assert.equal(result.status, "unavailable");
  assert.equal(result.unavailableReason, "missing");
  assert.equal(result.sourceAvailableThrough, null);
  assert.equal(result.attemptedAt, now);
  assert.match(result.message, /No persisted listing-supply snapshot/);
});

test("stale and future-dated evidence is withheld", () => {
  const stale = resolvePersistedMarketListingPulse({
    marketName: "Columbus",
    now,
    snapshot: snapshot({ sourceAvailableThrough: new Date("2026-08-20T15:45:00.000Z") }),
  });
  const future = resolvePersistedMarketListingPulse({
    marketName: "Columbus",
    now,
    snapshot: snapshot({ capturedAt: new Date("2026-08-23T16:01:00.000Z") }),
  });
  assert.equal(stale.unavailableReason, "stale");
  assert.equal(future.unavailableReason, "stale");
  assert.equal(stale.sourceAvailableThrough, null);
});

test("internally inconsistent snapshots never render supply figures", () => {
  const result = resolvePersistedMarketListingPulse({
    marketName: "Columbus",
    now,
    snapshot: snapshot({ apartmentListings: 900, houseListings: 300 }),
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.unavailableReason, "invalid");
  assert.equal(result.activeListings, 0);
});
