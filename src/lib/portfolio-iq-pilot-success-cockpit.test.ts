import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPilotSuccess, type PilotSuccessInput } from "@/lib/portfolio-iq/pilot-success";

function input(overrides: Partial<PilotSuccessInput> = {}): PilotSuccessInput {
  return {
    now: new Date("2026-08-12T00:00:00Z"),
    createdAt: new Date("2026-08-01T00:00:00Z"),
    assetCount: 5,
    readyAssetCount: 5,
    acceptedAt: new Date("2026-08-05T00:00:00Z"),
    firstViewedAt: new Date("2026-08-06T00:00:00Z"),
    lastViewedAt: new Date("2026-08-11T00:00:00Z"),
    viewCount: 3,
    findingRatings: 1,
    usefulRatings: 1,
    decisionCount: 1,
    actionPlanCount: 1,
    pmBriefSentCount: 1,
    pmResponseCount: 1,
    outcomeCount: 1,
    digestDeliveredCount: 1,
    failedDeliveryCount: 0,
    openCorrectionCount: 0,
    ...overrides,
  };
}

test("a pilot with explicit usefulness and a closed loop is getting value", () => {
  const success = buildPilotSuccess(input());
  assert.equal(success.stage, "getting_value");
  assert.equal(success.score, 100);
  assert.equal(success.nextAction.label, "Maintain the weekly decision cadence");
});

test("a launched pilot with no first view for seven days is at risk", () => {
  const success = buildPilotSuccess(input({
    acceptedAt: new Date("2026-08-05T00:00:00Z"),
    firstViewedAt: null,
    lastViewedAt: null,
    viewCount: 0,
    findingRatings: 0,
    usefulRatings: 0,
    decisionCount: 0,
    actionPlanCount: 0,
    pmBriefSentCount: 0,
    pmResponseCount: 0,
    outcomeCount: 0,
    digestDeliveredCount: 0,
  }));
  assert.equal(success.stage, "at_risk");
  assert.match(success.nextAction.label, /first workspace review/);
});

test("next intervention follows the owner decision loop", () => {
  const success = buildPilotSuccess(input({ usefulRatings: 0, decisionCount: 0, actionPlanCount: 0, pmBriefSentCount: 0, pmResponseCount: 0, outcomeCount: 0, digestDeliveredCount: 0 }));
  assert.equal(success.stage, "engaged");
  assert.match(success.nextAction.label, /decision case/);
});

test("engagement storage and route are tenant-scoped and additive", () => {
  const migration = readFileSync("prisma/migrations/20260812050000_portfolio_iq_pilot_engagement/migration.sql", "utf8");
  const route = readFileSync("src/app/api/portfolio-iq/pilot-engagement/route.ts", "utf8");
  assert.match(migration, /CREATE TABLE "PortfolioIqPilotEngagement"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "PropertyManager"|ALTER TABLE "CanonicalOperator"|ALTER TABLE "WatchList"/);
  assert.match(route, /portfolio\.organizationId === organizationId/);
  assert.match(route, /portfolioId_userId/);
});
