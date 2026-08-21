import assert from "node:assert/strict";
import test from "node:test";
import {
  compareListingSupplyHistory,
  interpretListingSupplyCondition,
  summarizeActiveListingSupply,
  summarizeDailyActiveListingSupply,
  type ListingSupplyHistoryPoint,
} from "./listing-supply";

const DAY_MS = 24 * 60 * 60 * 1_000;
const asOf = new Date("2026-08-19T12:00:00.000Z");
const activatedDaysAgo = (days: number) => new Date(asOf.getTime() - days * DAY_MS);

test("summarizes current active listing age without treating it as time to lease", () => {
  const result = summarizeActiveListingSupply(
    [0, 7, 8, 14, 15, 30, 31, 60, 61].map((days) => ({ listingCreatedAt: activatedDaysAgo(days) })),
    asOf,
  );

  assert.equal(result.ageObservedListings, 9);
  assert.equal(result.medianActiveAgeDays, 15);
  assert.equal(result.activatedLast7Days, 2);
  assert.equal(result.activatedLast30Days, 6);
  assert.equal(result.activeOver30Days, 3);
  assert.equal(result.activeOver30SharePct, 33.3);
  assert.deepEqual(result.listingAgeBuckets.map(({ count }) => count), [2, 2, 2, 2, 1]);
});

test("ignores future and invalid activation dates", () => {
  const result = summarizeActiveListingSupply(
    [
      { listingCreatedAt: activatedDaysAgo(10) },
      { listingCreatedAt: new Date(asOf.getTime() + DAY_MS) },
      { listingCreatedAt: new Date("invalid") },
    ],
    asOf,
  );

  assert.equal(result.ageObservedListings, 1);
  assert.equal(result.medianActiveAgeDays, 10);
});

test("returns an explicit empty summary when no listing age can be observed", () => {
  const result = summarizeActiveListingSupply([], asOf);
  assert.equal(result.medianActiveAgeDays, null);
  assert.equal(result.activeOver30SharePct, null);
  assert.deepEqual(result.listingAgeBuckets.map(({ count }) => count), [0, 0, 0, 0, 0]);
});

test("builds one UTC-dated inventory and age observation from a captured active set", () => {
  const capturedAt = new Date("2026-08-21T23:45:00.000Z");
  const result = summarizeDailyActiveListingSupply([
    { listingCreatedAt: new Date("2026-08-20T23:45:00.000Z"), propertyType: "apartment" },
    { listingCreatedAt: new Date("2026-07-01T23:45:00.000Z"), propertyType: "apartment" },
    { listingCreatedAt: new Date("2026-08-11T23:45:00.000Z"), propertyType: "house" },
  ], capturedAt);

  assert.equal(result.snapshotDate.toISOString(), "2026-08-21T00:00:00.000Z");
  assert.equal(result.activeListings, 3);
  assert.equal(result.apartmentListings, 2);
  assert.equal(result.houseListings, 1);
  assert.equal(result.medianActiveAgeDays, 10);
  assert.equal(result.activeOver30Days, 1);
  assert.equal(result.activeOver30SharePct, 33.3);
});

function historyPoint(date: string, activeListings: number, medianActiveAgeDays: number | null): ListingSupplyHistoryPoint {
  return {
    snapshotDate: date,
    sourceAvailableThrough: `${date}T12:00:00.000Z`,
    activeListings,
    medianActiveAgeDays,
  };
}

test("withholds comparisons until a genuinely comparable daily observation exists", () => {
  const points = [
    historyPoint("2026-08-20", 1_900, 29),
    historyPoint("2026-08-21", 1_895, 29),
  ];

  assert.equal(compareListingSupplyHistory(points, 7), null);
  assert.equal(compareListingSupplyHistory(points, 30), null);
  assert.equal(interpretListingSupplyCondition(null), null);
});

test("compares a near-daily observation using the actual elapsed interval", () => {
  const comparison = compareListingSupplyHistory([
    historyPoint("2026-08-13", 1_800, 24),
    historyPoint("2026-08-21", 1_890, 29),
  ], 7);

  assert.deepEqual(comparison, {
    requestedDays: 7,
    elapsedDays: 8,
    startDate: "2026-08-13",
    endDate: "2026-08-21",
    inventoryChange: 90,
    inventoryChangePct: 5,
    medianAgeChangeDays: 5,
  });
  assert.equal(interpretListingSupplyCondition(comparison)?.title, "Supply is building and taking longer to clear");
});

test("does not label noise as a directional change", () => {
  const comparison = compareListingSupplyHistory([
    historyPoint("2026-07-22", 1_900, 29),
    historyPoint("2026-08-21", 1_920, 30),
  ], 30);

  assert.equal(interpretListingSupplyCondition(comparison)?.title, "Observed supply conditions are holding steady");
});
