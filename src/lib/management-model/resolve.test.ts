import test from "node:test";
import { strict as assert } from "node:assert";
import {
  listingVerdict, listingSignal, combine, resolveManagementModel,
  managementModelLabel, MANAGEMENT_MODEL_LABELS,
} from "./resolve";

const sig = (o: Partial<ReturnType<typeof listingSignal>> = {}) => ({
  quadrant7Cell: "Large MF/BTR Independent", communities: 0, scatteredHomes: 0, submarkets: 0, ...o,
});

test("SFR Independent → third-party / high", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "SFR Independent" }));
  assert.equal(v.model, "third_party");
  assert.equal(v.confidence, "high");
});

test("SFR Institutional → owner-operator / medium", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "SFR Institutional" }));
  assert.equal(v.model, "owner_operator");
  assert.equal(v.confidence, "medium");
});

test("MF mixed book (communities + scattered homes) → third-party / medium", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "Small MF/BTR Independent", communities: 2, scatteredHomes: 5 }));
  assert.equal(v.model, "third_party");
  assert.equal(v.confidence, "medium");
});

test("MF broad footprint → third-party / low", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "Large MF/BTR Independent", communities: 9, submarkets: 5 }));
  assert.equal(v.model, "third_party");
  assert.equal(v.confidence, "low");
});

test("MF Institutional with no strong structure → unknown (verify)", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "Large MF/BTR Institutional", communities: 3, submarkets: 1 }));
  assert.equal(v.model, "unknown");
  assert.equal(v.confidence, null);
  assert.match(v.basis, /verify directly/i);
});

test("MF concentrated → owner-operator / low", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "Small MF/BTR Independent", communities: 2, submarkets: 1 }));
  assert.equal(v.model, "owner_operator");
  assert.equal(v.confidence, "low");
});

test("listingSignal extracts communities, scattered homes, submarkets", () => {
  const s = listingSignal({
    quadrant7Cell: "Small MF/BTR Independent",
    properties: [
      { kind: "community", submarket: "a" },
      { kind: "sfr-submarket", homes: 3, submarket: "b" },
      { kind: "sfr-submarket", homes: 2, submarket: "b" },
    ],
  });
  assert.equal(s.communities, 1);
  assert.equal(s.scatteredHomes, 5);
  assert.equal(s.submarkets, 2);
});

test("combine: confident website overrides a low listing lean", () => {
  const listing = listingVerdict(sig({ quadrant7Cell: "Large MF/BTR Independent", communities: 9, submarkets: 5 })); // tp/low
  const m = combine(listing, { verdict: "owner_operator", confidence: "medium" });
  assert.equal(m.model, "owner_operator");
  assert.equal(m.source, "website");
});

test("combine: agreement corroborates and takes max confidence", () => {
  const listing = listingVerdict(sig({ quadrant7Cell: "SFR Independent" })); // tp/high
  const m = combine(listing, { verdict: "third_party", confidence: "medium" });
  assert.equal(m.model, "third_party");
  assert.equal(m.confidence, "high");
  assert.equal(m.source, "listing+website");
});

test("combine: inconclusive website falls through to listing", () => {
  const listing = listingVerdict(sig({ quadrant7Cell: "SFR Independent" }));
  const m = combine(listing, { verdict: "inconclusive", confidence: null });
  assert.equal(m.source, "listing");
});

test("unknown never carries a confidence chip; labels are exact", () => {
  const m = resolveManagementModel({ quadrant7Cell: "Hybrid", properties: [] });
  assert.ok(m.model === "third_party" && m.confidence === "low"); // Hybrid → tp/low
  assert.equal(MANAGEMENT_MODEL_LABELS.unknown, "Unknown");
  assert.equal(managementModelLabel("third_party"), "Third-party manager");
  assert.equal(managementModelLabel("owner_operator"), "Owner-operator (likely)");
});
