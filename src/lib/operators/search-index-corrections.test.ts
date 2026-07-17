import test from "node:test";
import { strict as assert } from "node:assert";
import {
  applyNameCorrectionsToSearchIndex,
  RankedEntryName,
  CanonicalEntryName,
} from "./search-index-corrections";

function idx(): { ranked: RankedEntryName[]; canonical: CanonicalEntryName[] } {
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

test("a correction with a differing originalName pushes it onto the matched entry's aliases", () => {
  const i = idx();
  applyNameCorrectionsToSearchIndex(i, [
    {
      targetKind: "pm",
      targetKey: "acme-denver-co",
      correctedName: "ACME",
      originalName: "Acme Realty Group",
    },
  ]);
  assert.equal(i.ranked[0].name, "ACME");
  assert.deepEqual(i.ranked[0].aliases, ["Acme Realty Group"]);
});

test("a correction with an originalName equal (casing) to correctedName adds no alias", () => {
  const i = idx();
  applyNameCorrectionsToSearchIndex(i, [
    {
      targetKind: "pm",
      targetKey: "acme-denver-co",
      correctedName: "ACME",
      originalName: "acme",
    },
  ]);
  assert.equal(i.ranked[0].name, "ACME");
  assert.deepEqual(i.ranked[0].aliases, []);
});
