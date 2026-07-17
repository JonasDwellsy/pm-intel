// Task 5 (v0.27) — pin-union coverage for apply.ts.
//
// applyWatchList itself is DB-bound (prisma.pM.findMany), so it isn't
// unit-testable directly. Everything past the DB read is pure and
// deterministic, so the union step is factored out into
// unionPinnedRecords / unionPinnedOperators and tested here directly,
// same pattern as aggregate.ts's pure helpers in aggregate.test.ts.
//
// ENTITLEMENT SAFETY is the load-bearing property under test: both
// helpers read ONLY from the caller-supplied `allRecords` / `byCanonical`
// — the same collections applyWatchList derives from the
// entitlement-filtered `rows` (see apply.ts's `unionPinnedRecords`/
// `unionPinnedOperators` doc comment for the exact line reference). A
// pinned key for a company with no entitled-market rows is simply never
// present in those collections, so it can never be unioned in — these
// tests simulate that by constructing `allRecords`/`byCanonical` WITHOUT
// the excluded company's rows (exactly what applyWatchList would hand
// these helpers after isMarketEntitled has already run).

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  unionPinnedRecords,
  unionPinnedOperators,
  type RankedTarget,
  type RolledUpTarget,
} from "./apply";
import { groupByCanonical } from "./aggregate";
import type { PMRecord } from "./fields";
import type { WatchListDefinition } from "./scoring";

// ─── fixtures ──────────────────────────────────────────────────────

function makePm(overrides: {
  slug: string;
  marketId: string;
  canonicalOperatorId?: string;
  urusT12?: number;
  name?: string;
}): PMRecord {
  return {
    slug: overrides.slug,
    name: overrides.name ?? "Test Operator",
    marketId: overrides.marketId,
    claimed: false,
    marketCount: 1,
    scorecard: {
      pm: {
        slug: overrides.slug,
        name: overrides.name ?? "Test Operator",
        quadrant: "Scattered / Independent",
        quadrant7Cell: "SFR Independent",
        hybrid: false,
        institutional: false,
      },
      market: {
        id: overrides.marketId,
        name: overrides.marketId,
        state: "TN",
        fullName: overrides.marketId,
      },
      methodologyVersion: "v0.8",
      dataAsOf: "2026-05-19",
      coverage: {
        firstListing: "2024-01-01",
        monthsOnPlatform: 12,
        lifetimeListings: 100,
        t6Listings: null,
        t12Listings: 50,
        urusLifetime: 80,
        urusT12: overrides.urusT12 ?? 50,
        activeListings: 12,
        totalObservedUnits: 60,
        nationalObservedUnitsT12: null,
        citiesObserved: 1,
        dataTier: "Full ranking",
        concentratedShare: null,
      },
      geographicCoverage: { citiesText: "", topCities: undefined, coverageMapPoints: [] },
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
      rentPerformance: {
        pmYoyChange: 0.03,
        cohortMedianYoyChange: 0.025,
        delta: 0.005,
        percentileRank: 50,
        state: "neutral",
      },
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
        tenancyPercentile: null,
        apartment: { gap: null, n: 0, cohortP25: null, cohortP50: null, cohortP75: null, cohortN: 0 },
        house: { gap: null, n: 0, cohortP25: null, cohortP50: null, cohortP75: null, cohortN: 0 },
      },
      communityVisibility: null,
      portfolioEstimate: { status: "estimated", point: 100, low: 75, high: 125, confidence: "Medium" },
      t12ListingsCount: 50,
      t24t12ListingsCount: 45,
      concessionRate: null,
      canonicalOperatorId: overrides.canonicalOperatorId,
    } as PMRecord["scorecard"],
  } as PMRecord;
}

function makeWatchList(overrides: Partial<WatchListDefinition> = {}): WatchListDefinition {
  return {
    id: "test-watchlist",
    name: "Test watch list",
    requiredCriteria: [],
    preferredCriteria: [],
    excludedCriteria: [],
    ...overrides,
  };
}

const noMarketNames = new Map<string, string>();
const noCanonicalNames = new Map<string, string>();

// ─── unionPinnedRecords (Market view) ──────────────────────────────

test("unionPinnedRecords — forces an otherwise-failing PM in, flagged pinned with a sentinel fitScore", () => {
  const pm = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme", urusT12: 10 });
  const bb = makeWatchList({
    requiredCriteria: [{ field: "urusT12", operator: "gte", value: 1000 }], // fails — 10 < 1000
  });
  const pinnedKeys = new Set(["acme"]);
  const result = unionPinnedRecords([], [pm], pinnedKeys, bb, noMarketNames);
  assert.equal(result.length, 1);
  assert.equal(result[0].pinned, true);
  assert.equal(result[0].fitScore, 0); // sentinel — evaluation.fitScore was null
  assert.equal(result[0].pmSlug, "acme-bhm");
  assert.equal(result[0].breakdown.excludedBy?.field, "urusT12");
});

test("unionPinnedRecords — a pinned key absent from allRecords never appears (entitlement-filtered-out case)", () => {
  // Simulates a company whose only market row was dropped by
  // isMarketEntitled before applyWatchList ever built allRecords —
  // the pinned key here has NO corresponding record at all.
  const other = makePm({ slug: "other-op", marketId: "knoxville-tn", canonicalOperatorId: "other" });
  const pinnedKeys = new Set(["ghost-operator-not-entitled"]);
  const result = unionPinnedRecords([], [other], pinnedKeys, makeWatchList(), noMarketNames);
  assert.equal(result.length, 0);
});

