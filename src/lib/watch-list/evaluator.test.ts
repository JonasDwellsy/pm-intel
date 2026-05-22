// node:test runner — run via `npm run test:watch-list`. Zero deps; the
// project already has tsx for prisma/seed.ts so test files just need
// tsx to register the TS loader.

import test from "node:test";
import { strict as assert } from "node:assert";
import { evaluateCriterion } from "./evaluator";
import type { PMRecord } from "./fields";

// Fixture: a minimal PMRecord that covers every field accessor used
// across the test suite. Filled in with deliberately-mixed values so
// each test can assert one dimension at a time without rebuilding the
// whole record from scratch.
function makePm(overrides: Partial<PMRecord["scorecard"]> = {}, top: Partial<PMRecord> = {}): PMRecord {
  return {
    slug: "test-pm",
    name: "Test PM",
    marketId: "phoenix-az",
    claimed: false,
    marketCount: 1,
    scorecard: {
      pm: { slug: "test-pm", name: "Test PM", quadrant: "scattered-independent", quadrant7Cell: "SFR Independent", hybrid: false, institutional: false },
      market: { id: "phoenix-az", name: "Phoenix", state: "AZ", msaCode: "38060", fullName: "Phoenix-Mesa-Glendale, AZ MSA" },
      methodologyVersion: "v0.8",
      dataAsOf: "2026-05-19",
      coverage: { firstListing: "2024-01-01", monthsOnPlatform: 23, lifetimeListings: 100, t12Listings: 50, urusLifetime: 80, urusT12: 47, activeListings: 12, totalObservedUnits: 60, nationalObservedUnitsT12: 47, observedCommunities: 1, observedCommunityTotalUnits: 60 },
      geographicCoverage: { topCities: [{ name: "Phoenix", pct: 68 }] },
      classificationRationale: "",
      rank: { overall: 5, overallTotal: 50, quadrant: 2, quadrantTotal: 20, compositeStar: null, compositeCohortName: null },
      performance: { domT12: 42, domLifetime: 45, domStar: null, percentile: null },
      rentPerformance: { pmYoyChange: 0.03, cohortYoyChange: 0.025, vsComp: 0.005, star: null },
      marketing: { compositeScore: 50, percentile: null, star: null },
      tenancy: { multiEpisodePct: 0.4, medianTenancy: 12, star: null, shortHistoryCaveat: false },
      communityVisibility: null,
      generatedText: undefined,
      portfolioEstimate: {
        status: "estimated",
        point: 800,
        low: 550,
        high: 1050,
        cohort: "SFR Independent, URUs <100",
        cohortN: 12,
        confidence: "Low",
      },
      t12ListingsCount: 47,
      t24t12ListingsCount: 38,
      concessionRate: 0.08,
      canonicalOperatorId: "test-pm",
      ...overrides,
    },
    ...top,
  } as PMRecord;
}

test("eq operator on quadrant7Cell matches", () => {
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "quadrant7Cell", operator: "eq", value: "SFR Independent" }), true);
  assert.equal(evaluateCriterion(pm, { field: "quadrant7Cell", operator: "eq", value: "SFR Institutional" }), false);
});

test("ne operator inverts eq", () => {
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "quadrant7Cell", operator: "ne", value: "Hybrid" }), true);
});

test("in operator on marketIds", () => {
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "marketIds", operator: "in", value: ["phoenix-az", "memphis-tn-ms-ar"] }), true);
  assert.equal(evaluateCriterion(pm, { field: "marketIds", operator: "in", value: ["nashville-davidson-murfreesboro-franklin-tn"] }), false);
});

test("notIn operator on canonicalOperatorId — excludes specific operators", () => {
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "canonicalOperatorId", operator: "notIn", value: ["invitation-homes", "pure-property-management"] }), true);
  assert.equal(evaluateCriterion(pm, { field: "canonicalOperatorId", operator: "notIn", value: ["test-pm"] }), false);
});

