import assert from "node:assert/strict";
import test from "node:test";
import { monitoringStatus, parseDecisionBaseline, parseMonitoringWindow } from "@/lib/portfolio-iq/decision-case";

test("decision case accepts only supported monitoring windows", () => {
  assert.equal(parseMonitoringWindow("30"), 30);
  assert.equal(parseMonitoringWindow("15"), null);
  assert.equal(parseMonitoringWindow("nope"), null);
});

test("decision baseline parser fails closed on malformed or future shapes", () => {
  assert.equal(parseDecisionBaseline("not json"), null);
  assert.equal(parseDecisionBaseline(JSON.stringify({ version: 2, sources: [], signal: {} })), null);
});

test("monitoring state distinguishes plan setup, due work, and resolution", () => {
  const now = new Date("2026-08-10T12:00:00Z");
  assert.equal(monitoringStatus({ state: "open", dueAt: null, baselineCapturedAt: null, now }), "not_started");
  assert.equal(monitoringStatus({ state: "acknowledged", dueAt: new Date("2026-08-12"), baselineCapturedAt: now, now }), "monitoring");
  assert.equal(monitoringStatus({ state: "acknowledged", dueAt: new Date("2026-08-09"), baselineCapturedAt: now, now }), "due");
  assert.equal(monitoringStatus({ state: "resolved", dueAt: null, baselineCapturedAt: now, now }), "resolved");
});

test("decision-case migration is additive and does not alter Operator IQ tables", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile("prisma/migrations/20260810280000_portfolio_iq_decision_cases/migration.sql", "utf8");
  assert.match(sql, /ALTER TABLE "PortfolioIqSignalDecision"/);
  assert.doesNotMatch(sql, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|DROP TABLE|DROP COLUMN/);
});
