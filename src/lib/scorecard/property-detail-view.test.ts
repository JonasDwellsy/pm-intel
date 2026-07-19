import test from "node:test";
import { strict as assert } from "node:assert";
import { projectPropertyRows } from "./property-detail-view";
import type { PropertyDetailBlock, PropertyRecord } from "@/lib/types";

function record(overrides: Partial<PropertyRecord> = {}): PropertyRecord {
  return {
    kind: "community",
    label: "The Oaks",
    submarket: null,
    units: 120,
    homes: null,
    nListings: 18,
    medianDomT12: 22,
    medianRentT12: 1450,
    rentYoY: 0.04,
    concessionRate: 0.1,
    listingQuality: 78,
    ...overrides,
  };
}

const COMPS: PropertyDetailBlock["comps"] = {
  medianDomT12: 29,
  medianRentT12: 1510,
  rentYoY: 0.021,
  concessionRate: 0.18,
};

function block(properties: PropertyRecord[], comps = COMPS): PropertyDetailBlock {
  return { properties, comps };
}

test("never emits a score/star/percentile field on the VM", () => {
  const [row] = projectPropertyRows(block([record()]));
  const keys = Object.keys(row);
  assert.ok(!keys.some((k) => /star|percentile|\bscore\b|rank/i.test(k)));
});

// --- DOM: lower is better ---

test("DOM: value lower than comp is 'better'", () => {
  const [row] = projectPropertyRows(block([record({ medianDomT12: 22 })]));
  assert.equal(row.medianDomT12.value, 22);
  assert.equal(row.medianDomT12.comp, 29);
  assert.equal(row.medianDomT12.deltaSign, "better");
});

test("DOM: value higher than comp is 'worse'", () => {
  const [row] = projectPropertyRows(block([record({ medianDomT12: 35 })]));
  assert.equal(row.medianDomT12.deltaSign, "worse");
});

test("DOM: value equal to comp is 'neutral'", () => {
  const [row] = projectPropertyRows(block([record({ medianDomT12: 29 })]));
  assert.equal(row.medianDomT12.deltaSign, "neutral");
});

test("DOM: null value yields null deltaSign", () => {
  const [row] = projectPropertyRows(block([record({ medianDomT12: null })]));
  assert.equal(row.medianDomT12.value, null);
  assert.equal(row.medianDomT12.deltaSign, null);
});

test("DOM: null comp (no MSA comp available) yields null deltaSign", () => {
  const [row] = projectPropertyRows(
    block([record({ medianDomT12: 22 })], { ...COMPS, medianDomT12: null })
  );
  assert.equal(row.medianDomT12.comp, null);
  assert.equal(row.medianDomT12.deltaSign, null);
});

// --- concessionRate: lower is better (fewer concessions) ---

test("concessionRate: lower than comp is 'better'", () => {
  const [row] = projectPropertyRows(block([record({ concessionRate: 0.1 })]));
  assert.equal(row.concessionRate.deltaSign, "better");
});

test("concessionRate: higher than comp is 'worse'", () => {
  const [row] = projectPropertyRows(block([record({ concessionRate: 0.3 })]));
  assert.equal(row.concessionRate.deltaSign, "worse");
});

test("concessionRate: equal to comp is 'neutral'", () => {
  const [row] = projectPropertyRows(block([record({ concessionRate: 0.18 })]));
  assert.equal(row.concessionRate.deltaSign, "neutral");
});

test("concessionRate: null value yields null deltaSign", () => {
  const [row] = projectPropertyRows(block([record({ concessionRate: null })]));
  assert.equal(row.concessionRate.deltaSign, null);
});

// --- rentYoY: higher is better ---

test("rentYoY: higher than comp is 'better'", () => {
  const [row] = projectPropertyRows(block([record({ rentYoY: 0.06 })]));
  assert.equal(row.rentYoY.deltaSign, "better");
});

test("rentYoY: lower than comp is 'worse'", () => {
  const [row] = projectPropertyRows(block([record({ rentYoY: -0.01 })]));
  assert.equal(row.rentYoY.deltaSign, "worse");
});

test("rentYoY: equal to comp is 'neutral'", () => {
  const [row] = projectPropertyRows(block([record({ rentYoY: 0.021 })]));
  assert.equal(row.rentYoY.deltaSign, "neutral");
});

test("rentYoY: null value yields null deltaSign", () => {
  const [row] = projectPropertyRows(block([record({ rentYoY: null })]));
  assert.equal(row.rentYoY.deltaSign, null);
});

// --- medianRentT12: level, always 'neutral' when both sides present ---

test("medianRentT12: always 'neutral' regardless of direction of the delta", () => {
  const above = projectPropertyRows(block([record({ medianRentT12: 2200 })]))[0];
  const below = projectPropertyRows(block([record({ medianRentT12: 900 })]))[0];
  const equal = projectPropertyRows(block([record({ medianRentT12: 1510 })]))[0];
  assert.equal(above.medianRentT12.deltaSign, "neutral");
  assert.equal(below.medianRentT12.deltaSign, "neutral");
  assert.equal(equal.medianRentT12.deltaSign, "neutral");
  // comp still carried through for display even though no judgment is made
  assert.equal(above.medianRentT12.comp, 1510);
});

test("medianRentT12: null value yields null deltaSign (no comp rendered)", () => {
  const [row] = projectPropertyRows(block([record({ medianRentT12: null })]));
  assert.equal(row.medianRentT12.deltaSign, null);
});

// --- raw pass-through fields ---

test("raw fields (kind, label, units, homes, nListings, listingQuality) pass through unchanged", () => {
  const sfr = record({
    kind: "sfr-submarket",
    label: "North Suburbs",
    submarket: "north-suburbs",
    units: null,
    homes: 34,
    nListings: 9,
    listingQuality: 61,
  });
  const [row] = projectPropertyRows(block([sfr]));
  assert.equal(row.kind, "sfr-submarket");
  assert.equal(row.label, "North Suburbs");
  assert.equal(row.submarket, "north-suburbs");
  assert.equal(row.units, null);
  assert.equal(row.homes, 34);
  assert.equal(row.nListings, 9);
  assert.equal(row.listingQuality, 61);
});

test("projects one row per property, preserving order", () => {
  const rows = projectPropertyRows(
    block([
      record({ label: "Community A" }),
      record({ kind: "sfr-submarket", label: "Submarket B", units: null, homes: 12 }),
    ])
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.label), ["Community A", "Submarket B"]);
});
