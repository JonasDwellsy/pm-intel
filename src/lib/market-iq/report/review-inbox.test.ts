import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PM review inbox audit fields are additive and Market IQ only", async () => {
  const migration = await readFile("prisma/migrations/20260817050000_market_iq_review_inbox/migration.sql", "utf8");
  assert.match(migration, /ALTER TABLE "MarketIqEditionDraft"/);
  assert.match(migration, /"reviewStartedAt"/);
  assert.match(migration, /"dismissalReason"/);
  assert.doesNotMatch(migration, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|ALTER TABLE "PortfolioIq|DROP TABLE|DROP COLUMN/);
});

test("review inbox actions remain outside publication and delivery", async () => {
  const actions = await readFile("src/app/market-iq/review/actions.ts", "utf8");
  assert.match(actions, /ensureRecurringMarketIqEditionDraft/);
  assert.match(actions, /status: "reviewing"/);
  assert.match(actions, /status: "dismissed"/);
  assert.doesNotMatch(actions, /marketIqReport\.create|marketIqDistributionCampaign\.create|marketIqReportSend\.create|sendgrid|sendMarketIq/);
});

test("review inbox exposes source history and an explicit safe retry", async () => {
  const page = await readFile("src/app/market-iq/review/page.tsx", "utf8");
  assert.match(page, /Review the next client edition/);
  assert.match(page, /Recent source checks/);
  assert.match(page, /Check authoritative source now/);
  assert.match(page, /No report is published and no email is sent/);
});

test("review inbox keeps drafts isolated by selected market", async () => {
  const [page, actions] = await Promise.all([
    readFile("src/app/market-iq/review/page.tsx", "utf8"),
    readFile("src/app/market-iq/review/actions.ts", "utf8"),
  ]);
  assert.match(page, /resolveActiveMarketIqMarket/);
  assert.match(page, /marketId: activeMarket\.id/);
  assert.match(actions, /isMarketEntitled\(context\.entitlement, draft\.marketId\)/);
  assert.match(actions, /ensureRecurringMarketIqEditionDraft\(context\.organizationId, marketId\)/);
});
