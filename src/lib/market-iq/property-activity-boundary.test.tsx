import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

const reader = readFileSync(resolve(process.cwd(), "src/lib/dwellsy-source/listing-events.server.ts"), "utf8");
const loader = readFileSync(resolve(process.cwd(), "src/lib/market-iq/property-activity.server.ts"), "utf8");
const route = readFileSync(resolve(process.cwd(), "src/app/market-iq/property/[propertyId]/page.tsx"), "utf8");
const propertyModule = readFileSync(resolve(process.cwd(), "src/lib/market-iq/property-activity.ts"), "utf8");
const dailyEvents = readFileSync(resolve(process.cwd(), "src/components/market-iq/report/MarketIqDailyEvents.tsx"), "utf8");
const explorer = readFileSync(resolve(process.cwd(), "src/components/market-iq/report/MarketIqDailyEventExplorer.tsx"), "utf8");
const map = readFileSync(resolve(process.cwd(), "src/components/market-iq/report/MarketIqDailyActivityMap.tsx"), "utf8");
const watchlists = readFileSync(resolve(process.cwd(), "src/components/market-iq/report/MarketIqDailyWatchlists.tsx"), "utf8");

describe("property activity boundary", () => {
  it("uses parent property identity for every active-listing event and exact property aggregates", () => {
    assert.match(reader, /listing\.parent_property_id AS property_id/);
    assert.match(reader, /COUNT\(DISTINCT listing\.listing_id\)::integer AS active_listing_count/);
    assert.match(reader, /MIN\(listing\.listing_amount\) AS asking_rent_min/);
    assert.match(reader, /MAX\(listing\.listing_amount\) AS asking_rent_max/);
    assert.match(reader, /listing\.parent_property_id = ANY\(\$1::bigint\[\]\)/);
  });

  it("builds the interactive view only from persisted Daily Editions", () => {
    assert.match(loader, /loadMarketIqReportSourceSnapshotCandidates/);
    assert.doesNotMatch(loader, /dwellsy-source|withDwellsyReadOnly|loadMarketListingActivity/);
    assert.doesNotMatch(propertyModule, /MarketIqTrend|alerts|trends|generatedAt/);
  });

  it("keeps the property route behind product, organization, onboarding, and market access checks", () => {
    assert.match(route, /getActiveOrgContext/);
    assert.match(route, /resolveViewerMarketIqAccess/);
    assert.match(route, /resolveActiveMarketIqMarket/);
    assert.match(route, /onboardingCompletedAt/);
    assert.match(route, /loadMarketIqPropertyActivityView/);
  });

  it("links cards, the event explorer, map markers, and watchlist matches to the property view", () => {
    for (const source of [dailyEvents, explorer, map, watchlists]) {
      assert.match(source, /marketIqPropertyActivityPath/);
    }
  });
});
