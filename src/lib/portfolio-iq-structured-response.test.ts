import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assessmentLabel, monitoringDays, parsePmAssessment, parsePmRecommendation, recommendationLabel } from "@/lib/portfolio-iq/pm-response";
import { implementationStatusLabel, outcomeNextDecisionLabel, parseImplementationStatus, parseOutcomeNextDecision } from "@/lib/portfolio-iq/outcome-capture";

test("structured PM response fields reject unknown values and retain decision language", () => {
  assert.equal(parsePmAssessment("partially_agree"), "partially_agree");
  assert.equal(parsePmAssessment("maybe"), null);
  assert.equal(parsePmRecommendation("reduce_pricing"), "reduce_pricing");
  assert.equal(parsePmRecommendation("cut everything"), null);
  assert.match(assessmentLabel("partially_agree"), /context is missing/);
  assert.match(recommendationLabel("refresh_marketing"), /Refresh listing/);
});

test("PM follow-up timing becomes a bounded monitoring window", () => {
  assert.equal(monitoringDays(new Date("2026-08-11T00:00:00Z"), new Date("2026-09-10T00:00:00Z")), 30);
  assert.equal(monitoringDays(new Date("2026-08-11T00:00:00Z"), new Date("2026-08-10T00:00:00Z")), 1);
  assert.equal(monitoringDays(new Date("2026-01-01T00:00:00Z"), new Date("2028-01-01T00:00:00Z")), 365);
});

test("outcome capture routes implementation and next-decision values", () => {
  assert.equal(parseImplementationStatus("partially_completed"), "partially_completed");
  assert.equal(parseOutcomeNextDecision("escalate"), "escalate");
  assert.equal(parseOutcomeNextDecision("ignore"), null);
  assert.match(implementationStatusLabel("completed"), /Completed/);
  assert.match(outcomeNextDecisionLabel("close"), /Close/);
});

test("structured response migration is additive and isolated from Operator IQ", async () => {
  const sql = await readFile("prisma/migrations/20260811200000_portfolio_iq_structured_pm_outcomes/migration.sql", "utf8");
  assert.match(sql, /ALTER TABLE "PortfolioIqPmBriefResponse"/);
  assert.match(sql, /ALTER TABLE "PortfolioIqOutcomeReview"/);
  assert.doesNotMatch(sql, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|DROP TABLE|DROP COLUMN/);
});

test("an accepted PM plan freezes a decision baseline and requested revisions can return", async () => {
  const [ownerAction, pmAction, collaboration] = await Promise.all([
    readFile("src/app/portfolio-iq/collaboration-actions.ts", "utf8"),
    readFile("src/app/pm-briefs/actions.ts", "utf8"),
    readFile("src/lib/portfolio-iq/collaboration.server.ts", "utf8"),
  ]);
  assert.match(ownerAction, /buildDecisionBaseline/);
  assert.match(ownerAction, /baselineEvidence/);
  assert.match(ownerAction, /successMeasure/);
  assert.match(ownerAction, /status: "published"/);
  assert.match(pmAction, /ownerDisposition === "revised"/);
  assert.match(pmAction, /revisionCount: \{ increment: 1 \}/);
  assert.match(collaboration, /ownerDisposition === "revised"/);
});

test("outcome capture records implementation and routes the next decision", async () => {
  const [source, loader] = await Promise.all([
    readFile("src/app/portfolio-iq/outcomes/actions.ts", "utf8"),
    readFile("src/lib/portfolio-iq/outcome-review.server.ts", "utf8"),
  ]);
  assert.match(source, /implementationStatus/);
  assert.match(source, /nextDecision/);
  assert.match(source, /nextDecision === "close" \? "resolved" : "acknowledged"/);
  assert.match(source, /outcome_\$\{nextDecision\}/);
  assert.match(loader, /decision\.state === "resolved" \? latestReview : latestReview\?\.periodKey === currentPeriodKey/);
});
