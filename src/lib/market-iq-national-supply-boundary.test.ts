import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("national supply is one grouped read-only extraction rather than one full feed per market", async () => {
  const sourceAdapter = await source("src/lib/dwellsy-source/national-listing-supply.server.ts");
  assert.match(sourceAdapter, /withDwellsyReadOnly/);
  assert.match(sourceAdapter, /FROM dwellsy_prod\.active_listing_table/);
  assert.match(sourceAdapter, /GROUP BY msa_code/);
  assert.match(sourceAdapter, /JOIN dwellsy_prod\.msa_table/);
  assert.match(sourceAdapter, /FROM dwellsy_prod\.msa_city_table/);
  assert.doesNotMatch(sourceAdapter, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  assert.doesNotMatch(sourceAdapter, /MarketIqLiveListingSnapshot|listingEventFingerprint/);
});

test("national snapshots are additive and isolated from customer and operator data", async () => {
  const schema = await source("prisma/market-iq/schema.prisma");
  const migration = await source("prisma/market-iq/migrations/20260823180000_national_supply_snapshots/migration.sql");
  assert.match(schema, /model MarketIqNationalSupplySnapshot/);
  assert.match(schema, /@@unique\(\[cbsaCode, snapshotDate\]\)/);
  assert.match(migration, /CREATE TABLE "MarketIqNationalSupplySnapshot"/);
  assert.doesNotMatch(migration, /ALTER TABLE|DROP TABLE|MarketIqLiveListingSnapshot|WatchList|Organization/);
});

test("nightly automation captures the national history before launched-market events and delivery", async () => {
  const workflow = await source(".github/workflows/market-iq-source-staleness.yml");
  const national = workflow.indexOf("Capture national supply history before markets launch");
  const detailed = workflow.indexOf("Capture detailed listing events for launched markets");
  const delivery = workflow.indexOf("Materialize and deliver personal watchlist matches");
  assert.match(workflow, /NATIONAL_SUPPLY_REFRESH_URL.*national-supply/);
  assert.ok(national > 0 && national < detailed && detailed < delivery);
  assert.match(workflow, /response\.totalMarkets > 4/);
  assert.match(workflow, /response\.eligibleMarkets >= 4/);
  assert.match(workflow, /response\.trackedMarketCount === 25/);
  assert.match(workflow, /response\.trackedMarketsObserved === 25/);
});

test("the national capture endpoint is machine-authenticated and preview-gated", async () => {
  const route = await source("src/app/api/market-iq/source/dwellsy/national-supply/route.ts");
  const protectedRoutes = await source("src/lib/auth/protected-routes.ts");
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /marketIqReportSourceRefreshEnabled\(process\.env\)/);
  assert.match(route, /marketIqDatabaseConfigured\(\)/);
  assert.match(route, /dwellsySourceConfigured\(\)/);
  assert.match(route, /runNationalListingSupplyCapture\(\)/);
  assert.doesNotMatch(route, /auth\(\)|isAdminUser|GET\(/);
  assert.match(protectedRoutes, /\/api\/market-iq\/source\/dwellsy\/national-supply/);
});

test("national capture diagnostics expose response shape without exposing its body", async () => {
  const workflow = await source(".github/workflows/market-iq-source-staleness.yml");
  assert.match(workflow, /%\{http_code\}\\t%\{content_type\}/);
  assert.match(workflow, /Response bytes:/);
  assert.match(workflow, /body withheld/);
  assert.doesNotMatch(workflow, /console\.(?:error|log)\(responseText/);
});

test("future launched markets read national history by CBSA without a live source call", async () => {
  const pulse = await source("src/lib/market-iq/persisted-listing-supply.server.ts");
  const history = await source("src/lib/market-iq/listing-supply-history.server.ts");
  const adapter = await source("src/lib/market-iq/data/adapters.server.ts");
  assert.match(pulse, /marketIqNationalSupplySnapshot\.findFirst/);
  assert.match(pulse, /cbsaCode: input\.cbsaCode/);
  assert.match(history, /marketIqNationalSupplySnapshot\.findMany/);
  assert.match(adapter, /cbsaCode: market\.cbsaCode/);
  assert.doesNotMatch(pulse, /dwellsy-source|active_listing_table/);
  assert.doesNotMatch(history, /dwellsy-source|active_listing_table/);
});

test("a first observation renders current composition instead of empty chart panels", async () => {
  const component = await source("src/components/market-iq/MarketIqIntelligenceWorkspace.tsx");
  assert.match(component, /hasSupplyTrend = listingSupplyHistory\.length >= 2/);
  assert.match(component, /Current inventory mix/);
  assert.match(component, /Current active listing age/);
  assert.match(component, /hasSupplyTrend \? <SupplyTrendLine/);
});

test("the national response reports coverage for the explicit 25-market cohort", async () => {
  const manifest = await source("src/data/market-iq/tracked-markets.ts");
  const runner = await source("src/lib/market-iq/national-listing-supply-run.server.ts");
  assert.equal((manifest.match(/cbsaCode:/g) ?? []).length, 25);
  assert.match(runner, /MARKET_IQ_TRACKED_MARKETS/);
  assert.match(runner, /trackedMarketsObserved/);
  assert.match(runner, /trackedEligibleMarkets/);
});
