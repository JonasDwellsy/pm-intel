import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOutcomeComparison } from "@/lib/portfolio-iq/outcome-review";
import type { DecisionBaselineSnapshot } from "@/lib/portfolio-iq/decision-case";

const baseline: DecisionBaselineSnapshot = {
  version: 1,
  capturedAt: "2026-08-01T00:00:00.000Z",
  signal: { headline: "Review pricing", narrative: "Test", category: "performance", severity: "medium", confidence: "high", observedAt: "2026-07-31T00:00:00.000Z", evidence: "{}" },
  asset: { name: "Acadian Apartments", city: "Brook Park", postalCode: "44142", observedOperatorName: null },
  sources: ["historical_export"],
  property: { availableThrough: "2026-07-31T23:59:59.999Z", askingRent: 1055, askingRentChange90d: 2.1, medianDom: 30, observationCount: 12, compStatus: "locked", compCount: 4 },
  operator: null,
};

test("outcome review withholds current metrics when the source cutoff is unchanged", () => {
  const review = buildOutcomeComparison({ baseline, actionPlan: "Review pricing", successMeasure: "Recheck in 30 days", generatedAt: new Date("2026-08-10T00:00:00Z"), current: { availableThrough: "2026-07-31T23:59:59.999Z", askingRent: 1100, askingRentChange90d: 3, medianDom: 25, observationCount: 20 } });
  assert.equal(review.sourceHealth, "unchanged");
  assert.equal(review.metrics[0].current, null);
  assert.match(review.sourceMessage, /No outcome conclusion is supported/);
});

test("outcome review compares later evidence with the frozen baseline", () => {
  const review = buildOutcomeComparison({ baseline, actionPlan: "Review pricing", successMeasure: "Recheck in 30 days", generatedAt: new Date("2026-09-02T00:00:00Z"), current: { availableThrough: "2026-08-31T23:59:59.999Z", askingRent: 1080, askingRentChange90d: 2.5, medianDom: 27, observationCount: 16 } });
  assert.equal(review.sourceHealth, "healthy");
  assert.equal(review.metrics[0].delta, 25);
  assert.equal(review.metrics[2].delta, -3);
});
