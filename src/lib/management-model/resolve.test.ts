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

test("BROAD MF Institutional → unknown, NOT third-party (owning REIT vs 3rd-party manager indistinguishable at scale; guards UDR-type owners)", () => {
  // Broad footprint (>=8 communities, >=4 submarkets) would trip the
  // third_party/low breadth rule, but institutional resolves to unknown first.
  const v = listingVerdict(sig({ quadrant7Cell: "Large MF/BTR Institutional", communities: 12, submarkets: 6 }));
  assert.equal(v.model, "unknown");
  assert.equal(v.confidence, null);
});

test("BROAD MF Independent still → third-party / low (breadth rule intact for non-institutional)", () => {
  const v = listingVerdict(sig({ quadrant7Cell: "Large MF/BTR Independent", communities: 12, submarkets: 6 }));
  assert.equal(v.model, "third_party");
  assert.equal(v.confidence, "low");
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

test("combine: decisive website verdict with null confidence is treated as inconclusive (falls through to listing)", () => {
  const listing = listingVerdict(sig({ quadrant7Cell: "SFR Independent" })); // tp/high
  // Decisive verdict but null confidence is type-legal on WebsiteVerdict — must not leak through.
  const m = combine(listing, { verdict: "owner_operator", confidence: null });
  assert.equal(m.source, "listing");
  assert.equal(m.model, "third_party");
  assert.equal(m.confidence, "high");
});

test("combine: disagreement with equal confidence rank → website wins the tie-break", () => {
  const listing = listingVerdict(sig({ quadrant7Cell: "SFR Institutional" })); // owner_operator/medium
  const m = combine(listing, { verdict: "third_party", confidence: "medium" }); // equal rank, disagrees
  assert.equal(m.model, "third_party");
  assert.equal(m.confidence, "medium");
  assert.equal(m.source, "website");
});

test("combine: listing outranks a lower-confidence disagreeing website → listing wins", () => {
  const listing = listingVerdict(sig({ quadrant7Cell: "SFR Independent" })); // tp/high
  const m = combine(listing, { verdict: "owner_operator", confidence: "low" }); // lower rank, disagrees
  assert.equal(m.model, "third_party");
  assert.equal(m.confidence, "high");
  assert.equal(m.source, "listing");
});

test("resolveManagementModel: true unknown path (MF Institutional, no strong structure, no website) carries null confidence", () => {
  const m = resolveManagementModel({ quadrant7Cell: "Large MF/BTR Institutional", properties: [] });
  assert.equal(m.model, "unknown");
  assert.equal(m.confidence, null);
  assert.equal(m.source, "listing");
});
