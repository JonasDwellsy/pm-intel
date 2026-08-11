import assert from "node:assert/strict";
import test from "node:test";
import { buildPortfolioIqPmBriefSnapshot, parsePortfolioIqPmBriefSnapshot } from "@/lib/portfolio-iq/pm-brief";

function build(compStatus = "locked") {
  return buildPortfolioIqPmBriefSnapshot({
    publishedAt: new Date("2026-08-11T12:00:00.000Z"),
    property: { name: "Acadian Apartments", canonicalAddress: "21480 Sheldon Rd", suppliedAddress: "21480 Sheldon Road", city: "Brook Park", state: "OH", postalCode: "44142", assetType: "multifamily" },
    signal: { headline: "Two-bedroom rent needs review", narrative: "Observed asking rent differs from reviewed comps.", ownerQuestion: "What operating context explains the difference?", severity: "high", observedAt: new Date("2026-07-31T00:00:00.000Z") },
    performance: { askingRent: 1200, askingRentChange90d: -3.4, medianDom: 42, observationCount: 12, compAskingRent: 1100, askingRentVsComps: 9.1 },
    availableThrough: new Date("2026-07-31T23:59:59.999Z"),
    compStatus,
    compCount: 4,
    marketContext: { headline: "Local supply increased", narrative: "New advertised listings increased in the latest source period." },
    ownerNote: "Please provide property-level context.",
    responseDueAt: new Date("2026-08-18T23:59:59.999Z"),
  });
}

test("PM brief contains one property and no owner-only Operator IQ context", () => {
  const snapshot = build();
  const serialized = JSON.stringify(snapshot);
  assert.equal(snapshot.property.name, "Acadian Apartments");
  assert.equal(snapshot.issue.headline, "Two-bedroom rent needs review");
  assert.doesNotMatch(serialized, /overallRank|leaseUpDom|t12Listings|Operator IQ|portfolioId|portfolioName|other assets/i);
});

test("PM brief exposes comp conclusions only after the set is locked", () => {
  const snapshot = build("proposed");
  assert.equal(snapshot.evidence.compCount, 0);
  assert.equal(snapshot.evidence.compAskingRent, null);
  assert.equal(snapshot.evidence.askingRentVsComps, null);
});

test("PM brief parser rejects malformed and future snapshots", () => {
  const snapshot = build();
  assert.deepEqual(parsePortfolioIqPmBriefSnapshot(JSON.stringify(snapshot)), snapshot);
  assert.equal(parsePortfolioIqPmBriefSnapshot(JSON.stringify({ ...snapshot, version: 2 })), null);
  assert.equal(parsePortfolioIqPmBriefSnapshot("bad json"), null);
});

test("PM collaboration migration is additive and isolated from Operator IQ", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = await readFile("prisma/migrations/20260811070000_portfolio_iq_pm_collaboration/migration.sql", "utf8");
  assert.match(sql, /CREATE TABLE "PortfolioIqPmBrief"/);
  assert.match(sql, /CREATE TABLE "PortfolioIqPmBriefResponse"/);
  assert.doesNotMatch(sql, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|DROP TABLE|DROP COLUMN/);
});

test("public PM response route is token-scoped and does not require workspace access", async () => {
  const { readFile } = await import("node:fs/promises");
  const [protectedRoutes, publicAction, ownerAction] = await Promise.all([
    readFile("src/lib/auth/protected-routes.ts", "utf8"),
    readFile("src/app/pm-briefs/actions.ts", "utf8"),
    readFile("src/app/portfolio-iq/pm-brief-actions.ts", "utf8"),
  ]);
  assert.doesNotMatch(protectedRoutes, /["']\/pm-briefs/);
  assert.match(publicAction, /publicToken/);
  assert.match(publicAction, /brief\.status !== "published"/);
  assert.match(publicAction, /honeypot/);
  assert.match(ownerAction, /randomBytes\(24\)/);
  assert.doesNotMatch(ownerAction, /sendEmail|SENDGRID/);
});
