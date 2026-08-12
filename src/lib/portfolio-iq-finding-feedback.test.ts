import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isFindingFeedbackRating,
  summarizeFindingFeedback,
  suppressesFinding,
} from "./portfolio-iq/finding-feedback";

test("only a useful rating leaves a finding in the owner's queue", () => {
  assert.equal(suppressesFinding("useful"), false);
  assert.equal(suppressesFinding("already_known"), true);
  assert.equal(suppressesFinding("wrong_context"), true);
});

test("feedback summary separates utility, noise, and context quality", () => {
  const summary = summarizeFindingFeedback([
    { rating: "useful" },
    { rating: "already_known" },
    { rating: "immaterial" },
    { rating: "duplicate" },
    { rating: "wrong_context" },
  ]);
  assert.deepEqual(summary, {
    rated: 5,
    useful: 1,
    alreadyKnown: 1,
    noise: 2,
    contextErrors: 1,
    usefulRate: 0.2,
    validContextRate: 0.8,
  });
});

test("unknown feedback values are rejected", () => {
  assert.equal(isFindingFeedbackRating("useful"), true);
  assert.equal(isFindingFeedbackRating("hide_everywhere"), false);
});

test("feedback storage is additive and isolated from Operator IQ", () => {
  const migration = readFileSync("prisma/migrations/20260811190000_portfolio_iq_finding_feedback/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "PortfolioIqFindingFeedback"/);
  assert.match(migration, /"userId" TEXT NOT NULL/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "PropertyManager"|ALTER TABLE "CanonicalOperator"|ALTER TABLE "WatchList"/);
});

test("Today applies feedback by owner and context errors enter the correction queue", () => {
  const loader = readFileSync("src/lib/portfolio-iq/today.server.ts", "utf8");
  const action = readFileSync("src/app/today/feedback-actions.ts", "utf8");
  assert.match(loader, /portfolioId: portfolio\.id, userId: input\.userId/);
  assert.match(loader, /!feedbackBySignalId\.get\(signal\.id\)\?\.suppressFromQueue/);
  assert.match(action, /rating === "wrong_context"/);
  assert.match(action, /objectType: "finding_feedback"/);
  assert.match(action, /assignedLane: "data_ops"/);
});
