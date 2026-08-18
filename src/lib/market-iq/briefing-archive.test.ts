import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("briefing archive migration is additive and Market IQ only", async () => {
  const migration = await readFile("prisma/migrations/20260818150000_market_iq_briefing_archive/migration.sql", "utf8");
  assert.match(migration, /CREATE TABLE "MarketIqBriefingSnapshot"/);
  assert.match(migration, /UNIQUE INDEX "MarketIqBriefingSnapshot_organizationId_weekOf_key"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|ALTER TABLE "PortfolioIq/);
});

test("freezing is idempotent and cannot send or publish", async () => {
  const actions = await readFile("src/app/market-iq/briefing/actions.ts", "utf8");
  assert.match(actions, /marketIqBriefingSnapshot\.upsert/);
  assert.match(actions, /organizationId_weekOf/);
  assert.match(actions, /update: \{\}/);
  assert.doesNotMatch(actions, /sendEmail|sendMarketIq|marketIqReport\.create|marketIqDistributionCampaign\.create/);
});
