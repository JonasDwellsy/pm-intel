import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const matching = readFileSync("src/lib/market-iq/daily-watchlists.ts", "utf8");
const delivery = readFileSync("src/lib/market-iq/daily-watchlist-delivery.server.ts", "utf8");
const picker = readFileSync("src/components/market-iq/report/MarketIqCompetitiveSetMapPicker.tsx", "utf8");

test("interactive and delivered competitive sets share one watchlist matcher", () => {
  assert.match(matching, /competitiveSetMatches/);
  assert.match(delivery, /matchMarketIqDailyWatchlist/);
  assert.doesNotMatch(delivery, /marketIqDistanceMiles|haversine|radiusMiles\s*[<>=]/);
});

test("competitive-set matching uses retained source coordinates without geocoding", () => {
  assert.match(matching, /headline\.event\.latitude/);
  assert.match(matching, /headline\.event\.longitude/);
  assert.doesNotMatch(`${matching}\n${picker}`, /geocod|MapboxGeocoder|api\.mapbox\.com\/geocoding/i);
});

test("competitive-set modules remain isolated from monthly trend contracts", () => {
  assert.doesNotMatch(`${matching}\n${picker}`, /MarketIqTrendPoint|alerts\.ts|monthly/i);
});
