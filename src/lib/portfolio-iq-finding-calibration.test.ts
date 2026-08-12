import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calibrationAdjustmentFor, recommendFindingCalibrations } from "@/lib/portfolio-iq/finding-calibration";

function feedback(signalType: string, ratings: string[]) {
  return ratings.map((rating) => ({ rating, signal: { signalType } }));
}

test("calibration waits for a minimum feedback sample", () => {
  assert.deepEqual(recommendFindingCalibrations(feedback("rent_softening", ["useful", "useful"])), []);
});

test("repeated context errors propose a bounded demotion", () => {
  const [proposal] = recommendFindingCalibrations(feedback("rent_softening", ["wrong_context", "wrong_context", "useful", "useful"]));
  assert.equal(proposal.proposedScoreAdjustment, -15);
  assert.equal(proposal.contextErrorCount, 2);
  assert.match(proposal.rationale, /50%/);
});

test("strong usefulness proposes a small promotion", () => {
  const [proposal] = recommendFindingCalibrations(feedback("listing_velocity", ["useful", "useful", "useful", "immaterial"]));
  assert.equal(proposal.proposedScoreAdjustment, 5);
  assert.equal(proposal.usefulRate, 0.75);
});

test("only approved adjustment values can enter ranking and they remain bounded", () => {
  assert.equal(calibrationAdjustmentFor({ signalType: "rent_softening", category: "market" }, new Map([["signal_type:rent_softening", 50]])), 15);
  assert.equal(calibrationAdjustmentFor({ signalType: "other", category: "market" }, new Map()), 0);
});

test("calibration migration is additive and leaves Operator IQ untouched", () => {
  const migration = readFileSync("prisma/migrations/20260812010000_portfolio_iq_feedback_calibration/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "PortfolioIqFindingCalibration"/);
  assert.match(migration, /CREATE TABLE "PortfolioIqCalibrationProposal"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "PropertyManager"|ALTER TABLE "CanonicalOperator"|ALTER TABLE "WatchList"/);
});

test("admin calibration is approval-gated and measures only feedback after the last approval", () => {
  const actions = readFileSync("src/app/admin/portfolio-activation/actions.ts", "utf8");
  assert.match(actions, /item\.reviewedAt > current\.approvedAt/);
  assert.match(actions, /decision === "reject"/);
  assert.match(actions, /portfolioIqFindingCalibration\.upsert/);
  assert.doesNotMatch(readFileSync("src/app/today/feedback-actions.ts", "utf8"), /portfolioIqFindingCalibration\.(create|update|upsert)/);
});
