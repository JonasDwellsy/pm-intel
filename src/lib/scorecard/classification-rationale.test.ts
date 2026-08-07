import test from "node:test";
import { strict as assert } from "node:assert";
import { sanitizeClassificationRationale as clean } from "./classification-rationale";

// Fixtures are verbatim from the live seed — all 11 distinct tail shapes are
// represented across these cases.
const SFR_THIN =
  "Homeriver Group Chattanooga operates predominantly scattered single-family inventory. " +
  "0% of observed inventory sits in concentrated communities. " +
  "Total observed managed units in Chattanooga MSA: 41, classified as Scattered / Independent at the Independent scale. " +
  "Composite rank computed on thin sample — consider with caution.";

const APT =
  "Austell Village operates predominantly apartment inventory (96% of observed units are apartments), " +
  "across both community and scattered holdings. " +
  "Total observed managed units in Chattanooga MSA: 88, classified as MF/BTR / Independent at the Independent scale.";

const HYBRID =
  "Acme Group operates a mix of multi-unit community holdings and scattered-site inventory. " +
  "48% of observed inventory is in concentrated communities — between the 30% and 70% thresholds. " +
  "Total observed managed units in Denver MSA: 210, at the Independent scale.";

test("the retired 4-quadrant label is replaced by the operator's real 7-cell", () => {
  const out = clean(SFR_THIN, "SFR Independent");
  assert.match(out, /classified as SFR Independent\./);
  assert.doesNotMatch(out, /Scattered \/ Independent/);
  // The doubled scale word goes with it.
  assert.doesNotMatch(out, /at the Independent scale/);
});

test("the size distinction the old label collapsed is restored", () => {
  // Both of these printed "MF/BTR / Independent" before, which is most of the
  // point of the 7-cell taxonomy thrown away.
  assert.match(clean(APT, "Small MF/BTR Independent"), /classified as Small MF\/BTR Independent\./);
  assert.match(clean(APT, "Large MF/BTR Independent"), /classified as Large MF\/BTR Independent\./);
});

test("rank and composite never survive to a rendered surface", () => {
  const out = clean(SFR_THIN, "SFR Independent");
  assert.doesNotMatch(out, /composite/i);
  assert.doesNotMatch(out, /\brank\b/i);
});

test("the thin-sample warning survives, restated without the rank", () => {
  // Dropping the caveat entirely would be worse than the leak — it is the one
  // part of that sentence a reader actually needs.
  const out = clean(SFR_THIN, "SFR Independent");
  assert.match(out, /thin sample/i);
  assert.match(out, /caution/i);
});

test("an operator whose NAME contains 'rank' is left intact", () => {
  // Grankol Enterprises and Franklin West are real operators. A word-level
  // match on "rank" would corrupt their prose.
  const grankol =
    "Grankol Enterprises, Inc. operates predominantly apartment inventory (99% of observed units are apartments), " +
    "across both community and scattered holdings. " +
    "Total observed managed units in Phoenix MSA: 62, classified as MF/BTR / Independent at the Independent scale.";
  const out = clean(grankol, "Small MF/BTR Independent");
  assert.match(out, /^Grankol Enterprises, Inc\. operates/);
  assert.match(out, /classified as Small MF\/BTR Independent\./);
});

test("the Hybrid shape — no 'classified as' — is handled too", () => {
  const out = clean(HYBRID, "Hybrid");
  assert.match(out, /classified as Hybrid\./);
  assert.doesNotMatch(out, /at the Independent scale/);
  // The factual body is untouched.
  assert.match(out, /48% of observed inventory is in concentrated communities/);
});

test("the factual body is never edited", () => {
  const out = clean(SFR_THIN, "SFR Independent");
  assert.match(out, /operates predominantly scattered single-family inventory/);
  assert.match(out, /0% of observed inventory sits in concentrated communities/);
  assert.match(out, /Total observed managed units in Chattanooga MSA: 41/);
});

test("without a known 7-cell, the stale clause is dropped rather than guessed", () => {
  const out = clean(APT, null);
  assert.doesNotMatch(out, /classified as/);
  assert.doesNotMatch(out, /MF\/BTR \/ Independent/);
  assert.match(out, /Total observed managed units in Chattanooga MSA: 88\./);
});

test("empty and absent input yield an empty string, never 'undefined'", () => {
  assert.equal(clean(null, "SFR Independent"), "");
  assert.equal(clean(undefined, "SFR Independent"), "");
  assert.equal(clean("", "SFR Independent"), "");
});

test("idempotent — once the pipeline emits clean text there is nothing to match", () => {
  const once = clean(SFR_THIN, "SFR Independent");
  assert.equal(clean(once, "SFR Independent"), once);
  // And prose that never had the defects passes through unchanged.
  const good =
    "Acme operates predominantly scattered single-family inventory. " +
    "Total observed managed units in Denver MSA: 300, classified as SFR Independent.";
  assert.equal(clean(good, "SFR Independent"), good);
});

test("a double space inside an operator's own name is preserved", () => {
  // 13 live operators have one ("Mauro  Rodriguez", "Northpoint Asset  Management").
  // Tidying the seam left by a removed sentence must not become a licence to
  // reformat a company's name.
  const raw =
    "Mauro  Rodriguez operates predominantly apartment inventory (91% of observed units are apartments), " +
    "across both community and scattered holdings. " +
    "Total observed managed units in Phoenix MSA: 55, classified as MF/BTR / Independent at the Independent scale. " +
    "Composite rank computed on thin sample — consider with caution.";
  const out = clean(raw, "Small MF/BTR Independent");
  assert.match(out, /^Mauro {2}Rodriguez operates/);
  assert.doesNotMatch(out, /composite/i);
});
