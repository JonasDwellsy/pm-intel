import assert from "node:assert/strict";
import test from "node:test";

import {
  assessNationalListingSupply,
  summarizeNationalSupplyCoverage,
  type NationalListingSupplyAggregate,
} from "./market-iq/national-listing-supply";

const capturedAt = new Date("2026-08-23T17:30:00.000Z");

function aggregate(overrides: Partial<NationalListingSupplyAggregate> = {}): NationalListingSupplyAggregate {
  return {
    cbsaCode: "18140",
    marketName: "Columbus, OH",
    stateCodes: ["OH"],
    timeZone: "America/New_York",
    sourceAvailableThrough: new Date("2026-08-23T17:20:00.000Z"),
    activeListings: 1_000,
    apartmentListings: 700,
    houseListings: 300,
    ageObservedListings: 1_000,
    medianActiveAgeDays: 24,
    activeOver30Days: 300,
    activeOver30SharePct: 30,
    activatedLast7Days: 100,
    activatedLast30Days: 500,
    age0To7Days: 100,
    age8To14Days: 150,
    age15To30Days: 450,
    age31To60Days: 200,
    age61PlusDays: 100,
    ...overrides,
  };
}

function thinAggregate(overrides: Partial<NationalListingSupplyAggregate> = {}) {
  return aggregate({
    activeListings: 200,
    apartmentListings: 120,
    houseListings: 80,
    ageObservedListings: 200,
    activeOver30Days: 60,
    activatedLast7Days: 20,
    activatedLast30Days: 100,
    age0To7Days: 20,
    age8To14Days: 30,
    age15To30Days: 90,
    age31To60Days: 40,
    age61PlusDays: 20,
    ...overrides,
  });
}

test("a current complete MSA aggregate is eligible before the market launches", () => {
  assert.equal(assessNationalListingSupply(aggregate(), capturedAt).coverageStatus, "eligible");
});

test("thin markets are retained in the catalog but withheld from publication", () => {
  const result = assessNationalListingSupply(thinAggregate(), capturedAt);
  assert.equal(result.coverageStatus, "insufficient");
  assert.equal(result.activeListings, 200);
});

test("stale, future-dated, and missing source timestamps cannot publish", () => {
  const stale = assessNationalListingSupply(aggregate({ sourceAvailableThrough: new Date("2026-08-20T17:20:00.000Z") }), capturedAt);
  const future = assessNationalListingSupply(aggregate({ sourceAvailableThrough: new Date("2026-08-23T17:31:00.000Z") }), capturedAt);
  const missing = assessNationalListingSupply(aggregate({ sourceAvailableThrough: null }), capturedAt);
  assert.equal(stale.coverageStatus, "stale");
  assert.equal(future.coverageStatus, "stale");
  assert.equal(missing.coverageStatus, "stale");
});

test("non-reconciling aggregate facts are marked invalid", () => {
  const result = assessNationalListingSupply(aggregate({ apartmentListings: 800 }), capturedAt);
  assert.equal(result.coverageStatus, "invalid");
});

test("coverage summary accounts for every observed MSA exactly once", () => {
  const rows = [
    assessNationalListingSupply(aggregate(), capturedAt),
    assessNationalListingSupply(thinAggregate({ cbsaCode: "17460" }), capturedAt),
    assessNationalListingSupply(aggregate({ cbsaCode: "41860", sourceAvailableThrough: null }), capturedAt),
    assessNationalListingSupply(aggregate({ cbsaCode: "41940", apartmentListings: 800 }), capturedAt),
  ];
  assert.deepEqual(summarizeNationalSupplyCoverage(rows), {
    totalMarkets: 4,
    eligibleMarkets: 1,
    insufficientMarkets: 1,
    staleMarkets: 1,
    invalidMarkets: 1,
  });
});
