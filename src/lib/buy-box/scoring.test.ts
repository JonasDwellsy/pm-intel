// Scoring engine coverage. Exercises the three-layer waterfall
// (excluded → required → preferred-weighted) and the breakdown
// payload that powers the future "why did this operator score X?"
// tooltip.

import test from "node:test";
import { strict as assert } from "node:assert";
import { evaluateBuyBox, type BuyBoxDefinition } from "./scoring";
import type { PMRecord } from "./fields";

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
      portfolioEstimate: { status: "estimated", point: 800, low: 550, high: 1050, cohort: "SFR Independent, URUs <100", cohortN: 12, confidence: "Low" },
      t12ListingsCount: 47,
      t24t12ListingsCount: 38,
      concessionRate: 0.08,
      canonicalOperatorId: "test-pm",
      ...overrides,
    },
    ...top,
  } as PMRecord;
}

function makeBuyBox(overrides: Partial<BuyBoxDefinition> = {}): BuyBoxDefinition {
  return {
    id: "test-buybox",
    name: "Test buy box",
    requiredCriteria: [],
    preferredCriteria: [],
    excludedCriteria: [],
    ...overrides,
  };
}

test("PM that passes all required + has no excluded scores 100 with empty preferred", () => {
  const pm = makePm();
  const bb = makeBuyBox({
    requiredCriteria: [{ field: "quadrant7Cell", operator: "eq", value: "SFR Independent" }],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.passed, true);
  assert.equal(result.fitScore, 100);
});

test("excluded match vetoes — returns null fitScore + breakdown.excludedBy.layer=excluded", () => {
  const pm = makePm({}, { name: "Pure Property Management" });
  const bb = makeBuyBox({
    requiredCriteria: [{ field: "quadrant7Cell", operator: "eq", value: "SFR Independent" }],
    excludedCriteria: [{ field: "name", operator: "contains", value: "Pure" }],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.passed, false);
  assert.equal(result.fitScore, null);
  assert.equal(result.breakdown.excludedBy?.layer, "excluded");
  assert.equal(result.breakdown.excludedBy?.field, "name");
});

test("required miss vetoes — returns null fitScore + breakdown.excludedBy.layer=required", () => {
  const pm = makePm();
  const bb = makeBuyBox({
    requiredCriteria: [
      { field: "quadrant7Cell", operator: "eq", value: "SFR Independent" }, // passes
      { field: "estimatedPortfolioPoint", operator: "gte", value: 5000 }, // fails (point is 800)
    ],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.passed, false);
  assert.equal(result.fitScore, null);
  assert.equal(result.breakdown.excludedBy?.layer, "required");
  assert.equal(result.breakdown.excludedBy?.field, "estimatedPortfolioPoint");
});

test("preferred-only buy box — fit score weighted by hit count", () => {
  // Two preferred criteria. Set weights so we can hand-compute the
  // expected score regardless of normalization. Weights are 0.6 + 0.4
  // = 1.0 total; the first passes, the second fails. Expected:
  //   weightedHits = 0.6 * 100 + 0.4 * 0 = 60
  //   fitScore     = 60 / 1.0 = 60
  const pm = makePm();
  const bb = makeBuyBox({
    preferredCriteria: [
      { field: "listingTrajectoryYoY", operator: "gte", value: 0, weight: 0.6 }, // passes (47 > 38)
      { field: "concessionRate", operator: "lte", value: 0.05, weight: 0.4 }, // fails (0.08 > 0.05)
    ],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.passed, true);
  assert.equal(result.fitScore, 60);
});

test("preferred weights are normalized — absolute values don't matter", () => {
  // Same hit pattern (first passes, second fails) but weights expressed
  // as 30 / 20 (un-normalized). The normalization divides by total
  // weight, so the answer is identical to 0.6 / 0.4.
  const pm = makePm();
  const bb = makeBuyBox({
    preferredCriteria: [
      { field: "listingTrajectoryYoY", operator: "gte", value: 0, weight: 30 },
      { field: "concessionRate", operator: "lte", value: 0.05, weight: 20 },
    ],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.fitScore, 60);
});

test("all preferred pass → fit score 100", () => {
  const pm = makePm();
  const bb = makeBuyBox({
    preferredCriteria: [
      { field: "listingTrajectoryYoY", operator: "gte", value: 0, weight: 0.5 },
      { field: "concessionRate", operator: "lte", value: 0.1, weight: 0.5 },
    ],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.fitScore, 100);
});

test("all preferred fail → fit score 0", () => {
  const pm = makePm();
  const bb = makeBuyBox({
    preferredCriteria: [
      { field: "listingTrajectoryYoY", operator: "gte", value: 10, weight: 0.5 },
      { field: "concessionRate", operator: "lte", value: 0, weight: 0.5 },
    ],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.fitScore, 0);
});

test("empty preferred list → fit score 100 (no preferences to differentiate)", () => {
  const pm = makePm();
  const bb = makeBuyBox({ requiredCriteria: [{ field: "quadrant7Cell", operator: "eq", value: "SFR Independent" }] });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.fitScore, 100);
});

test("all weights zero → divide-by-zero guard returns 100", () => {
  const pm = makePm();
  const bb = makeBuyBox({
    preferredCriteria: [
      { field: "listingTrajectoryYoY", operator: "gte", value: 0, weight: 0 },
      { field: "concessionRate", operator: "lte", value: 0.05, weight: 0 },
    ],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.fitScore, 100);
});

test("breakdown payload — preferred entries record per-criterion contribution", () => {
  const pm = makePm();
  const bb = makeBuyBox({
    preferredCriteria: [
      { field: "listingTrajectoryYoY", operator: "gte", value: 0, weight: 0.5 },
      { field: "concessionRate", operator: "lte", value: 0.05, weight: 0.5 },
    ],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.breakdown.preferred.length, 2);
  assert.equal(result.breakdown.preferred[0].passed, true);
  assert.equal(result.breakdown.preferred[0].contribution, 50);
  assert.equal(result.breakdown.preferred[1].passed, false);
  assert.equal(result.breakdown.preferred[1].contribution, 0);
});

test("breakdown still records all required entries even after excluded veto", () => {
  // Excluded match should short-circuit but the breakdown should still
  // record the excluded entry so the UI can show why. Required entries
  // are not evaluated after an excluded match.
  const pm = makePm({}, { name: "Pure Property Management" });
  const bb = makeBuyBox({
    requiredCriteria: [{ field: "quadrant7Cell", operator: "eq", value: "SFR Independent" }],
    excludedCriteria: [{ field: "name", operator: "contains", value: "Pure" }],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.breakdown.excluded.length, 1);
  assert.equal(result.breakdown.excluded[0].passed, true);
  assert.equal(result.breakdown.required.length, 0); // short-circuited
});

test("incomplete required criterion is skipped — does NOT veto the PM", () => {
  // Issue 5: adding a fresh "+ Add criterion" row in the editor must
  // not drop the match count to 0 while the user is still configuring
  // the value. The blank row carries an empty string value and should
  // be ignored end-to-end.
  const pm = makePm();
  const bb = makeBuyBox({
    requiredCriteria: [
      { field: "quadrant7Cell", operator: "eq", value: "SFR Independent" }, // complete + passes
      { field: "estimatedPortfolioPoint", operator: "gte", value: "" as unknown as number }, // incomplete
    ],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.passed, true);
  assert.equal(result.fitScore, 100);
  assert.equal(result.breakdown.required.length, 1); // incomplete one skipped
});

test("incomplete excluded criterion is skipped — does NOT veto", () => {
  const pm = makePm({}, { name: "Pure Property Management" });
  const bb = makeBuyBox({
    requiredCriteria: [{ field: "quadrant7Cell", operator: "eq", value: "SFR Independent" }],
    excludedCriteria: [
      { field: "name", operator: "contains", value: "" }, // incomplete — empty string
    ],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.passed, true);
  assert.equal(result.breakdown.excluded.length, 0);
});

test("incomplete preferred criterion is skipped — doesn't affect score", () => {
  // One complete (passes) + one incomplete. Without the skip the
  // denominator would include the incomplete weight, dropping the
  // score. With the skip, the score is 100 (the lone complete
  // criterion passed and accounts for 100% of the total weight).
  const pm = makePm();
  const bb = makeBuyBox({
    preferredCriteria: [
      { field: "listingTrajectoryYoY", operator: "gte", value: 0, weight: 0.5 },
      {
        field: "concessionRate",
        operator: "between",
        value: [0, 0.05] as [number, number],
        weight: 0.5,
      },
      {
        // incomplete — between requires two finite numbers
        field: "urusT12",
        operator: "between",
        value: [] as unknown as [number, number],
        weight: 0.5,
      },
    ],
  });
  const result = evaluateBuyBox(pm, bb);
  assert.equal(result.passed, true);
  assert.equal(result.breakdown.preferred.length, 2);
});
