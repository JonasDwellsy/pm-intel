import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyListingFeedChanges, listingFeedEventCounts } from "@/lib/market-iq/listing-feed";
import {
  marketIqListingFeedStaleBefore,
  MARKET_IQ_LISTING_FEED_STALE_AFTER_MS,
  scheduledMarketIqListingFeedOperationKey,
} from "@/lib/market-iq/listing-feed-reliability";

function listing(id: string, propertyId: string, rent: number) {
  return {
    sourceListingId: id,
    sourcePropertyId: propertyId,
    askingRent: rent,
    propertyType: "apartment",
    city: "Cleveland",
    postalCode: "44113",
    sourceUpdatedAt: new Date("2026-08-14T00:00:00.000Z"),
  };
}

test("the first complete snapshot establishes a baseline without fabricating events", () => {
  const events = classifyListingFeedChanges({ previous: [], current: [listing("1", "10", 1200)], baseline: true });
  assert.deepEqual(events, []);
});

test("listing changes distinguish new, relisted, reactivated, rent, and deactivation events", () => {
  const events = classifyListingFeedChanges({
    previous: [listing("1", "10", 1200), listing("2", "20", 1400), listing("3", "30", 1600)],
    current: [listing("1", "10", 1250), listing("4", "40", 1300), listing("5", "20", 1450), listing("6", "60", 1500)],
    historicallySeenListingIds: new Set(["6"]),
    historicallySeenPropertyIds: new Set(["20", "60"]),
  });
  assert.deepEqual(events.map((event) => event.eventType).sort(), [
    "deactivated",
    "deactivated",
    "new",
    "price_change",
    "reactivated",
    "relisted",
  ]);
  const priceChange = events.find((event) => event.eventType === "price_change");
  assert.equal(priceChange?.previousRent, 1200);
  assert.equal(priceChange?.currentRent, 1250);
  assert.deepEqual(listingFeedEventCounts(events), {
    newCount: 1,
    relistedCount: 1,
    reactivatedCount: 1,
    priceChangeCount: 1,
    deactivatedCount: 2,
  });
});

test("Dwellsy production connector is bounded, qualified, and forced read-only", () => {
  const db = readFileSync("src/lib/dwellsy-source/db.server.ts", "utf8");
  const source = readFileSync("src/lib/dwellsy-source/active-listings.server.ts", "utf8");
  assert.match(db, /default_transaction_read_only=on/);
  assert.match(db, /BEGIN READ ONLY/);
  assert.doesNotMatch(db, /process\.env\.DATABASE_URL\b/);
  assert.match(source, /FROM dwellsy_prod\.active_listing_table/);
  assert.match(source, /msa_code = \$1::bigint/);
  assert.match(source, /CLEVELAND_MSA_CODE = "17460"/);
  assert.match(source, /property_category IN \('Apartment', 'House'\)/);
  assert.doesNotMatch(source, /INSERT|UPDATE|DELETE|TRUNCATE/);
});

test("live-feed migration is additive and isolated from Operator IQ", () => {
  const migration = readFileSync(
    "prisma/market-iq/migrations/20260814000000_live_dwellsy_listing_feed/migration.sql",
    "utf8"
  );
  assert.match(migration, /CREATE TABLE "MarketIqListingFeedRun"/);
  assert.match(migration, /CREATE TABLE "MarketIqLiveListingSnapshot"/);
  assert.match(migration, /CREATE TABLE "MarketIqListingEvent"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "PM"|ALTER TABLE "PortfolioIq"/);
});

test("daily supply history is additive, isolated, and written with a successful feed run", () => {
  const migration = readFileSync(
    "prisma/market-iq/migrations/20260821000000_market_iq_listing_supply_snapshots/migration.sql",
    "utf8"
  );
  assert.match(migration, /CREATE TABLE "MarketIqListingSupplySnapshot"/);
  assert.match(migration, /UNIQUE INDEX "MarketIqListingSupplySnapshot_marketId_snapshotDate_key"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "PM"|ALTER TABLE "PortfolioIq"/);

  const runner = readFileSync("src/lib/market-iq/listing-feed-run.server.ts", "utf8");
  assert.match(runner, /marketIqListingSupplySnapshot\.upsert/);
  assert.match(runner, /marketId_snapshotDate/);
  assert.match(runner, /summarizeDailyActiveListingSupply/);
});

