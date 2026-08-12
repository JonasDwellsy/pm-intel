import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPilotValueReview, parsePilotValueReview, pilotValueReviewKey } from "@/lib/portfolio-iq/pilot-value-review";

function review(overrides: Partial<Parameters<typeof buildPilotValueReview>[0]> = {}) {
  return buildPilotValueReview({
    generatedAt: "2026-08-12T12:00:00.000Z",
    periodStart: "2026-07-13T12:00:00.000Z",
    periodEnd: "2026-08-12T12:00:00.000Z",
    portfolio: { id: "portfolio-1", name: "Cleveland Owner Pilot", marketId: "cleveland-oh", assetCount: 6 },
    successGoal: "Identify asset issues early and create accountable PM follow-through.",
    adoption: { authorizedUsers: 2, workspaceUsers: 1, workspaceViews: 8, latestViewAt: "2026-08-11T12:00:00.000Z", deliveredBriefings: 3, observedClicks: 2 },
    findings: { surfaced: 7, rated: 4, useful: 3, usefulRate: 0.75 },
    decisions: { opened: 2, active: 2, actionPlans: 2, loopsClosed: 1, attentionNow: 1 },
    collaboration: { pmResponses: 2, acceptedPlans: 1, medianResponseDays: 2.5 },
    outcomes: { reviewed: 1, improved: 1, worsened: 0, inconclusive: 0, implementationConfirmed: 1 },
    financial: { askingRentPriority: 22000, financiallyPrioritizedAssets: 2, actionLinkedPriority: 14000 },
    unresolved: [{ label: "Decisions needing attention", count: 1, href: "/portfolio-iq/decision-ledger" }],
    ...overrides,
  });
}

test("pilot review leads with reviewed outcomes when available", () => {
  const snapshot = review();
  assert.match(snapshot.executiveHeadline, /improved asking-market position/);
  assert.match(snapshot.executiveSummary, /3 useful findings/);
  assert.match(snapshot.evidenceBoundary, /not occupancy, signed-lease, effective-rent, NOI, or realized-revenue/);
});

test("pilot review recommends the missing next step without inventing value", () => {
  const snapshot = review({ findings: { surfaced: 2, rated: 0, useful: 0, usefulRate: null }, decisions: { opened: 0, active: 0, actionPlans: 0, loopsClosed: 0, attentionNow: 0 }, collaboration: { pmResponses: 0, acceptedPlans: 0, medianResponseDays: null }, outcomes: { reviewed: 0, improved: 0, worsened: 0, inconclusive: 0, implementationConfirmed: 0 }, unresolved: [] });
  assert.match(snapshot.executiveHeadline, /not yet produced/);
  assert.ok(snapshot.nextMonthPlan.some((item) => /first prioritized finding/.test(item)));
  assert.ok(snapshot.nextMonthPlan.some((item) => /documented owner decision/.test(item)));
});

test("review keys are stable within a calendar day and snapshots parse fail-closed", () => {
  const first = review();
  const later = { ...first, generatedAt: "2026-08-12T20:00:00.000Z", periodEnd: "2026-08-12T20:00:00.000Z" };
  assert.equal(pilotValueReviewKey(first), pilotValueReviewKey(later));
  assert.deepEqual(parsePilotValueReview(JSON.stringify(first)), first);
  assert.equal(parsePilotValueReview('{"version":2}'), null);
});

test("pilot value review storage is additive, tenant-scoped, and printable", () => {
  const migration = readFileSync("prisma/migrations/20260812080000_portfolio_iq_pilot_value_review/migration.sql", "utf8");
  const server = readFileSync("src/lib/portfolio-iq/pilot-value-review.server.ts", "utf8");
  const page = readFileSync("src/app/portfolio-iq/reports/pilot-review/page.tsx", "utf8");
  assert.match(migration, /CREATE TABLE "PortfolioIqPilotValueReview"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "PropertyManager"|ALTER TABLE "CanonicalOperator"|ALTER TABLE "WatchList"/);
  assert.match(server, /organizationId: input\.organizationId/);
  assert.match(page, /PrintOwnerBriefingButton/);
  assert.match(page, /Lock this review/);
});
