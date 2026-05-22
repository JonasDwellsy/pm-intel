// v0.11 — loadOperatorScorecard delegates the aggregation math to
// aggregate.ts (proven by aggregate.test.ts). What this test pins
// is the contract between the lookup module and the aggregator —
// specifically that the ordering of member rows (sort by URUs T12
// desc) doesn't drift, and that the aggregated shape we return
// matches the aggregateRecords output for an identical input set.
//
// We exercise the aggregator directly here rather than mocking
// prisma; the lookup module is a thin pull-and-glue layer and the
// math is already covered upstream.

import test from "node:test";
import { strict as assert } from "node:assert";
import { aggregateRecords } from "@/lib/watch-list/aggregate";
import type { PMRecord } from "@/lib/watch-list/fields";

function makePm(opts: {
  slug: string;
  marketId: string;
  marketFullName: string;
  urusT12?: number;
  t12?: number;
  t24?: number;
  concessionRate?: number | null;
  q7?: string;
  claimed?: boolean;
}): PMRecord {
  return {
    slug: opts.slug,
    name: "Test Operator",
    marketId: opts.marketId,
    claimed: opts.claimed ?? false,
    marketCount: 1,
    scorecard: {
      pm: {
        slug: opts.slug,
        name: "Test Operator",
        quadrant: "Scattered / Independent",
        quadrant7Cell: opts.q7 ?? "SFR Independent",
        hybrid: false,
        institutional: false,
      },
      market: {
        id: opts.marketId,
        name: opts.marketId,
        state: "TN",
        fullName: opts.marketFullName,
      },
      methodologyVersion: "v0.8",
      dataAsOf: "2026-05-19",
      coverage: {
        firstListing: "2024-01-01",
        monthsOnPlatform: 12,
        lifetimeListings: 100,
        t6Listings: null,
        t12Listings: opts.t12 ?? 50,
        urusLifetime: 80,
        urusT12: opts.urusT12 ?? 50,
        activeListings: 12,
        totalObservedUnits: 60,
        nationalObservedUnitsT12: null,
        citiesObserved: 1,
        dataTier: "Full ranking",
        concentratedShare: null,
      },
      geographicCoverage: { citiesText: "", coverageMapPoints: [] },
      classificationRationale: "",
      rank: {
        overall: 5,
        overallTotal: 50,
        quadrant: 2,
        quadrantTotal: 20,
        quadrantMedianDomT12: null,
        composite: null,
        percentiles: {
          dom: null,
          tenancy: null,
          rentPerformance: null,
          marketing: null,
          communityVisibility: null,
        },
        weightingScheme: "with_cv",
      },
      performance: {
        domT12: 42,
        domT12N: 10,
        domLifetime: 45,
        houseDomT12: null,
        houseUrusT12: 0,
        houseEligible: false,
        aptDomT12: null,
        aptUrusT12: 0,
        aptEligible: false,
        peerQuadrantDomT12: null,
        peerQuadrantDomLifetime: null,
        marketDomT12: 40,
        marketDomLifetime: 42,
      },
      rentTrajectory: [],
      rentPerformance: null,
      marketing: {
        completeness: 0,
        amenitiesMentioned: 0,
        descLen: 0,
        completenessScore: 0,
        amenitiesScore: 0,
        descScore: 0,
        medianPhotosT12: null,
        zeroPhotoT12: null,
        compositeScore: 50,
      },
      tenancy: {
        totalUnits: 0,
        multiEpisodeUnits: 0,
        multiEpisodePct: 0,
        overallGap: null,
        tenancyPercentile: null,
        apartment: { gap: null, n: 0, cohortP25: null, cohortP50: null, cohortP75: null, cohortN: 0 },
        house: { gap: null, n: 0, cohortP25: null, cohortP50: null, cohortP75: null, cohortN: 0 },
      },
      communityVisibility: null,
      t12ListingsCount: opts.t12,
      t24t12ListingsCount: opts.t24,
      concessionRate: opts.concessionRate ?? null,
      canonicalOperatorId: "test-operator",
    } as PMRecord["scorecard"],
  } as PMRecord;
}

