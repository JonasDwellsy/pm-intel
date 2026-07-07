// Regression coverage for Task 7 of the survival-based tenancy metric:
// peer-comparison's tenancy ranking must read retention18Pct (18-month
// survival retention), not the retired overallGap field.

import test from "node:test";
import { strict as assert } from "node:assert";
import { buildPeerComparisons } from "./peer-comparison";
import type { PoolPm } from "./msa-pool";
import type { ScorecardData } from "./types";

function mkScorecard(
  slug: string,
  overrides: { retention18Pct?: number | null; overallGap?: number | null }
): ScorecardData {
  return {
    pm: { slug, name: slug, quadrant: "scattered-independent", quadrant7Cell: "SFR Independent", hybrid: false, institutional: false },
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
    tenancy: {
      totalUnits: 40,
      multiEpisodeUnits: 16,
      multiEpisodePct: 0.4,
      overallGap: overrides.overallGap ?? null,
      tenancyPercentile: null,
      apartment: { units: 20, multiEpisodeUnits: 8, gap: null },
      house: { units: 20, multiEpisodeUnits: 8, gap: null },
      retention18Pct: overrides.retention18Pct ?? null,
    },
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
    canonicalOperatorId: slug,
  } as unknown as ScorecardData;
}

function mkPm(slug: string, overrides: { retention18Pct?: number | null; overallGap?: number | null }): PoolPm {
  const scorecard = mkScorecard(slug, overrides);
  return {
    slug,
    name: slug,
    quadrant7Cell: "SFR Independent",
    href: `/property-managers/az/phoenix/${slug}`,
    scorecard,
  };
}

// 10+ members so the primary cohort clears the N≥10 threshold and the
// comparison doesn't fall through to fallback/MSA.
function fillerPms(count: number): PoolPm[] {
  return Array.from({ length: count }, (_, i) =>
    mkPm(`filler-${i}`, { retention18Pct: 50 })
  );
}

test("peer comparison ranks tenancy on retention18Pct, not overallGap", () => {
  // "a" has lower overallGap (would rank worse under the old metric)
  // but higher retention18Pct (should rank better under the new one).
  const a = mkPm("a", { retention18Pct: 80, overallGap: 5 });
  const b = mkPm("b", { retention18Pct: 40, overallGap: 20 });
  const pool = [a, b, ...fillerPms(9)];

  const comparisons = buildPeerComparisons(a.scorecard, pool);
  const tenancy = comparisons.tenancy;
  assert.ok(tenancy, "tenancy comparison should be present");
  assert.equal(tenancy!.focalValue, 80);

  const comparisonsB = buildPeerComparisons(b.scorecard, pool);
  assert.equal(comparisonsB.tenancy!.focalValue, 40);
});

test("members with null retention18Pct are skipped from the tenancy cohort", () => {
  const focal = mkPm("focal", { retention18Pct: 60 });
  const noRetention = mkPm("no-retention", { retention18Pct: null });
  const pool = [focal, noRetention, ...fillerPms(9)];

  const comparisons = buildPeerComparisons(focal.scorecard, pool);
  const tenancy = comparisons.tenancy;
  assert.ok(tenancy);
  assert.ok(
    !tenancy!.rows.some((r) => r.slug === "no-retention"),
    "operator with null retention18Pct must not appear in the tenancy cohort"
  );
});
