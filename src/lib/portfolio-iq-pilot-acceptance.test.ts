import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePilotReview, pilotAcceptanceProgress, pilotSupportLabel } from "@/lib/portfolio-iq/pilot-acceptance";

test("pilot review responses are constrained by object type", () => {
  assert.deepEqual(parsePilotReview({ objectType: "property", response: "confirmed", note: "" }), { objectType: "property", response: "confirmed", note: null });
  assert.equal(parsePilotReview({ objectType: "property", response: "useful", note: "" }), null);
  assert.equal(parsePilotReview({ objectType: "finding", response: "incorrect", note: "" }), null);
  assert.equal(parsePilotReview({ objectType: "finding", response: "incorrect", note: "Wrong comp" })?.note, "Wrong comp");
});

test("acceptance progress counts property, operator, finding, and final approval", () => {
  const progress = pilotAcceptanceProgress({
    assetIds: ["a1"], findingIds: ["f1"], accepted: false,
    reviews: [
      { objectType: "property", objectId: "a1", response: "confirmed" },
      { objectType: "operator", objectId: "a1", response: "incorrect" },
    ],
  });
  assert.deepEqual(progress, { completed: 2, total: 4, completedReviews: 2, totalReviews: 3, percent: 50, correctionCount: 1 });
});

test("support labels fail closed when identity is unresolved", () => {
  assert.equal(pilotSupportLabel({ matchStatus: "matched", uruStatus: "observed", compStatus: "locked", operatorStatus: "matched" }), "Full support");
  assert.equal(pilotSupportLabel({ matchStatus: "matched", uruStatus: "unknown", compStatus: "proposed", operatorStatus: "unresolved" }), "Market context");
  assert.equal(pilotSupportLabel({ matchStatus: "needs_review", uruStatus: "observed", compStatus: "locked", operatorStatus: "matched" }), "Setup required");
});

test("pilot migration is additive and isolated from Operator IQ", () => {
  const migration = readFileSync("prisma/migrations/20260811180000_portfolio_iq_pilot_acceptance/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "PortfolioIqPilotAcceptance"/);
  assert.match(migration, /CREATE TABLE "PortfolioIqPilotReview"/);
  assert.match(migration, /CREATE TABLE "PortfolioIqPilotCorrection"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "Pm"|ALTER TABLE "Scorecard"/);
});