test("unionPinnedRecords — doesn't duplicate a PM that already matched naturally", () => {
  const pm = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme", urusT12: 500 });
  const matched: RankedTarget[] = [
    {
      pmSlug: "acme-bhm",
      name: "Acme",
      marketId: "birmingham-al",
      marketName: "Birmingham-Hoover, AL MSA",
      canonicalOperatorId: "acme",
      fitScore: 100,
      breakdown: { required: [], preferred: [], excluded: [], excludedBy: null },
      pm,
    },
  ];
  const pinnedKeys = new Set(["acme"]);
  const result = unionPinnedRecords(matched, [pm], pinnedKeys, makeWatchList(), noMarketNames);
  assert.equal(result.length, 1); // no duplicate row
  assert.equal(result[0].pinned, undefined); // the naturally-matched row is untouched
});

test("unionPinnedRecords — a pinned multi-market operator only adds the sibling market that didn't already match", () => {
  const bhm = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme", urusT12: 500 });
  const jax = makePm({ slug: "acme-jax", marketId: "jacksonville-fl", canonicalOperatorId: "acme", urusT12: 5 });
  const bb = makeWatchList({
    requiredCriteria: [{ field: "urusT12", operator: "gte", value: 100 }], // bhm passes, jax fails
  });
  const matchedRaw: RankedTarget[] = [
    {
      pmSlug: "acme-bhm",
      name: "Acme",
      marketId: "birmingham-al",
      marketName: "birmingham-al",
      canonicalOperatorId: "acme",
      fitScore: 100,
      breakdown: { required: [{ field: "urusT12", operator: "gte", passed: true }], preferred: [], excluded: [], excludedBy: null },
      pm: bhm,
    },
  ];
  const pinnedKeys = new Set(["acme"]);
  const result = unionPinnedRecords(matchedRaw, [bhm, jax], pinnedKeys, bb, noMarketNames);
  assert.equal(result.length, 2);
  const jaxRow = result.find((r) => r.pmSlug === "acme-jax");
  assert.ok(jaxRow);
  assert.equal(jaxRow?.pinned, true);
  assert.equal(jaxRow?.fitScore, 0);
  const bhmRow = result.find((r) => r.pmSlug === "acme-bhm");
  assert.equal(bhmRow?.pinned, undefined); // naturally matched, not flagged
});

// ─── unionPinnedOperators (Operator view) ──────────────────────────

test("unionPinnedOperators — forces an otherwise-failing multi-market rollup in, flagged pinned", () => {
  const a = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme", urusT12: 50 });
  const b = makePm({ slug: "acme-jax", marketId: "jacksonville-fl", canonicalOperatorId: "acme", urusT12: 40 });
  const byCanonical = groupByCanonical([a, b]); // aggregated urusT12 = 90
  const bb = makeWatchList({
    requiredCriteria: [{ field: "urusT12", operator: "gte", value: 1000 }], // fails even aggregated (90 < 1000)
  });
  const pinnedKeys = new Set(["acme"]);
  const result = unionPinnedOperators([], byCanonical, pinnedKeys, bb, noMarketNames, noCanonicalNames);
  assert.equal(result.length, 1);
  assert.equal(result[0].pinned, true);
  assert.equal(result[0].fitScore, 0);
  assert.equal(result[0].isRollup, true);
  assert.equal(result[0].memberMarketIds.length, 2);
});

test("unionPinnedOperators — a pinned key with no bucket (entitlement-filtered out) never appears", () => {
  const other = makePm({ slug: "other-op", marketId: "knoxville-tn", canonicalOperatorId: "other" });
  const byCanonical = groupByCanonical([other]); // no "ghost-operator" bucket at all
  const pinnedKeys = new Set(["ghost-operator-not-entitled"]);
  const result = unionPinnedOperators([], byCanonical, pinnedKeys, makeWatchList(), noMarketNames, noCanonicalNames);
  assert.equal(result.length, 0);
});

test("unionPinnedOperators — doesn't duplicate an operator that already matched naturally", () => {
  const a = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme", urusT12: 500 });
  const byCanonical = groupByCanonical([a]);
  const matchedOperators: RolledUpTarget[] = [
    {
      canonicalOperatorId: "acme",
      canonicalOperatorName: "Acme",
      memberMarketIds: ["birmingham-al"],
      memberMarketNames: ["Birmingham-Hoover, AL MSA"],
      memberPmSlugs: ["acme-bhm"],
      isRollup: false,
      quadrant7CellIsMixed: false,
      fitScore: 100,
      breakdown: { required: [], preferred: [], excluded: [], excludedBy: null },
      pm: {
        ...a,
        isRollup: false,
        memberMarketIds: ["birmingham-al"],
        memberMarketNames: ["birmingham-al"],
        memberPmSlugs: ["acme-bhm"],
        quadrant7CellIsMixed: false,
        members: [a],
      },
    },
  ];
  const pinnedKeys = new Set(["acme"]);
  const result = unionPinnedOperators(matchedOperators, byCanonical, pinnedKeys, makeWatchList(), noMarketNames, noCanonicalNames);
  assert.equal(result.length, 1);
  assert.equal(result[0].pinned, undefined);
});

test("unionPinnedRecords / unionPinnedOperators — empty pinnedKeys is a no-op (returns the same reference)", () => {
  const pm = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme" });
  const matched: RankedTarget[] = [];
  const byCanonical = groupByCanonical([pm]);
  assert.equal(unionPinnedRecords(matched, [pm], new Set(), makeWatchList(), noMarketNames), matched);
  const matchedOperators: RolledUpTarget[] = [];
  assert.equal(
    unionPinnedOperators(matchedOperators, byCanonical, new Set(), makeWatchList(), noMarketNames, noCanonicalNames),
    matchedOperators
  );
});
