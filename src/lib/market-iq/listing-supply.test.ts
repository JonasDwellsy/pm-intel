import assert from "node:assert/strict";
import test from "node:test";
import { summarizeActiveListingSupply } from "./listing-supply";

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
