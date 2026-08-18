import assert from "node:assert/strict";
import test from "node:test";
import {
  CLEVELAND_MARKET_ID,
  COLUMBUS_MARKET_ID,
  MARKET_IQ_MARKETS,
  SAN_FRANCISCO_MARKET_ID,
  getMarketIqMarket,
  listEntitledMarketIqMarkets,
} from "@/data/market-iq/markets";
import { ALL_MARKETS } from "@/lib/auth/market-entitlements";
import { resolveActiveMarketIqMarket } from "@/lib/market-iq/markets/selection";

test("the Market IQ registry has unique deployed IDs, slugs, and CBSA codes", () => {
  assert.equal(MARKET_IQ_MARKETS.length, 4);
  assert.equal(new Set(MARKET_IQ_MARKETS.map((market) => market.id)).size, MARKET_IQ_MARKETS.length);
  assert.equal(new Set(MARKET_IQ_MARKETS.map((market) => market.slug)).size, MARKET_IQ_MARKETS.length);
  assert.equal(new Set(MARKET_IQ_MARKETS.map((market) => market.cbsaCode)).size, MARKET_IQ_MARKETS.length);
  assert.deepEqual(MARKET_IQ_MARKETS.map((market) => market.cbsaCode), ["17460", "18140", "41860", "41940"]);
});

test("Cleveland and Columbus have live market adapters", () => {
  const liveMarkets = MARKET_IQ_MARKETS.filter((market) => market.status === "live");
  assert.deepEqual(liveMarkets.map((market) => market.id), [CLEVELAND_MARKET_ID, COLUMBUS_MARKET_ID]);
  assert.equal(getMarketIqMarket(COLUMBUS_MARKET_ID)?.cbsaCode, "18140");
});

test("the San Francisco registry entry preserves the deployed entitlement ID", () => {
  const market = getMarketIqMarket(SAN_FRANCISCO_MARKET_ID);
  assert.equal(market?.cbsaCode, "41860");
  assert.equal(market?.shortLabel, "San Francisco");
});

test("the registry filters markets to the organization entitlement", () => {
  const markets = listEntitledMarketIqMarkets(new Set([CLEVELAND_MARKET_ID, COLUMBUS_MARKET_ID]));
  assert.deepEqual(markets.map((market) => market.id), [CLEVELAND_MARKET_ID, COLUMBUS_MARKET_ID]);
  assert.equal(listEntitledMarketIqMarkets(ALL_MARKETS).length, 4);
});

test("an explicit entitled market wins over the saved preference", () => {
  const market = resolveActiveMarketIqMarket({
    requestedMarketId: COLUMBUS_MARKET_ID,
    preferredMarketId: CLEVELAND_MARKET_ID,
    entitlement: ALL_MARKETS,
  });
  assert.equal(market?.id, COLUMBUS_MARKET_ID);
});

test("an unknown or unauthorized request falls back without leaking another market", () => {
  const entitlement = new Set(["san-jose-sunnyvale-santa-clara-ca"]);
  const market = resolveActiveMarketIqMarket({
    requestedMarketId: CLEVELAND_MARKET_ID,
    preferredMarketId: "not-a-market",
    entitlement,
  });
  assert.equal(market?.id, "san-jose-sunnyvale-santa-clara-ca");
  assert.equal(resolveActiveMarketIqMarket({ entitlement: new Set() }), null);
});
