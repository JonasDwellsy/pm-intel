import test from "node:test";
import { strict as assert } from "node:assert";
import { toPmListItem } from "./slugify";

// Minimal scorecardData blob with just the fields toPmListItem reads.
function scorecardData(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    canonicalOperatorId: null,
    canonicalOperatorName: undefined,
    pm: { quadrant7Cell: "MF/BTR · Independent", accentColor: "#000", quadrant: "q" },
    market: { name: "St. Louis" },
    coverage: { totalObservedUnits: 100 },
    performance: { domT12: 18, domStar: null },
    rentPerformance: { delta: 0.045, pmYoyChange: 0.02, star: null },
    marketing: { star: null },
    tenancy: { star: null },
    communityVisibility: null,
    rank: { overallTotal: 40, quadrantTotal: 20, compositeStar: null, compositeCohortName: "c" },
    geographicCoverage: { citiesText: "67% St. Louis", coverageMapPoints: [], topCities: [] },
    ...overrides,
  });
}

function row(name: string, canonicalOperatorName?: string) {
  return {
    slug: "some-operator-st-louis-mo",
    name,
    quadrant: "q",
    hybrid: false,
    rankOverall: 1,
    rankQuadrant: 1,
    claimed: false,
    scorecardData: scorecardData({ canonicalOperatorName }),
  };
}

test("displayName is undefined when there is no canonicalOperatorName", () => {
  assert.equal(toPmListItem(row("CR Holland Property Management")).displayName, undefined);
});

test("case-only canonical drift does NOT override name (capitalization stays consistent with the scorecard)", () => {
  // canonicalOperatorName differs only by casing — stale drift, not a real alias.
  const item = toPmListItem(row("CR Holland Property Management", "Cr Holland Property Management"));
  assert.equal(item.displayName, undefined, "should fall back to name, not the mis-cased canonical");
  assert.equal(item.name, "CR Holland Property Management");
});

test("a genuine DBA alias (different name) is still surfaced as displayName", () => {
  const item = toPmListItem(row("Haven Residential", "29th Street Property Management"));
  assert.equal(item.displayName, "29th Street Property Management");
});
