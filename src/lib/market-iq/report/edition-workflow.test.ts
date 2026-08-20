import assert from "node:assert/strict";
import test from "node:test";
import { buildMarketIqEditionWorkflow } from "@/lib/market-iq/report/edition-workflow";
import type { MarketIqEditionComparison } from "@/lib/market-iq/report/report";
import { seededClevelandMarketReport } from "@/lib/market-iq/report/seeded-cleveland";

const comparison: MarketIqEditionComparison = { state: "unchanged", heading: "No material change", narrative: "Stable", priorReportId: "prior", priorPeriodLabel: "Prior", priorPublishedAt: null, findings: [] };

test("edition workflow recognizes a new source period", () => {
  const prior = { ...seededClevelandMarketReport, scope: { ...seededClevelandMarketReport.scope, periodEnd: "2026-06-30" } };
  const result = buildMarketIqEditionWorkflow({ current: seededClevelandMarketReport, prior, source: "dwellsy_trends", coverageCounts: { reportable: 4, stale: 0, unavailable: 0 }, comparison });
  assert.equal(result.state, "new_period");
  assert.equal(result.canPrepare, true);
});

test("edition workflow blocks an unavailable source from becoming a recurring client edition", () => {
  const result = buildMarketIqEditionWorkflow({ current: seededClevelandMarketReport, prior: null, source: "unavailable", coverageCounts: { reportable: 4, stale: 0, unavailable: 0 }, comparison: { ...comparison, state: "baseline" } });
  assert.equal(result.canPrepare, false);
  assert.equal(result.checks.find((check) => check.id === "source")?.status, "blocked");
});
