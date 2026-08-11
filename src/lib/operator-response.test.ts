import assert from "node:assert/strict";
import test from "node:test";
import type { ScorecardData } from "@/lib/types";
import {
  buildOperatorResponseContext,
  normalizedOperatorName,
  selectExactOperatorCandidate,
  type OperatorResponseCandidate,
} from "@/lib/dwellsy-iq/operator-response";

function candidate(overrides: Partial<OperatorResponseCandidate> = {}): OperatorResponseCandidate {
  const scorecard = {
    methodologyVersion: "v0.7",
    dataAsOf: "2026-07-31",
    pm: { slug: "950-management", name: "950 Management", quadrant: "MF/BTR / Independent", quadrant7Cell: "Small MF/BTR Independent", hybrid: false },
    rank: { overall: 7, overallTotal: 42, quadrant: 3, quadrantTotal: 12, quadrantMedianDomT12: 28, composite: 0.7, percentiles: { dom: 75, tenancy: 50, rentPerformance: 60, marketing: 40, communityVisibility: 50 }, weightingScheme: "with_cv" },
    coverage: { firstListing: "2022-01-01", monthsOnPlatform: 48, lifetimeListings: 200, t6Listings: 50, t12Listings: 88, urusLifetime: 150, urusT12: 61, activeListings: 12, totalObservedUnits: 100, nationalObservedUnitsT12: null, citiesObserved: 3, dataTier: "Full ranking", concentratedShare: null },
    performance: { domT12: 21, domT12N: 60, domLifetime: 24, houseDomT12: null, houseUrusT12: 0, houseEligible: false, aptDomT12: 21, aptUrusT12: 61, aptEligible: true, peerQuadrantDomT12: 27, peerQuadrantDomLifetime: 28, marketDomT12: 30, marketDomLifetime: 31, domStar: "gold" },
    rentTrajectory: [],
    rentPerformance: { pmYoyChange: 0.04, cohortMedianYoyChange: 0.02, delta: 0.02, percentileRank: 70, state: "positive", star: "silver" },
    marketing: { completeness: 0.8, amenitiesMentioned: 4, descLen: 300, completenessScore: 0.8, amenitiesScore: 0.7, descScore: 0.8, medianPhotosT12: 12, zeroPhotoT12: 0, compositeScore: 0.78, star: null },
    tenancy: { totalUnits: 0, multiEpisodeUnits: 0, multiEpisodePct: 0, tenancyPercentile: null, apartment: {}, house: {} },
  } as unknown as ScorecardData;
  return {
    slug: "950-management-cleveland-oh",
    name: "950 Management",
    canonicalOperatorId: "950-management",
    canonicalOperatorName: "950 Management",
    marketId: "cleveland-elyria-mentor-oh",
    scorecard,
    market: { city: "Cleveland", state: "OH" },
    ...overrides,
  };
}

test("operator response normalization ignores punctuation and legal suffixes only", () => {
  assert.equal(normalizedOperatorName(" 950 Management, LLC "), "950 management");
  assert.equal(normalizedOperatorName("Harsax Management Limited Partnership"), normalizedOperatorName("Harsax Management"));
  assert.notEqual(normalizedOperatorName("CLE Turnkey Real Estate"), normalizedOperatorName("Turnkey Real Estate"));
});

test("exact observed name resolves one Operator IQ identity", () => {
  const selected = selectExactOperatorCandidate("950 Management", [candidate()]);
  assert.equal(selected.status, "matched");
});

test("conflicting exact identities remain ambiguous", () => {
  const selected = selectExactOperatorCandidate("950 Management", [
    candidate(),
    candidate({ slug: "different-950", canonicalOperatorId: "different-950" }),
  ]);
  assert.equal(selected.status, "ambiguous");
});

test("matched operator context exposes owner-relevant evidence and full scorecard link", () => {
  const context = buildOperatorResponseContext({
    observedOperatorName: "950 Management",
    verificationStatus: "observed",
    candidates: [candidate()],
  });
  assert.equal(context.status, "matched");
  assert.equal(context.scorecardHref, "/property-managers/ohio/cleveland/950-management-cleveland-oh");
  assert.equal(context.overallRank, 7);
  assert.equal(context.leaseUpDom, 21);
  assert.equal(context.goldCount, 1);
  assert.equal(context.silverCount, 1);
  assert.equal(context.liveResponseAvailable, false);
});

test("unmatched operator context never fabricates benchmark metrics", () => {
  const context = buildOperatorResponseContext({ observedOperatorName: "Unknown Operator", verificationStatus: "observed", candidates: [candidate()] });
  assert.equal(context.status, "unmatched");
  assert.equal(context.scorecardHref, null);
  assert.equal(context.overallRank, null);
  assert.equal(context.leaseUpDom, null);
});
