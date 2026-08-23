import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = process.cwd();

async function source(path: string) {
  return readFile(`${root}/${path}`, "utf8");
}

test("competitive signal migration is additive and keeps rules personal", async () => {
  const migration = await source("prisma/migrations/20260823160000_market_iq_competitive_set_signal_rules/migration.sql");
  assert.match(migration, /CREATE TABLE "MarketIqCompetitiveSetSignalRule"/);
  assert.match(migration, /"userId" TEXT NOT NULL/);
  assert.match(migration, /FOREIGN KEY \("watchlistId"\)/);
  assert.doesNotMatch(migration, /\b(?:DROP\s+(?:TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE)\b/i);
});

test("signal evaluation uses archived Daily Editions and never reads or recomputes live source data", async () => {
  const materializer = await source("src/lib/market-iq/daily-watchlist-delivery.server.ts");
  assert.match(materializer, /loadMarketIqDailyEditionArchive/);
  assert.match(materializer, /buildMarketIqCompetitiveSetBrief/);
  assert.match(materializer, /evaluation\.observedAt/);
  assert.match(materializer, /evidenceEventKeys/);
  assert.doesNotMatch(materializer, /dwellsy-source|dwellsy_prod|listing-events\.server/);
});

test("comparison signals are gated by complete retained evidence", async () => {
  const rules = await source("src/lib/market-iq/competitive-set-signal-rules.ts");
  assert.match(rules, /!input\.brief\.comparison\.available \|\| !input\.brief\.prior7d\.complete/);
  assert.match(rules, /!currentPeriod\.complete/);
  assert.doesNotMatch(rules, /new Date\(\)\.toISOString/);
});

test("rule actions authorize organization, user, access, and follow state", async () => {
  const actions = await source("src/app/market-iq/competitive-sets/actions.ts");
  assert.match(actions, /organizationId/);
  assert.match(actions, /userId/);
  assert.match(actions, /isFollowing/);
  assert.match(actions, /marketIqCompetitiveSetSignalRule\.(?:upsert|deleteMany)/);
});
