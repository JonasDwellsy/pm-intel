// node:test runner — run via `npm run test:watch-list`. Zero deps; the
// project already has tsx for prisma/seed.ts so test files just need
// tsx to register the TS loader.

import test from "node:test";
import { strict as assert } from "node:assert";
import { evaluateCriterion } from "./evaluator";
import type { PMRecord } from "./fields";
import { sizeBandLabel } from "@/lib/operator-size-bands";

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
      rentPerformance: { pmYoyChange: 0.03, cohortYoyChange: 0.025, vsComp: 0.005, delta: 0.02, star: null },
      marketing: { compositeScore: 50, percentile: null, star: null },
      // NOTE: no watch-list field currently reads tenancy (see
      // fields.ts FIELD_REGISTRY — there's no tenancy-backed entry
      // yet). retention18Pct is the current survival-based metric;
      // medianTenancy was never a real ScorecardData.tenancy field
      // (stale from early prototyping) and has been replaced here so
      // the fixture doesn't carry a bogus key.
      tenancy: { multiEpisodePct: 0.4, retention18Pct: 82, star: null, shortHistoryCaveat: false },
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

test("portfolioSizeBand — ordinal comparison on band index, not units", () => {
  // makePm's default point is 800, which lands in "800–1,600" (index 5).
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "portfolioSizeBand", operator: "gte", value: 5 }), true);
  assert.equal(evaluateCriterion(pm, { field: "portfolioSizeBand", operator: "gte", value: 6 }), false);
  assert.equal(evaluateCriterion(pm, { field: "portfolioSizeBand", operator: "lte", value: 5 }), true);
  assert.equal(evaluateCriterion(pm, { field: "portfolioSizeBand", operator: "lte", value: 4 }), false);
  // "between the 400–800 and 1,600+ bands" spans indexes 4..6.
  assert.equal(evaluateCriterion(pm, { field: "portfolioSizeBand", operator: "between", value: [4, 6] }), true);
  assert.equal(evaluateCriterion(pm, { field: "portfolioSizeBand", operator: "between", value: [0, 3] }), false);
});

test("portfolioSizeBand agrees with the band the scorecard displays", () => {
  // Regression. The precise-number fields compare the RAW estimate while every
  // display surface bands the display-ROUNDED one. At 1,599.4 that split put a
  // watch list and a scorecard in direct contradiction: the card, PDF, and peer
  // table all read "1,600+" while a list set to "at least 1600" excluded the
  // operator. Filtering by band has to agree with the band on the page.
  const straddler = makePm({
    portfolioEstimate: { status: "estimated", point: 1599.4 },
  } as unknown as Parameters<typeof makePm>[0]);
  assert.equal(sizeBandLabel(1599.4), "1,600+");
  assert.equal(
    evaluateCriterion(straddler, { field: "portfolioSizeBand", operator: "gte", value: 6 }),
    true
  );
  // The retired field still behaves the old way — that is the point of keeping
  // it: saved lists must keep matching exactly what they always matched.
  assert.equal(
    evaluateCriterion(straddler, { field: "estimatedPortfolioPoint", operator: "gte", value: 1600 }),
    false
  );
});

test("portfolioSizeBand — no estimate yields no band, so the criterion fails", () => {
  const pm = makePm({
    portfolioEstimate: {
      status: "insufficient_data",
      message: "Verified self-report required",
    } as PMRecord["scorecard"]["portfolioEstimate"],
  });
  assert.equal(evaluateCriterion(pm, { field: "portfolioSizeBand", operator: "gte", value: 0 }), false);
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

test("managementModel resolves to 'Unknown' when the scorecard carries no managementModel block", () => {
  // makePm()'s base fixture doesn't set managementModel — mirrors a
  // seed predating v0.26 / an operator the resolver couldn't classify.
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "managementModel", operator: "eq", value: "Unknown" }), true);
  assert.equal(evaluateCriterion(pm, { field: "managementModel", operator: "eq", value: "Third-party manager" }), false);
});

test("managementModel resolves the third_party model to its display label", () => {
  const pm = makePm({
    managementModel: {
      model: "third_party",
      confidence: "high",
      basis: "Independent scattered single-family operator — management-for-owners by nature.",
      source: "listing",
    },
  });
  assert.equal(evaluateCriterion(pm, { field: "managementModel", operator: "eq", value: "Third-party manager" }), true);
  assert.equal(evaluateCriterion(pm, { field: "managementModel", operator: "ne", value: "Owner-operator (likely)" }), true);
});

test("managementModel resolves the owner_operator model to its display label, and supports in/notIn", () => {
  const pm = makePm({
    managementModel: {
      model: "owner_operator",
      confidence: "medium",
      basis: "Institutional single-family operator; typically owns its homes (may also manage third-party).",
      source: "listing",
    },
  });
  assert.equal(
    evaluateCriterion(pm, {
      field: "managementModel",
      operator: "in",
      value: ["Owner-operator (likely)", "Unknown"],
    }),
    true
  );
  assert.equal(
    evaluateCriterion(pm, {
      field: "managementModel",
      operator: "notIn",
      value: ["Third-party manager"],
    }),
    true
  );
});

test("boolean fields — claimed / hybrid / institutional", () => {
  const pm = makePm({}, { claimed: true });
  assert.equal(evaluateCriterion(pm, { field: "claimed", operator: "eq", value: true }), true);
  assert.equal(evaluateCriterion(pm, { field: "claimed", operator: "eq", value: false }), false);
  assert.equal(evaluateCriterion(pm, { field: "hybrid", operator: "eq", value: false }), true);
});

test("rentPerformanceYoY reads the market-relative delta, not raw YoY", () => {
  // fixture: rentPerformance.delta = 0.02, pmYoyChange = 0.03. The field must
  // evaluate against delta (market-relative), so a >= 0.03 filter fails even
  // though the raw YoY would clear it.
  const pm = makePm();
  assert.equal(evaluateCriterion(pm, { field: "rentPerformanceYoY", operator: "gte", value: 0.02 }), true);
  assert.equal(evaluateCriterion(pm, { field: "rentPerformanceYoY", operator: "gte", value: 0.03 }), false);
});

test("retention18Pct filter reads tenancy.retention18Pct", () => {
  const pm = makePm(); // fixture retention18Pct = 82
  assert.equal(evaluateCriterion(pm, { field: "retention18Pct", operator: "gte", value: 80 }), true);
  assert.equal(evaluateCriterion(pm, { field: "retention18Pct", operator: "gte", value: 90 }), false);
});

test("retention18Pct fails-by-default when suppressed (null)", () => {
  const pm = makePm();
  pm.scorecard.tenancy.retention18Pct = null; // suppressed operator
  assert.equal(evaluateCriterion(pm, { field: "retention18Pct", operator: "gte", value: 0 }), false);
});

test("marketingScore filter reads marketing.compositeScore", () => {
  const pm = makePm(); // fixture compositeScore = 50
  assert.equal(evaluateCriterion(pm, { field: "marketingScore", operator: "gte", value: 50 }), true);
  assert.equal(evaluateCriterion(pm, { field: "marketingScore", operator: "gte", value: 60 }), false);
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
