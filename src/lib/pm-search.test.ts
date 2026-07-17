import test from "node:test";
import { strict as assert } from "node:assert";
import {
  partitionByTier,
  filterResultsByEntitlement,
  type PMSearchResult,
} from "./pm-search";

// Fabricated result objects — these tests exercise the pure partition /
// filter functions in isolation and deliberately do NOT depend on the
// real src/data/search_index.json corpus, so they hold regardless of
// which markets/operators are seeded at any given time.

const marketResult: PMSearchResult = {
  tier: "market",
  name: "Chattanooga, TN",
  marketId: "chattanooga-tn",
  marketCity: "Chattanooga",
  stateCode: "TN",
  stateSlug: "tennessee",
  citySlug: "chattanooga",
  operatorCount: 40,
  aliases: ["Chattanooga, TN-GA MSA", "Chattanooga", "tennessee"],
  href: "/property-managers/tennessee/chattanooga",
  score: 0.02,
};

const rankedResult: PMSearchResult = {
  tier: "ranked",
  name: "Auben Realty - Chattanooga",
  slug: "auben-realty-chattanooga-chattanooga-tn",
  marketId: "chattanooga-tn",
  marketCity: "Chattanooga",
  stateCode: "TN",
  stateSlug: "tennessee",
  citySlug: "chattanooga",
  goldCount: 1,
  silverCount: 2,
  t12Listings: 178,
  href: "/property-managers/tennessee/chattanooga/auben-realty-chattanooga-chattanooga-tn",
  score: 0.0,
};

const trackedResult: PMSearchResult = {
  tier: "tracked",
  name: "Some Untracked PM",
  marketId: "phoenix-az",
  marketCity: "Phoenix",
  stateCode: "AZ",
  stateSlug: "arizona",
  citySlug: "phoenix",
  t12Listings: 4,
  topSubmarkets: [],
  href: "/property-managers/arizona/phoenix?highlight=Some%20Untracked%20PM",
  score: 0.1,
};

const canonicalResult: PMSearchResult = {
  tier: "canonical",
  name: "HomeRiver Group",
  canonicalSlug: "homeriver-group",
  marketCount: 2,
  markets: [
    { marketCity: "Chattanooga", stateCode: "TN" },
    { marketCity: "Phoenix", stateCode: "AZ" },
  ],
  goldCount: 4,
  silverCount: 3,
  totalT12Listings: 0,
  totalT24T12Listings: 0,
  totalUrusT12: 0,
  href: "/operators/homeriver-group",
  score: 0.0,
};

test("partitionByTier — routes a market result into the new markets bucket", () => {
  const { markets, ranked, tracked, canonical } = partitionByTier([
    marketResult,
    rankedResult,
    trackedResult,
    canonicalResult,
  ]);
  assert.equal(markets.length, 1);
  assert.equal(markets[0].tier, "market");
  assert.equal(markets[0].marketId, "chattanooga-tn");
  assert.equal(ranked.length, 1);
  assert.equal(tracked.length, 1);
  assert.equal(canonical.length, 1);
});

test("partitionByTier — preserves input order within each tier", () => {
  const secondMarket: PMSearchResult = {
    ...marketResult,
    marketId: "jacksonville-fl",
    name: "Jacksonville, FL",
  };
  const { markets } = partitionByTier([marketResult, secondMarket]);
  assert.deepEqual(
    markets.map((m) => m.marketId),
    ["chattanooga-tn", "jacksonville-fl"]
  );
});

test("filterResultsByEntitlement — passes a market result through even when its marketId is not entitled", () => {
  const entitled = new Set<string>(["phoenix-az"]); // does NOT contain chattanooga-tn
  const filtered = filterResultsByEntitlement([marketResult], entitled);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].tier, "market");
});

test("filterResultsByEntitlement — still gates a ranked result by marketId", () => {
  const entitled = new Set<string>(["phoenix-az"]); // does NOT contain chattanooga-tn
  const filtered = filterResultsByEntitlement([rankedResult], entitled);
  assert.equal(filtered.length, 0);
});

test("filterResultsByEntitlement — a ranked result passes when its marketId IS entitled", () => {
  const entitled = new Set<string>(["chattanooga-tn"]);
  const filtered = filterResultsByEntitlement([rankedResult], entitled);
  assert.equal(filtered.length, 1);
});

test("filterResultsByEntitlement — mixed list keeps market + canonical, gates ranked/tracked by marketId", () => {
  const entitled = new Set<string>(["phoenix-az"]); // only phoenix entitled
  const filtered = filterResultsByEntitlement(
    [marketResult, rankedResult, trackedResult, canonicalResult],
    entitled
  );
  const tiers = filtered.map((r) => r.tier).sort();
  // market + canonical always pass; tracked (phoenix-az) passes; ranked
  // (chattanooga-tn) is gated out.
  assert.deepEqual(tiers, ["canonical", "market", "tracked"]);
});

test("filterResultsByEntitlement — 'all' passes everything through untouched", () => {
  const all = [marketResult, rankedResult, trackedResult, canonicalResult];
  const filtered = filterResultsByEntitlement(all, "all");
  assert.equal(filtered.length, all.length);
});