test("manual refresh is preview-gated and token-authenticated", () => {
  const route = readFileSync("src/app/api/market-iq/source/dwellsy/refresh/route.ts", "utf8");
  assert.match(route, /marketIqPreviewEnabled/);
  assert.match(route, /MARKET_IQ_SOURCE_REFRESH_TOKEN/);
  assert.match(route, /MARKET_IQ_IMPORT_TOKEN/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /runClevelandListingFeed/);
  const runner = readFileSync("src/lib/market-iq/listing-feed-run.server.ts", "utf8");
  assert.match(runner, /MARKET_IQ_LISTING_FEED_MAX_SOURCE_AGE_MS/);
  assert.match(runner, /MINIMUM_PRIOR_COVERAGE/);
});

test("scheduled listing refreshes use one stable operation key per UTC day", () => {
  const marketId = "cleveland-elyria-mentor-oh";
  assert.equal(
    scheduledMarketIqListingFeedOperationKey({ marketId, now: new Date("2026-08-22T00:00:01.000Z") }),
    scheduledMarketIqListingFeedOperationKey({ marketId, now: new Date("2026-08-22T23:59:59.000Z") }),
  );
  assert.notEqual(
    scheduledMarketIqListingFeedOperationKey({ marketId, now: new Date("2026-08-22T23:59:59.000Z") }),
    scheduledMarketIqListingFeedOperationKey({ marketId, now: new Date("2026-08-23T00:00:00.000Z") }),
  );
});

test("listing refresh leases expire after a bounded ten-minute interval", () => {
  const now = new Date("2026-08-22T21:00:00.000Z");
  assert.equal(MARKET_IQ_LISTING_FEED_STALE_AFTER_MS, 10 * 60 * 1_000);
  assert.equal(marketIqListingFeedStaleBefore(now).toISOString(), "2026-08-22T20:50:00.000Z");
});

test("database constraints and conditional persistence close overlap and interrupted-run races", () => {
  const migration = readFileSync(
    "prisma/market-iq/migrations/20260822220000_listing_feed_run_coordination/migration.sql",
    "utf8",
  );
  const runner = readFileSync("src/lib/market-iq/listing-feed-run.server.ts", "utf8");
  assert.match(migration, /UNIQUE INDEX "MarketIqListingFeedRun_operationKey_key"/);
  assert.match(migration, /UNIQUE INDEX "MarketIqListingFeedRun_one_loading_per_market_key"/);
  assert.match(migration, /WHERE "status" = 'loading'/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "PM"|ALTER TABLE "PortfolioIq"/);
  assert.match(runner, /startedAt: \{ lt: staleBefore \}/);
  assert.match(runner, /where: \{ id: run\.id, status: "loading" \}/);
  assert.match(runner, /lease was lost before persistence/);
  assert.ok(
    runner.indexOf("const completed = await transaction.marketIqListingFeedRun.updateMany")
      < runner.indexOf("await transaction.marketIqLiveListingSnapshot.createMany"),
  );
});

test("token automation is scheduled while browser-admin refreshes remain manual", () => {
  const route = readFileSync("src/app/api/market-iq/source/dwellsy/refresh/route.ts", "utf8");
  assert.match(route, /tokenAuthorized && !adminAuthorized \? "scheduled" : "manual"/);
  assert.match(route, /scheduledMarketIqListingFeedOperationKey/);
  assert.match(route, /startedBy: adminAuthorized \? userId! : "listing-feed-automation"/);
  assert.match(route, /status: "already_running"/);
  assert.match(route, /"Retry-After": "30"/);
});

test("an authenticated preview administrator can capture daily supply without a token", () => {
  const readiness = readFileSync("src/app/market-iq/internal/readiness/page.tsx", "utf8");
  const route = readFileSync("src/app/api/market-iq/source/dwellsy/refresh/route.ts", "utf8");
  assert.match(readiness, /action="\/api\/market-iq\/source\/dwellsy\/refresh"/);
  assert.match(readiness, /Capture today&apos;s listing supply/);
  assert.match(readiness, /marketIqListingSupplySnapshot\.findFirst/);
  assert.match(route, /await auth\(\)/);
  assert.match(route, /isAdminUser\(userId\)/);
  assert.match(route, /marketIqReportSourceRefreshEnabled\(process\.env\)/);
  assert.match(route, /adminAuthorized \? userId! : "listing-feed-automation"/);
  assert.match(route, /readiness\?supply=stored/);
});
