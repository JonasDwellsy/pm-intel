import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyMarketIqBriefingEmailCandidate } from "./briefing-email-orchestrator";

test("dry-run classification respects delivery and workspace safeguards", () => {
  assert.equal(classifyMarketIqBriefingEmailCandidate({ organizationExcluded: true, snapshotId: "one", deliveryStatus: null }).status, "excluded");
  assert.equal(classifyMarketIqBriefingEmailCandidate({ organizationExcluded: false, snapshotId: null, deliveryStatus: null }).status, "no_archive");
  assert.equal(classifyMarketIqBriefingEmailCandidate({ organizationExcluded: false, snapshotId: "one", deliveryStatus: "sent" }).status, "already_sent");
  assert.equal(classifyMarketIqBriefingEmailCandidate({ organizationExcluded: false, snapshotId: "one", deliveryStatus: "sending" }).status, "in_progress");
  assert.equal(classifyMarketIqBriefingEmailCandidate({ organizationExcluded: false, snapshotId: "one", deliveryStatus: "failed" }).status, "retry_requires_click");
  assert.equal(classifyMarketIqBriefingEmailCandidate({ organizationExcluded: false, snapshotId: "one", deliveryStatus: null }).status, "would_send");
});

test("internal briefing scheduler is additive, authenticated, and dry-run only", async () => {
  const [migration, service, route, vercel] = await Promise.all([
    readFile("prisma/migrations/20260818160000_market_iq_internal_briefing_dry_run/migration.sql", "utf8"),
    readFile("src/lib/market-iq/briefing-email-orchestrator.server.ts", "utf8"),
    readFile("src/app/api/cron/market-iq-internal-briefing/route.ts", "utf8"),
    readFile("vercel.json", "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE "MarketIqBriefingEmailRun"/);
  assert.match(migration, /CREATE TABLE "MarketIqBriefingEmailRunItem"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|MarketIqReportRecipient|MarketIqReportSend/);
  assert.match(service, /dryRun: true/);
  assert.doesNotMatch(service, /sendEmail|deliverMarketIqBriefingEmail|marketIqReportRecipient|marketIqDistributionCampaign/);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /marketIqPreviewEnabled/);
  assert.match(vercel, /api\/cron\/market-iq-internal-briefing/);
});
