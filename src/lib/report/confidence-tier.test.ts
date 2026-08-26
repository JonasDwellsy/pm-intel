import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tierFromScorecard,
  tierFromSearch,
  HIGH_CONFIDENCE_MIN_OBS,
} from "./confidence-tier";
import type { ScorecardData } from "@/lib/types";
import type { PMSearchResult } from "@/lib/pm-search";

function scorecard(dataTier: "Full ranking" | "Limited", domN: number, t12 = 60) {
  return {
    coverage: { dataTier, t12Listings: t12 },
    performance: { domT12N: domN },
  } as unknown as ScorecardData;
}

test("ranked + ample observations → high confidence", () => {
  const info = tierFromScorecard(scorecard("Full ranking", HIGH_CONFIDENCE_MIN_OBS));
  assert.equal(info.tier, "ranked");
  assert.equal(info.confidence, "high");
});

test("ranked + thin observations → moderate confidence", () => {
  const info = tierFromScorecard(scorecard("Full ranking", HIGH_CONFIDENCE_MIN_OBS - 1));
  assert.equal(info.tier, "ranked");
  assert.equal(info.confidence, "moderate");
});

test("limited data tier → profile (no confidence)", () => {
  const info = tierFromScorecard(scorecard("Limited", 200));
  assert.equal(info.tier, "profile");
  assert.equal(info.confidence, null);
  assert.equal(info.confidenceLabel, null);
});

test("search: tracked hit → profile", () => {
  const r = { tier: "tracked", t12Listings: 12 } as unknown as PMSearchResult;
  assert.equal(tierFromSearch(r).tier, "profile");
});

test("search: ranked hit with high volume → ranked/high", () => {
  const r = { tier: "ranked", t12Listings: 120 } as unknown as PMSearchResult;
  const info = tierFromSearch(r);
  assert.equal(info.tier, "ranked");
  assert.equal(info.confidence, "high");
});
