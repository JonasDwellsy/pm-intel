import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyListingFeedChanges, listingFeedEventCounts } from "@/lib/market-iq/listing-feed";

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

test("manual refresh is preview-gated and token-authenticated", () => {
  const route = readFileSync("src/app/api/market-iq/source/dwellsy/refresh/route.ts", "utf8");
  assert.match(route, /marketIqPreviewEnabled/);
  assert.match(route, /MARKET_IQ_IMPORT_TOKEN/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /runClevelandListingFeed/);
  const runner = readFileSync("src/lib/market-iq/listing-feed-run.server.ts", "utf8");
  assert.match(runner, /MAXIMUM_SOURCE_AGE_MS/);
  assert.match(runner, /MINIMUM_PRIOR_COVERAGE/);
});
