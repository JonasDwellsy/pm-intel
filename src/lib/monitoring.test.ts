import assert from "node:assert/strict";
import test from "node:test";
import type { LaunchBriefingSnapshot } from "@/lib/portfolio-iq/launch-briefing";
import { comparePortfolioSnapshots, portfolioWeekKey } from "@/lib/portfolio-iq/monitoring";

function snapshot(overrides: Partial<LaunchBriefingSnapshot> = {}): LaunchBriefingSnapshot {
  return {
    version: 1,
    generatedAt: "2026-08-01T00:00:00.000Z",
    sourceAvailableThrough: "2026-07-31",
    portfolio: { id: "portfolio", name: "Pilot", marketId: "cleveland-oh", assetCount: 1, buildingCount: 1 },
    executiveRead: "Baseline",
    readiness: { monitoring: 1, matched: 1, uruCovered: 1, compsLocked: 1, openTasks: 0 },
    market: { heading: "Market", narrative: "Narrative", historicalRead: null, sourceLabel: "Through July" },
    decisions: [],
    assets: [{ id: "asset", slug: "acadian", name: "Acadian", location: "Brook Park, OH", product: "Multifamily", buildings: 1, readinessStatus: "monitoring", matchStatus: "matched", uruStatus: "observed", compStatus: "locked", observationCount: 20, askingRent: 1000, askingRentVsComps: 1, observedOperatorName: "Operator A", operatorStatus: "matched", operatorRank: "#20 of 70" }],
    exceptions: [],
    ...overrides,
  };
}

test("monitoring comparison detects material rent, supply, and comp movement", () => {
  const baseline = snapshot();
  const current = snapshot({
    generatedAt: "2026-08-10T00:00:00.000Z",
    assets: [{ ...baseline.assets[0], askingRent: 1060, observationCount: 30, askingRentVsComps: 7 }],
  });
  const result = comparePortfolioSnapshots(baseline, current);
  assert.deepEqual(result.changes.slice(0, 3).map((change) => change.category).sort(), ["comps", "rent", "supply"]);
  assert.equal(result.materialCount, 3);
  assert.equal(result.highPriorityCount, 3);
  assert.equal(result.affectedAssetCount, 1);
});

test("monitoring comparison suppresses ordinary metric noise", () => {
  const baseline = snapshot();
  const current = snapshot({ assets: [{ ...baseline.assets[0], askingRent: 1010, observationCount: 22, askingRentVsComps: 2 }] });
  const result = comparePortfolioSnapshots(baseline, current);
  assert.equal(result.materialCount, 0);
  assert.equal(result.changes.length, 0);
});

test("monitoring comparison labels readiness changes without treating them as performance", () => {
  const baseline = snapshot();
  const current = snapshot({ assets: [{ ...baseline.assets[0], uruStatus: "partial" }] });
  const result = comparePortfolioSnapshots(baseline, current);
  assert.equal(result.changes[0]?.category, "readiness");
  assert.equal(result.changes[0]?.severity, "info");
  assert.match(result.changes[0]?.narrative ?? "", /not a performance conclusion/);
});

test("monitoring week keys are stable at ISO year boundaries", () => {
  assert.equal(portfolioWeekKey(new Date("2026-08-10T12:00:00.000Z")), "2026-W33");
  assert.equal(portfolioWeekKey(new Date("2027-01-01T12:00:00.000Z")), "2026-W53");
});

test("monitoring migration is additive and isolated from Operator IQ", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile("prisma/migrations/20260811050000_portfolio_iq_monitoring_snapshots/migration.sql", "utf8");
  assert.match(sql, /CREATE TABLE "PortfolioIqMonitoringSnapshot"/);
  assert.doesNotMatch(sql, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|DROP TABLE|DROP COLUMN/);
});
