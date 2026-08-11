import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildPmBriefEmail } from "@/lib/portfolio-iq/pm-email";
import { buildPortfolioIqPmBriefSnapshot } from "@/lib/portfolio-iq/pm-brief";

function snapshot() {
  return buildPortfolioIqPmBriefSnapshot({
    publishedAt: new Date("2026-08-11T12:00:00.000Z"),
    property: { name: "Acadian Apartments", canonicalAddress: "21480 Sheldon Rd", suppliedAddress: "21480 Sheldon Road", city: "Brook Park", state: "OH", postalCode: "44142", assetType: "multifamily" },
    signal: { headline: "Two-bedroom rent needs review", narrative: "Observed asking rent differs from reviewed comps.", ownerQuestion: "What operating context explains the difference?", severity: "high", observedAt: new Date("2026-07-31T00:00:00.000Z") },
    performance: { askingRent: 1200, askingRentChange90d: -3.4, medianDom: 42, observationCount: 12, compAskingRent: 1100, askingRentVsComps: 9.1 },
    availableThrough: new Date("2026-07-31T23:59:59.999Z"), compStatus: "locked", compCount: 4, marketContext: null, ownerNote: null, responseDueAt: new Date("2026-08-18T23:59:59.999Z"),
  });
}

test("PM delivery email preserves the one-property privacy boundary", () => {
  const message = buildPmBriefEmail({ recipientName: "Avery", propertyName: "Acadian Apartments", ownerName: "Cleveland Pilot Owner", snapshot: snapshot(), briefUrl: "https://preview.example/pm-briefs/token" });
  assert.match(message.subject, /Acadian Apartments/);
  assert.match(message.html, /Review and respond/);
  assert.match(message.text, /does not expose the owner's other assets or Operator IQ rankings/);
  assert.doesNotMatch(JSON.stringify(message), /overallRank|leaseUpDom|t12Listings/);
});

test("PM send requires explicit recipient confirmation and is idempotent after delivery", async () => {
  const source = await readFile("src/app/portfolio-iq/collaboration-actions.ts", "utf8");
  assert.match(source, /confirmDelivery.*=== "yes"/);
  assert.match(source, /brief\.deliveryStatus === "sent"/);
  assert.match(source, /validEmail\(recipientEmail\)/);
  assert.match(source, /sendEmail/);
});

test("reminders stop after a response, are capped, and respect a cooldown", async () => {
  const source = await readFile("src/lib/portfolio-iq/pm-reminders.server.ts", "utf8");
  assert.match(source, /response: null/);
  assert.match(source, /reminderCount: \{ lt: 2 \}/);
  assert.match(source, /lastReminderAt/);
  assert.match(source, /dryRun/);
});

test("collaboration migration is additive and leaves Operator IQ untouched", async () => {
  const sql = await readFile("prisma/migrations/20260811080000_portfolio_iq_collaboration_center/migration.sql", "utf8");
  assert.match(sql, /ALTER TABLE "PortfolioIqPmBrief"/);
  assert.match(sql, /ownerDisposition/);
  assert.doesNotMatch(sql, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|DROP TABLE|DROP COLUMN/);
});

test("PM response becomes an in-app owner review item without automatic owner email", async () => {
  const [responseAction, collaboration] = await Promise.all([
    readFile("src/app/pm-briefs/actions.ts", "utf8"),
    readFile("src/lib/portfolio-iq/collaboration.server.ts", "utf8"),
  ]);
  assert.doesNotMatch(responseAction, /sendEmail|SENDGRID/);
  assert.match(collaboration, /ownerDisposition === "pending"/);
});

test("accepted or owner-revised PM plans enter the monitored decision case", async () => {
  const source = await readFile("src/app/portfolio-iq/collaboration-actions.ts", "utf8");
  assert.match(source, /actionPlan: adoptedPlan/);
  assert.match(source, /pm_plan_\$\{disposition\}/);
  assert.match(source, /revalidatePath\(`\/today\/cases\/\$\{brief\.signalId\}`\)/);
});
