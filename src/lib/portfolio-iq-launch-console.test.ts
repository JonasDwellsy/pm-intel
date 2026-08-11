import assert from "node:assert/strict";
import test from "node:test";
import { buildPilotLaunchAssetReadiness } from "@/lib/portfolio-iq/launch-console";

const asset = (overrides: Partial<Parameters<typeof buildPilotLaunchAssetReadiness>[0]> = {}) => ({
  id: "asset-1",
  matchStatus: "matched",
  uruStatus: "observed",
  compStatus: "locked",
  operatorMatched: true,
  sourceAvailableThrough: new Date("2026-07-31T00:00:00Z"),
  sourceHealth: "healthy",
  signals: [],
  ...overrides,
});

test("a fully activated property supports market, comp, and operator conclusions", () => {
  const result = buildPilotLaunchAssetReadiness(asset());
  assert.equal(result.supportLevel, "full");
  assert.equal(result.readinessPercent, 100);
  assert.equal(result.compEligible, true);
  assert.equal(result.operatorEligible, true);
});

test("a matched property can support market context before comps and URUs are ready", () => {
  const result = buildPilotLaunchAssetReadiness(asset({ uruStatus: "unknown", compStatus: "proposed", operatorMatched: false }));
  assert.equal(result.supportLevel, "market_only");
  assert.equal(result.marketEligible, true);
  assert.equal(result.compEligible, false);
  assert.equal(result.nextTaskType, "issue_uru");
});

test("unavailable source evidence fails closed and routes to setup", () => {
  const result = buildPilotLaunchAssetReadiness(asset({ sourceHealth: "unavailable" }));
  assert.equal(result.supportLevel, "setup");
  assert.equal(result.marketEligible, false);
  assert.match(result.nextAction, /Restore or advance/);
});

test("finding counts use the same evidence gates as Today", () => {
  const result = buildPilotLaunchAssetReadiness(asset({ signals: [
    { id: "today", assetId: "asset-1", category: "market", severity: "medium", confidence: "high", rankScore: 80, evidence: "{}" },
    { id: "watch", assetId: "asset-1", category: "performance", severity: "medium", confidence: "medium", rankScore: 70, evidence: "{}" },
    { id: "setup", assetId: "asset-1", category: "readiness", severity: "info", confidence: "setup", rankScore: 40, evidence: "{}" },
  ] }));
  assert.deepEqual(result.findingCounts, { today: 1, watchlist: 1, setup: 1 });
});