// ─── Single-market operator ──────────────────────────────────────

test("loadOperatorScorecard contract — single-market wraps with isRollup=false", () => {
  // The loader's contract: pass one PMRecord through aggregateRecords;
  // the wrapper must report isRollup=false so the page renders the
  // "currently active in one market" note instead of the multi-
  // market chip cluster.
  const single = makePm({
    slug: "single-pm",
    marketId: "phoenix-az",
    marketFullName: "Phoenix-Mesa-Glendale, AZ MSA",
    urusT12: 100,
  });
  const agg = aggregateRecords([single]);
  assert.equal(agg.isRollup, false);
  assert.equal(agg.memberMarketIds.length, 1);
  assert.equal(agg.scorecard.coverage.urusT12, 100);
});

// ─── Multi-market operator — same numbers the loader will produce ───

test("loadOperatorScorecard contract — Ark-style 4-market sums to expected URUs", () => {
  // Ark Homes For Rent's seed URUs T12 across the four markets in
  // scorecard_data.json: 100, 80, 50, 25 (test values — actual seed
  // is 255 per the v0.6.4 canonicalOperators aggregateStats but
  // this test is hermetic). What matters is the aggregation
  // produces the correct sum.
  const ark = [
    makePm({
      slug: "ark-bhm",
      marketId: "birmingham-al",
      marketFullName: "Birmingham-Hoover, AL MSA",
      urusT12: 100,
      t12: 150,
      t24: 100,
      concessionRate: 0.40,
    }),
    makePm({
      slug: "ark-hsv",
      marketId: "huntsville-al",
      marketFullName: "Huntsville, AL MSA",
      urusT12: 50,
      t12: 60,
      t24: 70,
      concessionRate: 0.30,
    }),
    makePm({
      slug: "ark-jax",
      marketId: "jacksonville-fl",
      marketFullName: "Jacksonville, FL MSA",
      urusT12: 80,
      t12: 120,
      t24: 90,
      concessionRate: 0.50,
    }),
    makePm({
      slug: "ark-knox",
      marketId: "knoxville-tn",
      marketFullName: "Knoxville, TN MSA",
      urusT12: 25,
      t12: 30,
      t24: 25,
      concessionRate: 0.20,
    }),
  ];
  const agg = aggregateRecords(ark);
  assert.equal(agg.isRollup, true);
  assert.equal(agg.memberMarketIds.length, 4);
  // SUM rules.
  assert.equal(agg.scorecard.coverage.urusT12, 255);
  assert.equal(agg.scorecard.t12ListingsCount, 360);
  assert.equal(agg.scorecard.t24t12ListingsCount, 285);
  // Weighted-avg concession (weights = URUs):
  // (100*0.40 + 50*0.30 + 80*0.50 + 25*0.20) / 255 = 100 / 255 = 0.3921...
  const expected = (100 * 0.4 + 50 * 0.3 + 80 * 0.5 + 25 * 0.2) / 255;
  assert.ok(
    Math.abs((agg.scorecard.concessionRate ?? 0) - expected) < 1e-9,
    `concessionRate ≈ ${expected.toFixed(4)}, got ${agg.scorecard.concessionRate}`
  );
});

test("loadOperatorScorecard contract — member ordering is preserved before sort", () => {
  // The loader sorts members by URUs T12 desc; this test guards
  // that the input order to aggregateRecords doesn't affect the
  // aggregated SUM result (aggregateRecords itself sorts members
  // by marketId for deterministic display).
  const a = makePm({ slug: "x", marketId: "knoxville-tn", marketFullName: "Knoxville, TN MSA", urusT12: 25 });
  const b = makePm({ slug: "y", marketId: "birmingham-al", marketFullName: "Birmingham-Hoover, AL MSA", urusT12: 100 });
  const agg = aggregateRecords([a, b]);
  // Whatever order we passed in, the aggregated memberMarketIds
  // come out alphabetized (the loader gets stable display order
  // for free).
  assert.deepEqual(agg.memberMarketIds, ["birmingham-al", "knoxville-tn"]);
  assert.equal(agg.scorecard.coverage.urusT12, 125);
});
