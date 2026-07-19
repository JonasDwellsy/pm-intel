import test from "node:test";
import { strict as assert } from "node:assert";
import { operatorMemberKey } from "./operator-member-key";
import type { PMSearchResult } from "@/lib/pm-search";

// Extracted from SearchResultRow.tsx (operator-roster watch lists, Task
// 2) — this suite is the guard that the extraction didn't change the
// derivation. See SearchResultRow.test.tsx for the rendering-level
// coverage of the same rows.

test("canonical tier resolves to canonicalSlug", () => {
  const result = {
    tier: "canonical",
    name: "Acme Residential",
    canonicalSlug: "acme-residential",
    marketCount: 3,
    markets: [],
    goldCount: 0,
    silverCount: 0,
    totalT12Listings: 0,
    totalT24T12Listings: 0,
    totalUrusT12: 0,
    href: "/operators/acme-residential",
    score: 0,
  } as PMSearchResult;
  assert.equal(operatorMemberKey(result), "acme-residential");
});

test("ranked tier resolves to slug", () => {
  const result = {
    tier: "ranked",
    name: "29th Street Property Management",
    slug: "29th-street-denver-co",
    marketId: "denver-co",
    marketCity: "Denver",
    stateCode: "CO",
    stateSlug: "colorado",
    citySlug: "denver",
    goldCount: 0,
    silverCount: 0,
    t12Listings: 10,
    href: "/property-managers/colorado/denver/29th-street-denver-co",
    score: 0,
  } as PMSearchResult;
  assert.equal(operatorMemberKey(result), "29th-street-denver-co");
});

test("tracked tier resolves to null (below ranking threshold, no scorecard/slug)", () => {
  const result = {
    tier: "tracked",
    name: "Some Small Landlord",
    marketId: "denver-co",
    marketCity: "Denver",
    stateCode: "CO",
    stateSlug: "colorado",
    citySlug: "denver",
    t12Listings: 4,
    topSubmarkets: [],
    href: "/property-managers/colorado/denver?highlight=Some%20Small%20Landlord",
    score: 0,
  } as PMSearchResult;
  assert.equal(operatorMemberKey(result), null);
});

test("market tier resolves to null (not an operator at all)", () => {
  const result = {
    tier: "market",
    name: "Denver, CO",
    marketId: "denver-co",
    marketCity: "Denver",
    stateCode: "CO",
    stateSlug: "colorado",
    citySlug: "denver",
    operatorCount: 145,
    href: "/property-managers/colorado/denver",
    score: 0,
  } as PMSearchResult;
  assert.equal(operatorMemberKey(result), null);
});
