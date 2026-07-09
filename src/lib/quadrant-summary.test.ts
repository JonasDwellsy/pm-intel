import test from "node:test";
import { strict as assert } from "node:assert";
import { deriveQuadrant7CellSummary } from "@/lib/quadrant-summary";
import type { PMListItem } from "@/lib/types";

// Minimal PMListItem factory — fills the required fields with inert defaults
// so each test only states the fields deriveQuadrant7CellSummary reads
// (quadrant7Cell / quadrant / domT12 / rentVsComp / totalObservedUnits /
// metricStars).
function pm(overrides: Partial<PMListItem>): PMListItem {
  const base: PMListItem = {
    slug: "op",
    name: "Op",
    quadrant: "SFR Independent",
    quadrant7Cell: "SFR Independent",
    operatorType: "pm",
    hybrid: false,
    rankOverall: null,
    rankOverallTotal: null,
    rankQuadrant: null,
    rankQuadrantTotal: null,
    domT12: 10,
    totalObservedUnits: 0,
    primaryCity: "City",
    primaryCityShare: null,
    claimed: false,
    rentVsComp: null,
    concessionRate: null,
    accentColor: null,
    coverageMapPoints: [],
    compositeStar: null,
    compositeCohortName: null,
  };
  return { ...base, ...overrides };
}

test("buckets by 7-cell: counts all operators, sums units, medians DOM/rent, tallies gold by metric", () => {
  const out = deriveQuadrant7CellSummary([
    pm({
      quadrant7Cell: "SFR Independent",
      domT12: 20,
      rentVsComp: 5,
      totalObservedUnits: 100,
      metricStars: { leaseUp: "gold", retention: null, rent: "gold", marketing: "silver" },
    }),
    pm({
      quadrant7Cell: "SFR Independent",
      domT12: 10,
      rentVsComp: -3,
      totalObservedUnits: 50,
      metricStars: { leaseUp: "gold", retention: "gold", rent: null, marketing: null },
    }),
    // No finite DOM, no rent, no metricStars — still counted; units still summed.
    pm({
      quadrant7Cell: "SFR Independent",
      domT12: Number.NaN,
      rentVsComp: null,
      totalObservedUnits: 30,
      metricStars: undefined,
    }),
  ]);

  const cell = out["SFR Independent"];
  assert.equal(cell.count, 3); // all three, incl. the finite-DOM-less one
  assert.equal(cell.units, 180);
  assert.equal(cell.medianDomT12, 15); // median(20, 10)
  assert.equal(cell.medianRentVsComp, 1); // median(5, -3)
  assert.deepEqual(cell.goldByMetric, {
    leaseUp: 2,
    retention: 1,
    rent: 1,
    marketing: 0, // a silver does not count as gold
  });
});

test("falls back to legacy quadrant when quadrant7Cell is null", () => {
  const out = deriveQuadrant7CellSummary([
    pm({
      quadrant7Cell: null,
      quadrant: "Hybrid",
      domT12: 5,
      totalObservedUnits: 10,
      metricStars: { leaseUp: null, retention: null, rent: null, marketing: null },
    }),
  ]);

  assert.ok(out["Hybrid"]);
  assert.equal(out["Hybrid"].count, 1);
  assert.equal(out["Hybrid"].units, 10);
  assert.equal(out["Hybrid"].medianDomT12, 5);
  assert.equal(out["Hybrid"].medianRentVsComp, null);
  assert.deepEqual(out["Hybrid"].goldByMetric, {
    leaseUp: 0,
    retention: 0,
    rent: 0,
    marketing: 0,
  });
});
