import assert from "node:assert/strict";
import test from "node:test";
import { marketIqAlertMatchesWatchlist, parseMarketIqWatchlistInput } from "./watchlists";

const marketId = "cleveland-elyria-mentor-oh";

test("normalizes a city watchlist", () => {
  const result = parseMarketIqWatchlistInput(
    {
      name: "  East side apartments ",
      marketId,
      geographyType: "city",
      geographyValues: ["Cleveland Heights", "Cleveland Heights", "Shaker Heights"],
      propertyTypes: ["apartment"],
      bedroomCounts: [2, 1, 2],
      alertsEnabled: true,
      alertCadence: "weekly",
    },
    marketId
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.name, "East side apartments");
  assert.deepEqual(result.value.geographyValues, ["Cleveland Heights", "Shaker Heights"]);
  assert.deepEqual(result.value.bedroomCounts, [1, 2]);
});

test("fails closed for another market", () => {
  const result = parseMarketIqWatchlistInput(
    {
      name: "Other market",
      marketId: "columbus-oh",
      geographyType: "msa",
      geographyValues: [],
      propertyTypes: ["house"],
      bedroomCounts: [],
      alertsEnabled: true,
      alertCadence: "daily",
    },
    marketId
  );
  assert.deepEqual(result, { ok: false, error: "Market is not available." });
});

test("requires a value for city and zip scopes", () => {
  const result = parseMarketIqWatchlistInput(
    {
      name: "Empty cities",
      marketId,
      geographyType: "city",
      geographyValues: [],
      propertyTypes: ["apartment", "house"],
      bedroomCounts: [],
      alertsEnabled: false,
      alertCadence: "monthly",
    },
    marketId
  );
  assert.equal(result.ok, false);
});

test("matches alerts against geography and product scope", () => {
  const watchlist = {
    id: "watch-1",
    name: "Lakewood one-bed apartments",
    marketId,
    geographyType: "city" as const,
    geographyValues: ["Lakewood, OH"],
    propertyTypes: ["apartment" as const],
    bedroomCounts: [1],
    alertsEnabled: true,
    alertCadence: "weekly" as const,
    updatedAt: "2026-08-10T00:00:00.000Z",
  };
  assert.equal(marketIqAlertMatchesWatchlist({
    geographyType: "city",
    geographyValue: "Lakewood, OH",
    propertyType: "apartment",
    bedrooms: 1,
  }, watchlist), true);
  assert.equal(marketIqAlertMatchesWatchlist({
    geographyType: "city",
    geographyValue: "Lakewood, OH",
    propertyType: "house",
    bedrooms: 1,
  }, watchlist), false);
});