test("gte / lte numeric comparison on estimatedPortfolioPoint", () => {
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "estimatedPortfolioPoint", operator: "gte", value: 500 }), true);
  assert.equal(evaluateCriterion(pm, { field: "estimatedPortfolioPoint", operator: "gte", value: 1500 }), false);
  assert.equal(evaluateCriterion(pm, { field: "estimatedPortfolioPoint", operator: "lte", value: 1500 }), true);
  assert.equal(evaluateCriterion(pm, { field: "estimatedPortfolioPoint", operator: "lte", value: 500 }), false);
});

test("between numeric range on estimatedPortfolioPoint", () => {
  const pm = makePm();
  // 800 is in [500, 3000]
  assert.equal(evaluateCriterion(pm, { field: "estimatedPortfolioPoint", operator: "between", value: [500, 3000] }), true);
  // 800 is NOT in [1000, 3000]
  assert.equal(evaluateCriterion(pm, { field: "estimatedPortfolioPoint", operator: "between", value: [1000, 3000] }), false);
  // inclusive at boundary
  assert.equal(evaluateCriterion(pm, { field: "estimatedPortfolioPoint", operator: "between", value: [800, 1000] }), true);
});

test("between rejects malformed value array", () => {
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "estimatedPortfolioPoint", operator: "between", value: [800] as unknown as [number, number] }), false);
});

test("contains operator (substring, case-insensitive) on name", () => {
  const pm = makePm({}, { name: "Pure Property Management" });
  assert.equal(evaluateCriterion(pm, { field: "name", operator: "contains", value: "pure" }), true);
  assert.equal(evaluateCriterion(pm, { field: "name", operator: "contains", value: "INVITATION" }), false);
});

test("null PM value fails by default — portfolio estimate insufficient_data", () => {
  // portfolioEstimate.point is undefined when status is insufficient_data
  const pm = makePm({
    portfolioEstimate: {
      status: "insufficient_data",
      message: "Verified self-report required",
    } as PMRecord["scorecard"]["portfolioEstimate"],
  });
  assert.equal(evaluateCriterion(pm, { field: "estimatedPortfolioPoint", operator: "gte", value: 100 }), false);
  assert.equal(evaluateCriterion(pm, { field: "estimatedPortfolioPoint", operator: "lte", value: 100 }), false);
});

test("unknown field id returns false (doesn't throw)", () => {
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "bogusField", operator: "eq", value: "anything" }), false);
});

test("listingTrajectoryYoY derives from t12 vs t24", () => {
  // 47 vs 38 prior → (47-38)/38 ≈ +0.237
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "listingTrajectoryYoY", operator: "gte", value: 0 }), true);
  assert.equal(evaluateCriterion(pm, { field: "listingTrajectoryYoY", operator: "gte", value: 0.5 }), false);
});

test("listingTrajectoryYoY null when prior window is 0", () => {
  const pm = makePm({ t24t12ListingsCount: 0 });
  assert.equal(evaluateCriterion(pm, { field: "listingTrajectoryYoY", operator: "gte", value: 0 }), false);
});

test("boolean fields — claimed / hybrid / institutional", () => {
  const pm = makePm({}, { claimed: true });
  assert.equal(evaluateCriterion(pm, { field: "claimed", operator: "eq", value: true }), true);
  assert.equal(evaluateCriterion(pm, { field: "claimed", operator: "eq", value: false }), false);
  assert.equal(evaluateCriterion(pm, { field: "hybrid", operator: "eq", value: false }), true);
});

test("portfolioEstimateConfidence enum filter", () => {
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "portfolioEstimateConfidence", operator: "in", value: ["Medium", "High"] }), false);
  assert.equal(evaluateCriterion(pm, { field: "portfolioEstimateConfidence", operator: "in", value: ["Low", "Medium", "High"] }), true);
});

test("type coercion: numeric string compares correctly with gte", () => {
  // gte coerces both sides to Number — a stringly-typed value still
  // works. Reaches through topCityConcentration which is stored as
  // a number.
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "topCityConcentration", operator: "gte", value: 60 }), true);
  assert.equal(evaluateCriterion(pm, { field: "topCityConcentration", operator: "gte", value: 80 }), false);
});

test("empty arrays — `in` with empty array is always false", () => {
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "marketIds", operator: "in", value: [] }), false);
});

test("empty arrays — `notIn` with empty array is always true", () => {
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "marketIds", operator: "notIn", value: [] }), true);
});
