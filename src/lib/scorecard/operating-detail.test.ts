import test from "node:test";
import { strict as assert } from "node:assert";
import {
  metricTone,
  vacancyDetail,
  concessionDetail,
} from "./operating-detail";

test("metricTone lowerBetter: below band good, above band watch, in-band neutral", () => {
  assert.equal(metricTone(8.2, 23.6, "lowerBetter"), "good");
  assert.equal(metricTone(30, 23.6, "lowerBetter"), "watch");
  assert.equal(metricTone(23.6, 23.6, "lowerBetter"), "neutral");
});

test("metricTone higherWorse: above band watch, otherwise neutral (never 'good' for being low)", () => {
  assert.equal(metricTone(9.1, 3.7, "higherWorse"), "watch");
  assert.equal(metricTone(1.0, 3.7, "higherWorse"), "neutral");
  assert.equal(metricTone(3.7, 3.7, "higherWorse"), "neutral");
});

test("metricTone: null/negative benchmark → neutral; ZERO benchmark still compares", () => {
  assert.equal(metricTone(8.2, null, "lowerBetter"), "neutral");
  assert.equal(metricTone(8.2, -1, "higherWorse"), "neutral");
  // A 0 benchmark is meaningful: a value above 0 is above the market.
  assert.equal(metricTone(12.6, 0, "higherWorse"), "watch"); // the Houston concession case
  assert.equal(metricTone(0, 0, "higherWorse"), "neutral"); // equal → in line
  assert.equal(metricTone(8.2, 0, "lowerBetter"), "watch"); // above a 0 median → worse
});

test("vacancyDetail: factual interpretation vs cohort median, good when below", () => {
  const d = vacancyDetail(8.2, 23.6);
  assert.equal(d.tone, "good");
  assert.match(d.interpretation, /8\.2% of the leasing cycle/);
  assert.match(d.interpretation, /23\.6% cohort median/);
  assert.match(d.definition, /Lower is more favorable/);
});

test("concessionDetail: well above market rate → watch", () => {
  const d = concessionDetail(9.1, 3.7);
  assert.equal(d.tone, "watch");
  assert.match(d.interpretation, /9\.1% of trailing-12-month listings/);
  assert.match(d.interpretation, /3\.7% market rate/);
});
