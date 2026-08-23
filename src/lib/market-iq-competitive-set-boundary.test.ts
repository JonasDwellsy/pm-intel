import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const matching = readFileSync("src/lib/market-iq/daily-watchlists.ts", "utf8");
const delivery = readFileSync("src/lib/market-iq/daily-watchlist-delivery.server.ts", "utf8");
const picker = readFileSync("src/components/market-iq/report/MarketIqCompetitiveSetMapPicker.tsx", "utf8");
const brief = readFileSync("src/lib/market-iq/competitive-set-brief.ts", "utf8");
const briefPage = readFileSync("src/app/market-iq/competitive-sets/[watchlistId]/page.tsx", "utf8");
const reportAction = readFileSync("src/app/market-iq/report/actions.ts", "utf8");

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
  assert.doesNotMatch(`${matching}\n${picker}\n${brief}`, /MarketIqTrendPoint|alerts\.ts|monthly/i);
});

test("competitive-set briefs read persisted Daily Editions and never query the live listing source", () => {
  assert.match(briefPage, /loadMarketIqDailyEditionArchive/);
  assert.doesNotMatch(`${brief}\n${briefPage}`, /dwellsy-source|listing-events\.server|dwellsy_prod|\$queryRaw/);
});

test("client report publication rebuilds selected competitive evidence from authorized archive records", () => {
  assert.match(reportAction, /loadMarketIqCompetitiveSetWatchlist/);
  assert.match(reportAction, /loadMarketIqDailyEditionArchive/);
  assert.match(reportAction, /buildMarketIqCompetitiveSetReportSection/);
  assert.doesNotMatch(reportAction, /formData\.get\(["']competitiveSetHeadline|formData\.get\(["']observedAt/);
});
