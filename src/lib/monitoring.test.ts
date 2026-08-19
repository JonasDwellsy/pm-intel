import assert from "node:assert/strict";
import test from "node:test";
import type { LaunchBriefingSnapshot } from "@/lib/portfolio-iq/launch-briefing";
import { classifyMonitoringSourceHealth, comparePortfolioSnapshots, monitoringChangeSignalDraft, portfolioWeekKey, selectAlertableMonitoringChanges } from "@/lib/portfolio-iq/monitoring";

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

test("source health fails closed when evidence is missing or unchanged", () => {
  assert.equal(classifyMonitoringSourceHealth(null, "2026-07-31"), "unavailable");
  assert.equal(classifyMonitoringSourceHealth("2026-07-31", "2026-07-31"), "unchanged");
  assert.equal(classifyMonitoringSourceHealth("2026-08-07", "2026-07-31"), "healthy");
});

test("unchanged source periods cannot create or resolve performance alerts", () => {
  const baseline = snapshot();
  const current = snapshot({
    assets: [{ ...baseline.assets[0], askingRent: 1100, observedOperatorName: "Operator B" }],
  });
  const comparison = comparePortfolioSnapshots(baseline, current);
  assert.deepEqual(selectAlertableMonitoringChanges(comparison, "unchanged").map((change) => change.category), ["operator"]);
  assert.deepEqual(selectAlertableMonitoringChanges(comparison, "unavailable").map((change) => change.category), ["operator"]);
  assert.deepEqual(selectAlertableMonitoringChanges(comparison, "healthy").map((change) => change.category).sort(), ["operator", "rent"]);
});

test("derived decision changes never create recursive monitoring signals", () => {
  const baseline = snapshot();
  const current = snapshot({ decisions: [{ signalId: "new-signal", assetSlug: "acadian", assetName: "Acadian", severity: "high", headline: "New decision", narrative: "A signal-backed decision.", ownerQuestion: "Who owns it?" }] });
  const comparison = comparePortfolioSnapshots(baseline, current);
  assert.equal(comparison.changes[0]?.category, "decision");
  assert.deepEqual(selectAlertableMonitoringChanges(comparison, "healthy"), []);
});

test("monitoring changes create stable, source-labelled signal drafts", () => {
  const baseline = snapshot();
  const current = snapshot({ assets: [{ ...baseline.assets[0], askingRent: 1060 }] });
  const change = comparePortfolioSnapshots(baseline, current).changes[0];
  const draft = monitoringChangeSignalDraft({ portfolioId: "portfolio", baselineGeneratedAt: baseline.generatedAt, current, change, sourceHealth: "healthy" });
  assert.equal(draft.fingerprint, `portfolio:monitoring:${change.key}`);
  assert.equal(draft.signalType, "baseline_change_rent");
  assert.equal(JSON.parse(draft.evidence).sourceHealth, "healthy");
  assert.equal(JSON.parse(draft.evidence).baselineGeneratedAt, baseline.generatedAt);
});

test("monitoring migration is additive and isolated from Operator IQ", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile("prisma/migrations/20260811050000_portfolio_iq_monitoring_snapshots/migration.sql", "utf8");
  assert.match(sql, /CREATE TABLE "PortfolioIqMonitoringSnapshot"/);
  assert.doesNotMatch(sql, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|DROP TABLE|DROP COLUMN/);
});

test("monitoring-run migration and cron remain isolated and authenticated", async () => {
  const { readFile } = await import("node:fs/promises");
  const [sql, route, vercel, watchServer] = await Promise.all([
    readFile("prisma/migrations/20260811060000_portfolio_iq_monitoring_runs/migration.sql", "utf8"),
    readFile("src/app/api/cron/portfolio-iq-monitoring/route.ts", "utf8"),
    readFile("vercel.ts", "utf8"),
    readFile("src/lib/portfolio-iq/watch.server.ts", "utf8"),
  ]);
  assert.match(sql, /CREATE TABLE "PortfolioIqMonitoringRun"/);
  assert.doesNotMatch(sql, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|DROP TABLE|DROP COLUMN/);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /Bearer/);
  assert.match(vercel, /portfolio-iq-monitoring/);
  assert.match(watchServer, /monitoring:/);
  assert.match(watchServer, /NOT:/);
});
