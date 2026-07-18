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
  computeCriteriaMatchedRecords,
  computeCriteriaMatchedOperators,
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
  assert.ok(!result[0].matched); // pin-only add — "Pinned", not "Pinned + matches"
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

test("unionPinnedRecords — flags the already-matched PM pinned:true (Pinned + matches), no duplicate row", () => {
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
  assert.equal(result[0].pinned, true); // the naturally-matched row now flips pinned:true (overlap)
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
  assert.equal(bhmRow?.pinned, true); // naturally matched AND pinned (same key "acme") — flips to Pinned + matches
});

test("unionPinnedRecords — hybrid overlap: a pinned key that's also a criteria match yields ONE row, matched:true AND pinned:true, not re-scored to the sentinel", () => {
  const pm = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme", urusT12: 500 });
  const matched: RankedTarget[] = [
    {
      pmSlug: "acme-bhm",
      name: "Acme",
      marketId: "birmingham-al",
      marketName: "Birmingham-Hoover, AL MSA",
      canonicalOperatorId: "acme",
      fitScore: 87,
      breakdown: { required: [{ field: "urusT12", operator: "gte", passed: true }], preferred: [], excluded: [], excludedBy: null },
      pm,
      matched: true,
    },
  ];
  const pinnedKeys = new Set(["acme"]);
  const result = unionPinnedRecords(matched, [pm], pinnedKeys, makeWatchList(), noMarketNames);
  assert.equal(result.length, 1); // no duplicate row
  assert.equal(result[0].pinned, true);
  assert.equal(result[0].matched, true);
  // Preserved from the original matched row — NOT re-scored to sentinel 0.
  assert.equal(result[0].fitScore, 87);
  assert.equal(result[0].breakdown.required[0]?.passed, true);
  assert.equal(result[0].pm, pm);
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

test("unionPinnedOperators — flags the already-matched operator pinned:true (Pinned + matches), no duplicate row", () => {
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
  assert.equal(result.length, 1); // no duplicate row
  assert.equal(result[0].pinned, true); // the naturally-matched row now flips pinned:true (overlap)
});

test("unionPinnedOperators — hybrid overlap: a pinned canonicalOperatorId that's also a criteria match yields ONE row, matched:true AND pinned:true, not re-scored to the sentinel", () => {
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
      fitScore: 87,
      breakdown: { required: [{ field: "urusT12", operator: "gte", passed: true }], preferred: [], excluded: [], excludedBy: null },
      pm: {
        ...a,
        isRollup: false,
        memberMarketIds: ["birmingham-al"],
        memberMarketNames: ["birmingham-al"],
        memberPmSlugs: ["acme-bhm"],
        quadrant7CellIsMixed: false,
        members: [a],
      },
      matched: true,
    },
  ];
  const pinnedKeys = new Set(["acme"]);
  const result = unionPinnedOperators(matchedOperators, byCanonical, pinnedKeys, makeWatchList(), noMarketNames, noCanonicalNames);
  assert.equal(result.length, 1); // no duplicate row
  assert.equal(result[0].pinned, true);
  assert.equal(result[0].matched, true);
  // Preserved from the original matched row — NOT re-aggregated/re-scored to sentinel 0.
  assert.equal(result[0].fitScore, 87);
  assert.equal(result[0].breakdown.required[0]?.passed, true);
  assert.equal(result[0].pm, matchedOperators[0].pm);
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

// ─── computeCriteriaMatchedRecords / computeCriteriaMatchedOperators
//     (Task 7 — the "pick list" skipCriteriaMatch gate) ──────────────
//
// A `kind: "pinned"` pick list's requiredCriteria/preferredCriteria/
// excludedCriteria are empty by convention (there's no criteria UI for
// it). An empty criteria set trivially PASSES every operator (scoring.ts:
// no required to fail, no excluded to veto, fitScore defaults to 100
// with no preferred weights). Left unguarded, that means every operator
// in the universe would show up as "naturally matched" for a pick list —
// which in turn means unionPinnedRecords/unionPinnedOperators (which now
// flip `pinned: true` on any already-present row whose key overlaps a
// pinned key) would flip `pinned: true` on EVERY row in the universe,
// not just the ones the user actually pinned, silently breaking
// the entire feature for its primary use case. These tests pin down the
// gate itself, then a composed scenario proving the full pipeline
// (compute → union) now does the right thing — and, for contrast, what
// happens if the gate is ever removed.

test("computeCriteriaMatchedRecords — skipCriteriaMatch true returns [] even though the record would naturally pass", () => {
  const pm = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme" });
  const result = computeCriteriaMatchedRecords([pm], makeWatchList(), noMarketNames, true);
  assert.deepEqual(result, []);
});

test("computeCriteriaMatchedRecords — skipCriteriaMatch false preserves the pre-existing natural-match behavior", () => {
  const pm = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme", urusT12: 500 });
  const bb = makeWatchList({ requiredCriteria: [{ field: "urusT12", operator: "gte", value: 100 }] });
  const result = computeCriteriaMatchedRecords([pm], bb, noMarketNames, false);
  assert.equal(result.length, 1);
  assert.equal(result[0].pmSlug, "acme-bhm");
  assert.equal(result[0].pinned, undefined);
  assert.equal(result[0].matched, true);
});

test("computeCriteriaMatchedOperators — skipCriteriaMatch true returns [] even though the rollup would naturally pass", () => {
  const pm = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme" });
  const byCanonical = groupByCanonical([pm]);
  const result = computeCriteriaMatchedOperators(
    byCanonical,
    makeWatchList(),
    noMarketNames,
    noCanonicalNames,
    true
  );
  assert.deepEqual(result, []);
});

test("computeCriteriaMatchedOperators — skipCriteriaMatch false preserves the pre-existing natural-match behavior", () => {
  const pm = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme", urusT12: 500 });
  const byCanonical = groupByCanonical([pm]);
  const bb = makeWatchList({ requiredCriteria: [{ field: "urusT12", operator: "gte", value: 100 }] });
  const result = computeCriteriaMatchedOperators(byCanonical, bb, noMarketNames, noCanonicalNames, false);
  assert.equal(result.length, 1);
  assert.equal(result[0].canonicalOperatorId, "acme");
  assert.equal(result[0].matched, true);
});

test("a kind:'pinned' pick list (blank criteria + skipCriteriaMatch) surfaces ONLY the pinned company, flagged pinned:true — both views", () => {
  // Two operators exist in the universe; only "acme" is pinned. A
  // blank watch list is exactly what the "New pick list" / AddToWatchList
  // create flow persists (kind: "pinned", empty criteria arrays).
  const pinnedPm = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme" });
  const otherPm = makePm({ slug: "other-op", marketId: "knoxville-tn", canonicalOperatorId: "other" });
  const blank = makeWatchList();
  const pinnedKeys = new Set(["acme"]);

  // Per-market (Market view) — mirrors applyWatchList's own pipeline.
  const matchedRaw = computeCriteriaMatchedRecords(
    [pinnedPm, otherPm],
    blank,
    noMarketNames,
    true
  );
  assert.deepEqual(matchedRaw, []);
  const marketResult = unionPinnedRecords(
    matchedRaw,
    [pinnedPm, otherPm],
    pinnedKeys,
    blank,
    noMarketNames
  );
  assert.equal(marketResult.length, 1);
  assert.equal(marketResult[0].pmSlug, "acme-bhm");
  assert.equal(marketResult[0].pinned, true);

  // Per-operator (Operator view).
  const byCanonical = groupByCanonical([pinnedPm, otherPm]);
  const matchedOperatorsRaw = computeCriteriaMatchedOperators(
    byCanonical,
    blank,
    noMarketNames,
    noCanonicalNames,
    true
  );
  assert.deepEqual(matchedOperatorsRaw, []);
  const operatorResult = unionPinnedOperators(
    matchedOperatorsRaw,
    byCanonical,
    pinnedKeys,
    blank,
    noMarketNames,
    noCanonicalNames
  );
  assert.equal(operatorResult.length, 1);
  assert.equal(operatorResult[0].canonicalOperatorId, "acme");
  assert.equal(operatorResult[0].pinned, true);
});

test("documents the bug the gate fixes: without skipCriteriaMatch, a blank watch list wrongly matches the entire universe, not just the pinned company", () => {
  // Same fixtures as above but skipCriteriaMatch=false — every
  // applyWatchList call site had exactly this shape before Task 7.
  // Both operators pass naturally (empty criteria). Under the current
  // mark-overlap union logic, the pinned "acme" row's `pinned` flips to
  // true regardless of the gate (Pinned + matches) — but the un-pinned
  // "other-op" row is ALSO present as "matched" purely because the
  // criteria are blank, which is exactly the bug the gate exists to
  // prevent: a pick list's surfaced set should be the pinned company
  // alone, not the entire operator universe. This test exists so a
  // future revert of the gate fails loudly.
  const pinnedPm = makePm({ slug: "acme-bhm", marketId: "birmingham-al", canonicalOperatorId: "acme" });
  const otherPm = makePm({ slug: "other-op", marketId: "knoxville-tn", canonicalOperatorId: "other" });
  const blank = makeWatchList();
  const pinnedKeys = new Set(["acme"]);

  const matchedRaw = computeCriteriaMatchedRecords(
    [pinnedPm, otherPm],
    blank,
    noMarketNames,
    false
  );
  assert.equal(matchedRaw.length, 2); // both "matched" — the bug this gate fixes
  const result = unionPinnedRecords(
    matchedRaw,
    [pinnedPm, otherPm],
    pinnedKeys,
    blank,
    noMarketNames
  );
  assert.equal(result.length, 2); // no addition — "acme" overlaps, "other-op" already present
  const acmeRow = result.find((r) => r.pmSlug === "acme-bhm");
  assert.equal(acmeRow?.pinned, true); // overlap flip fires regardless of the gate
  const otherRow = result.find((r) => r.pmSlug === "other-op");
  assert.ok(otherRow); // present regardless — guards the assertion below against a silent miss
  assert.equal(otherRow?.pinned, undefined); // not pinned — yet still wrongly surfaced as "matched" without the gate
});
