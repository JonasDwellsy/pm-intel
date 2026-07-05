import test from "node:test";
import { strict as assert } from "node:assert";
import {
  metricTone,
  vacancyDetail,
  rentStabilityDetail,
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

test("metricTone: null or zero median → neutral (no comparison)", () => {
  assert.equal(metricTone(8.2, null, "lowerBetter"), "neutral");
  assert.equal(metricTone(8.2, 0, "lowerBetter"), "neutral");
});

test("vacancyDetail: factual interpretation vs cohort median, good when below", () => {
  const d = vacancyDetail(8.2, 23.6);
  assert.equal(d.tone, "good");
  assert.match(d.interpretation, /8\.2% of the leasing cycle/);
  assert.match(d.interpretation, /23\.6% cohort median/);
  assert.match(d.definition, /Lower is more favorable/);
});

test("rentStabilityDetail: null volatility → empty interpretation + neutral (card shows caveat)", () => {
  const d = rentStabilityDetail(null, 5.1);
  assert.equal(d.interpretation, "");
  assert.equal(d.tone, "neutral");
  assert.match(d.definition, /steadier pricing/);
});

test("concessionDetail: well above market median → watch", () => {
  const d = concessionDetail(9.1, 3.7);
  assert.equal(d.tone, "watch");
  assert.match(d.interpretation, /9\.1% of trailing-12-month listings/);
  assert.match(d.interpretation, /3\.7% market median/);
});
