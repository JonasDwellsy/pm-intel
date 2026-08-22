import test from "node:test";
import { strict as assert } from "node:assert";
import {
  MARKET_IQ_APPLICATION_PATH,
  marketIqReturnToForMarket,
  marketIqSignInPath,
  safeMarketIqReturnTo,
} from "./entry";

test("Market IQ customer sign-in has one canonical application destination", () => {
  assert.equal(MARKET_IQ_APPLICATION_PATH, "/market-iq/daily");
  assert.equal(
    marketIqSignInPath(),
    "/sign-in?redirect_url=%2Fmarket-iq%2Fdaily"
  );
});

test("setup returns to the selected Market Intelligence market", () => {
  assert.equal(
    marketIqReturnToForMarket("/market-iq/daily", "cleveland-elyria-mentor-oh"),
    "/market-iq/daily?market=cleveland-elyria-mentor-oh"
  );
  assert.equal(
    marketIqReturnToForMarket("/market-iq/market", "cleveland-elyria-mentor-oh"),
    "/market-iq/market"
  );
});

test("Market IQ return destinations preserve safe local routes", () => {
  assert.equal(
    safeMarketIqReturnTo("/market-iq/daily?market=cleveland-elyria-mentor-oh"),
    "/market-iq/daily?market=cleveland-elyria-mentor-oh"
  );
  assert.equal(
    safeMarketIqReturnTo("/market-iq/market?market=cleveland-elyria-mentor-oh"),
    "/market-iq/market?market=cleveland-elyria-mentor-oh"
  );
  assert.equal(safeMarketIqReturnTo("/market-iq"), "/market-iq");
});

test("Market IQ return destinations reject external and lookalike paths", () => {
  for (const value of [
    undefined,
    null,
    "https://example.com/market-iq/daily",
    "//example.com/market-iq/daily",
    "/market-iq-operator",
    "/watch-lists",
  ]) {
    assert.equal(safeMarketIqReturnTo(value), MARKET_IQ_APPLICATION_PATH);
  }
});
