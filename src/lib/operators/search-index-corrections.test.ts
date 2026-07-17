import test from "node:test";
import { strict as assert } from "node:assert";
import { applyNameCorrectionsToSearchIndex } from "./search-index-corrections";

function idx() {
  return {
    ranked: [
      { slug: "acme-denver-co", name: "Acme" },
      { slug: "beta-denver-co", name: "Beta" },
    ],
    canonical: [{ canonicalSlug: "edward-rose-sons", name: "Edward Rose" }],
  };
}

test("pm correction overlays the ranked entry by slug", () => {
  const i = idx();
  const r = applyNameCorrectionsToSearchIndex(i, [
    { targetKind: "pm", targetKey: "acme-denver-co", correctedName: "ACME" },
  ]);
  assert.equal(i.ranked[0].name, "ACME");
  assert.equal(i.ranked[1].name, "Beta");
  assert.equal(r.matched, 1);
  assert.deepEqual(r.unmatched, []);
});

test("canonical correction overlays the canonical entry by canonicalSlug", () => {
  const i = idx();
  const r = applyNameCorrectionsToSearchIndex(i, [
    { targetKind: "canonical", targetKey: "edward-rose-sons", correctedName: "Edward Rose & Sons" },
  ]);
  assert.equal(i.canonical[0].name, "Edward Rose & Sons");
  assert.equal(r.matched, 1);
});

test("unmatched pm correction (grouped member) is reported, not thrown", () => {
  const i = idx();
  const r = applyNameCorrectionsToSearchIndex(i, [
    { targetKind: "pm", targetKey: "not-in-index", correctedName: "X" },
  ]);
  assert.equal(r.matched, 0);
  assert.deepEqual(r.unmatched, ["not-in-index"]);
  assert.equal(i.ranked[0].name, "Acme");
});

test("pm correction does not touch canonical tier (and vice-versa)", () => {
  const i = idx();
  applyNameCorrectionsToSearchIndex(i, [
    { targetKind: "pm", targetKey: "acme-denver-co", correctedName: "ACME" },
  ]);
  assert.equal(i.canonical[0].name, "Edward Rose");
});

test("unknown targetKind is reported unmatched", () => {
  const i = idx();
  const r = applyNameCorrectionsToSearchIndex(i, [
    { targetKind: "weird", targetKey: "x", correctedName: "Y" },
  ]);
  assert.deepEqual(r.unmatched, ["x"]);
});
