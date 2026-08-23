import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("interactive market overview reads persisted supply and cannot import the live Dwellsy listing source", async () => {
  const adapters = await source("src/lib/market-iq/data/adapters.server.ts");
  const persisted = await source("src/lib/market-iq/persisted-listing-supply.server.ts");
  const overview = await source("src/app/market-iq/market/page.tsx");
  assert.match(adapters, /loadPersistedMarketListingPulse/);
  assert.match(persisted, /marketIqListingSupplySnapshot\.findFirst/);
  assert.doesNotMatch(adapters, /live-listings|dwellsy-source/);
  assert.doesNotMatch(persisted, /dwellsy-source|active_listing_table/);
  assert.doesNotMatch(overview, /dwellsy-source|live-listings/);
});

test("nightly automation captures national supply and detailed launched-market events before delivery", async () => {
  const workflow = await source(".github/workflows/market-iq-source-staleness.yml");
  for (const marketId of [
    "cleveland-elyria-mentor-oh",
    "columbus-oh",
    "san-francisco-oakland-berkeley-ca",
    "san-jose-sunnyvale-santa-clara-ca",
  ]) assert.match(workflow, new RegExp(marketId));
  assert.match(workflow, /SUPPLY_REFRESH_URL.*source\/dwellsy\/refresh/);
  assert.ok(workflow.indexOf("Capture national supply history before markets launch") < workflow.indexOf("Capture detailed listing events for launched markets"));
  assert.ok(workflow.indexOf("Capture detailed listing events for launched markets") < workflow.indexOf("Materialize and deliver personal watchlist matches"));
});

test("the source capture route and runner resolve market identity instead of assuming Cleveland", async () => {
  const route = await source("src/app/api/market-iq/source/dwellsy/refresh/route.ts");
  const runner = await source("src/lib/market-iq/listing-feed-run.server.ts");
  assert.match(route, /getMarketIqMarket\(requestedMarketId\)/);
  assert.match(route, /runMarketIqListingFeed/);
  assert.match(runner, /loadMarketActiveListings\(input\.market\.cbsaCode\)/);
  assert.match(runner, /marketId: input\.market\.id/);
  assert.doesNotMatch(runner, /CLEVELAND_MARKET_ID|loadClevelandActiveListings/);
});

test("unavailable supply and stale report shapes remain render-safe", async () => {
  const component = await source("src/components/market-iq/MarketIqIntelligenceWorkspace.tsx");
  assert.match(component, /listingSupplyHistory = \[\]/);
  assert.match(component, /listingSync\.listingAgeBuckets \?\? \[\]/);
  assert.match(component, /report\.marketRead\.unavailableCuts \?\? \[\]/);
  assert.match(component, /persisted snapshot read was attempted/);
});
