// Coverage for countOperatorStars — the single source of truth for
// per-metric gold + silver star totals across the market list, the
// scorecard hero, the operator profile, the compare table, and the
// homepage sample cards.

import test from "node:test";
import { strict as assert } from "node:assert";
import { countOperatorStars } from "./stars";
import type { ScorecardData, StarLevel } from "@/lib/types";

/** Build a minimal ScorecardData shaped to test the five star
 *  fields. Everything else is filled with stand-ins that satisfy
 *  the TS shape; the function under test only reads the star
 *  fields. */
function makeScorecard(stars: {
  dom?: StarLevel;
  rent?: StarLevel;
  marketing?: StarLevel;
  tenancy?: StarLevel;
  community?: StarLevel;
}): ScorecardData {
  return {
    performance: { domStar: stars.dom ?? null },
    rentPerformance: stars.rent !== undefined ? { star: stars.rent } : null,
    marketing: { star: stars.marketing ?? null },
    tenancy: { star: stars.tenancy ?? null },
    communityVisibility:
      stars.community !== undefined ? { star: stars.community } : null,
  } as unknown as ScorecardData;
}

test("counts all five gold stars when every metric earns one", () => {
  const sc = makeScorecard({
    dom: "gold",
    rent: "gold",
    marketing: "gold",
    tenancy: "gold",
    community: "gold",
  });
  const result = countOperatorStars(sc);
  assert.equal(result.goldCount, 5);
  assert.equal(result.silverCount, 0);
});

test("counts mixed gold + silver across the five metrics", () => {
  const sc = makeScorecard({
    dom: "gold",
    rent: "silver",
    marketing: "gold",
    tenancy: "silver",
    // no community star
  });
  const result = countOperatorStars(sc);
  assert.equal(result.goldCount, 2);
  assert.equal(result.silverCount, 2);
});

test("treats missing communityVisibility (SFR / Hybrid) as zero stars contributed", () => {
  // SFR operators don't have a communityVisibility scope — the field
  // is null on those scorecards. The helper must not throw or
  // double-count.
  const sc = makeScorecard({
    dom: "gold",
    rent: "silver",
    marketing: "gold",
    tenancy: "silver",
    community: undefined, // → communityVisibility: null
  });
  const result = countOperatorStars(sc);
  assert.equal(result.goldCount, 2);
  assert.equal(result.silverCount, 2);
});

test("treats null per-metric stars as zero — operator-dignity gate output", () => {
  // The v1.0 dignity gate emits null instead of a bronze tier; the
  // helper must treat null as "no star contributed".
  const sc = makeScorecard({
    dom: null,
    rent: null,
    marketing: null,
    tenancy: null,
    community: null,
  });
  const result = countOperatorStars(sc);
  assert.equal(result.goldCount, 0);
  assert.equal(result.silverCount, 0);
});

test("returns zero counts when every star field is undefined", () => {
  const sc = makeScorecard({});
  const result = countOperatorStars(sc);
  assert.equal(result.goldCount, 0);
  assert.equal(result.silverCount, 0);
});

test("ignores any bronze-like value that isn't gold or silver", () => {
  // Defensive: legacy or future tiers (bronze, tier-x) must NOT be
  // counted as either gold or silver. The chip exposes only the two
  // tiers per the v1.0 dignity convention.
  const sc = makeScorecard({
    dom: "bronze" as unknown as StarLevel,
    rent: "gold",
  });
  const result = countOperatorStars(sc);
  assert.equal(result.goldCount, 1);
  assert.equal(result.silverCount, 0);
});

test("the contract is read-only — does not mutate the passed scorecard", () => {
  const sc = makeScorecard({ dom: "gold", rent: "silver" });
  const before = JSON.stringify(sc);
  countOperatorStars(sc);
  assert.equal(JSON.stringify(sc), before);
});
