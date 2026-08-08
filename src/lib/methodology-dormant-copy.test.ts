import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RECENCY_GATE_DAYS } from "./methodology-constants";

// v0.8 dormant tier, phase 4 — drift guards on the public explanation of the
// three operator states. Same pattern as methodology-constants.test.ts: the
// methodology page is what a client reads to decide whether to trust a number,
// so a silent divergence there is the site stating a rule the data no longer
// follows.
//
// Two things are guarded. First, the page must keep describing all three
// states — the earlier copy documented an outright EXCLUSION, which is now
// wrong in a way that matters: it told owners a large operator was absent
// because it had left, when in fact it is present and labeled. Second, the
// voice: dormancy is a fact about our listing record, never a claim about the
// business.

function methodologySrc(): string {
  return readFileSync(join(process.cwd(), "src/app/methodology/page.tsx"), "utf8");
}

test("the methodology page documents all three operator states", () => {
  const src = methodologySrc();
  assert.match(src, /Three operator states\./);
  for (const state of ["Ranked", "Dormant", "Not eligible"]) {
    assert.match(
      src,
      new RegExp(`<strong>${state}</strong>`),
      `the states table must name "${state}"`
    );
  }
  // The anchor is linked from the version-history entry; renaming it silently
  // breaks that cross-reference.
  assert.match(src, /id="operator-states"/);
  assert.match(src, /href="#operator-states"/);
});

test("the stated recency window matches the pipeline constant", () => {
  const src = methodologySrc();
  assert.match(
    src,
    new RegExp(`dq-chip dq-tnum">${RECENCY_GATE_DAYS} days<`),
    `§01 must state the real window (${RECENCY_GATE_DAYS} days)`
  );
});

test("the page explains that dormant operators leave the cohort baselines", () => {
  // This is the load-bearing claim: the tier is only safe to ship because a
  // dormant operator cannot move a ranked operator's percentile. If the page
  // stops saying so, the reader has no way to know the ranks are stable.
  // JSX wraps mid-sentence, so match against a whitespace-collapsed copy.
  const flat = methodologySrc().replace(/\s+/g, " ");
  assert.match(flat, /<em>scored against<\/em> the ranked cohort/);
  assert.match(flat, /<em>members<\/em> of it/);
  assert.match(flat, /absent from every median, percentile, and eligible-operator count/);
  assert.match(flat, /purely additive/);
});

test("the dormant explanation never claims the operator stopped operating", () => {
  // Everything after the states heading, up to the category exclusions that
  // follow it — the block this phase wrote.
  const src = methodologySrc();
  const start = src.indexOf('id="operator-states"');
  const end = src.indexOf('id="category-exclusions"');
  assert.ok(start > 0 && end > start, "could not isolate the dormant block");
  const block = src.slice(start, end);

  // "wound down" and "left the market" were in the copy this replaced.
  for (const forbidden of [
    /\binactive\b/i,
    /\bdeparted\b/i,
    /left the market/i,
    /wound down/i,
    /out of business/i,
    /shut down/i,
    /\bceased\b/i,
    /went under/i,
  ]) {
    assert.ok(
      !forbidden.test(block),
      `§01's dormant copy must not say ${forbidden} — we observe listings, not businesses`
    );
  }

  // And it must say what we DO observe, positively.
  assert.match(block, /not about the business/);
  assert.match(block, /cannot see why/);
});

test("the glossary defines the dormant state rather than a departure gate", () => {
  const src = methodologySrc();
  assert.match(src, /term: "Dormant operator"/);
  assert.ok(
    !/term: "Departed-operator gate"/.test(src),
    "the departed-operator glossary entry describes behaviour that no longer exists"
  );
});
