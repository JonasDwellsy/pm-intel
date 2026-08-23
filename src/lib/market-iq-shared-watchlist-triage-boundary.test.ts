import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260823030000_market_iq_shared_watchlists_triage/migration.sql", "utf8");
const actions = readFileSync("src/app/market-iq/daily/actions.ts", "utf8");
const loader = readFileSync("src/lib/market-iq/daily-watchlists.server.ts", "utf8");
const delivery = readFileSync("src/lib/market-iq/daily-watchlist-delivery.server.ts", "utf8");

test("sharing stays private by default and organization-scoped", () => {
  assert.match(schema, /visibility\s+String\s+@default\("private"\)/);
  assert.match(loader, /organizationId: input\.organizationId/);
  assert.match(loader, /OR: \[\{ userId: input\.userId \}, \{ visibility: "organization" \}\]/);
  assert.match(actions, /organizationId: context\.organizationId, marketId, visibility: "organization"/);
});

test("followers receive separate match rows and delivery requires an active follow", () => {
  assert.match(schema, /@@unique\(\[watchlistId, userId, eventKey\]\)/);
  assert.match(delivery, /watchlist\.subscriptions\.map/);
  assert.match(delivery, /subscriptions: \{ some: \{ userId: preference\.userId \} \}/);
  assert.doesNotMatch(delivery, /dwellsy-source|listing-events\.server/);
});

test("triage writes require a recipient match and current organization membership", () => {
  assert.match(actions, /where: \{ id: matchId, organizationId, userId \}/);
  assert.match(actions, /match\.watchlist\.userId !== userId && match\.watchlist\.visibility !== "organization"/);
  assert.match(actions, /organizationMembership\.findUnique/);
  assert.match(actions, /watchlistId_eventKey/);
});

test("the migration is additive apart from replacing the match uniqueness index", () => {
  assert.match(migration, /ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private'/);
  assert.match(migration, /CREATE TABLE "MarketIqDailyWatchlistSubscription"/);
  assert.match(migration, /CREATE TABLE "MarketIqDailyWatchlistTriage"/);
  assert.match(migration, /CREATE TABLE "MarketIqDailyWatchlistNote"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/);
});
