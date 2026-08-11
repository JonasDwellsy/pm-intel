import assert from "node:assert/strict";
import test from "node:test";
import { launchReadinessPercent, parseLaunchBriefingSnapshot, type LaunchBriefingSnapshot } from "@/lib/portfolio-iq/launch-briefing";

const snapshot: LaunchBriefingSnapshot = {
  version: 1,
  generatedAt: "2026-08-11T00:00:00.000Z",
  sourceAvailableThrough: "2026-07-31",
  portfolio: { id: "portfolio", name: "Pilot", marketId: "cleveland", assetCount: 2, buildingCount: 3 },
  executiveRead: "Pilot baseline.",
  readiness: { monitoring: 1, matched: 2, uruCovered: 1, compsLocked: 0, openTasks: 4 },
  market: { heading: "Market", narrative: "Narrative", historicalRead: null, sourceLabel: "Through July" },
  decisions: [],
  assets: [],
  exceptions: [],
};

test("launch briefing parser preserves only the supported snapshot version", () => {
  assert.deepEqual(parseLaunchBriefingSnapshot(JSON.stringify(snapshot)), snapshot);
  assert.equal(parseLaunchBriefingSnapshot(JSON.stringify({ ...snapshot, version: 2 })), null);
  assert.equal(parseLaunchBriefingSnapshot("not json"), null);
});

test("launch readiness measures the four evidence gates per asset", () => {
  assert.equal(launchReadinessPercent(snapshot), 50);
});

test("launch briefing migration is additive and isolated from Operator IQ", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile("prisma/migrations/20260811040000_portfolio_iq_launch_briefing/migration.sql", "utf8");
  assert.match(sql, /CREATE TABLE "PortfolioIqLaunchBriefing"/);
  assert.doesNotMatch(sql, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|DROP TABLE|DROP COLUMN/);
});
