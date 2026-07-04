import test from "node:test";
import { strict as assert } from "node:assert";
import { scoreLabel, metricLabels, operatingPerformanceLabel, compositePercentile, strongestAndWatch } from "./labels";
import type { ScorecardData } from "@/lib/types";

test("scoreLabel maps percentile bands (>=75/50/25) with boundaries", () => {
  assert.equal(scoreLabel(90), "strong");
  assert.equal(scoreLabel(75), "strong");   // boundary is inclusive
  assert.equal(scoreLabel(74.9), "good");
  assert.equal(scoreLabel(50), "good");
  assert.equal(scoreLabel(49.9), "neutral");
  assert.equal(scoreLabel(25), "neutral");
  assert.equal(scoreLabel(24.9), "watch");
  assert.equal(scoreLabel(0), "watch");
});

test("scoreLabel treats null/undefined as insufficient", () => {
  assert.equal(scoreLabel(null), "insufficient");
  assert.equal(scoreLabel(undefined), "insufficient");
});

// Minimal ScorecardData fixture — only the fields these functions read.
function fixture(overrides: any = {}): ScorecardData {
  return {
    rank: {
      percentiles: { dom: 80, tenancy: 55, rentPerformance: 20, marketing: null, communityVisibility: null },
      percentilesMulti: { composite: { primary: 68, primaryCohortN: 40, fallback: null, fallbackCohortN: null, msa: 62, msaCohortN: 120 } },
      compositeCohortUsedForStar: "primary",
      ...(overrides.rank ?? {}),
    },
    ...overrides,
  } as unknown as ScorecardData;
}

test("metricLabels maps each metric percentile to a label", () => {
  const m = metricLabels(fixture());
  assert.equal(m.dom, "strong");         // 80
  assert.equal(m.tenancy, "good");       // 55
  assert.equal(m.rentPerformance, "watch"); // 20
  assert.equal(m.marketing, "insufficient"); // null
  assert.equal(m.communityVisibility, "insufficient"); // null
});

test("compositePercentile reads the cohort level used for the star", () => {
  assert.equal(compositePercentile(fixture()), 68); // primary
  assert.equal(
    compositePercentile(fixture({ rank: { percentiles: {}, percentilesMulti: { composite: { primary: 68, msa: 62 } }, compositeCohortUsedForStar: "msa" } })),
    62
  );
});

test("operatingPerformanceLabel uses the composite percentile band", () => {
  assert.equal(operatingPerformanceLabel(fixture()), "good"); // 68 -> good
});

test("operatingPerformanceLabel is insufficient when no composite percentile", () => {
  assert.equal(
    operatingPerformanceLabel(fixture({ rank: { percentiles: {}, percentilesMulti: {}, compositeCohortUsedForStar: undefined } })),
    "insufficient"
  );
});

test("strongestAndWatch splits strengths (strong>good) from watch, ignoring insufficient", () => {
  const sw = strongestAndWatch(fixture());
  // dom=strong, tenancy=good, rentPerformance=watch, marketing/cv=insufficient
  assert.deepEqual(sw.strongest, ["dom", "tenancy"]); // strong before good
  assert.deepEqual(sw.watch, ["rentPerformance"]);
});
