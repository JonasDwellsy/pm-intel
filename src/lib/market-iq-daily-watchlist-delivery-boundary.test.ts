import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync("src/lib/market-iq/daily-watchlist-delivery.server.ts", "utf8");
const route = readFileSync("src/app/api/market-iq/daily-watchlist-delivery/route.ts", "utf8");
const actions = readFileSync("src/app/market-iq/daily/actions.ts", "utf8");
const migration = readFileSync("prisma/migrations/20260823010000_market_iq_daily_watchlist_delivery/migration.sql", "utf8");

test("personal matching reads persisted Daily Editions and never imports a live listing source", () => {
  assert.match(server, /loadMarketIqDailyEditionArchive/);
  assert.doesNotMatch(server, /dwellsy-source|listing-events\.server|trends\.server/);
});

test("the machine endpoint owns constant-time bearer authentication", () => {
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /MARKET_IQ_SOURCE_REFRESH_TOKEN/);
  assert.match(route, /appOrigin: new URL\(request\.url\)\.origin/);
});

test("preference and read actions remain scoped to the active organization and user", () => {
  assert.match(actions, /getActiveOrgContext/);
  assert.match(actions, /organizationId_userId: \{ organizationId, userId \}/);
  assert.match(actions, /organizationId, userId \}, data: \{ readAt/);
  assert.match(actions, /beginsEmailDelivery/);
  assert.match(server, /observedAt: \{ gt: preference\.lastDeliveredAt \}/);
});

test("delivery persistence is additive and tied to organization and watchlist ownership", () => {
  assert.match(migration, /CREATE TABLE "MarketIqDailyDeliveryPreference"/);
  assert.match(migration, /CREATE TABLE "MarketIqDailyWatchlistMatch"/);
  assert.match(migration, /CREATE TABLE "MarketIqDailyWatchlistDelivery"/);
  assert.match(migration, /REFERENCES "MarketIqDailyWatchlist"\("id"\) ON DELETE CASCADE/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/);
});
