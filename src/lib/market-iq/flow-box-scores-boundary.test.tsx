import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

const reader = readFileSync(resolve(process.cwd(), "src/lib/dwellsy-source/listing-events.server.ts"), "utf8");
const contract = readFileSync(resolve(process.cwd(), "src/lib/market-iq/listing-events.ts"), "utf8");
const presentation = readFileSync(resolve(process.cwd(), "src/components/market-iq/report/MarketIqDailyEvents.tsx"), "utf8");

describe("observed flow box-score boundary", () => {
  it("sources each displayed value from an exact 24-hour aggregate", () => {
    assert.match(reader, /COUNT\(\*\) FILTER \(WHERE listing_create_time >= NOW\(\) - INTERVAL '24 hours'\) AS new_listings_24h/);
    assert.match(reader, /COUNT\(\*\) AS confirmed_price_changes_24h/);
    assert.match(reader, /COUNT\(\*\) AS advertised_concessions_24h/);
    assert.match(reader, /COUNT\(\*\) AS delistings_24h/);
    assert.match(contract, /advertisedConcessions24h: number/);
  });

  it("uses the aggregate contract rather than counting capped headline events", () => {
    assert.match(presentation, /activity\.newListings24h/);
    assert.match(presentation, /activity\.delistings24h/);
    assert.match(presentation, /activity\.confirmedPriceChanges24h/);
    assert.match(presentation, /activity\.advertisedConcessions24h/);
    assert.doesNotMatch(presentation, /events\.(?:filter|reduce).*24h/);
  });

  it("excludes age-based stale deactivations and withholds standing summaries", () => {
    assert.equal(reader.match(/listing\.listing_status_info IS DISTINCT FROM 'Stale listing'/g)?.length, 2);
    assert.match(presentation, /Age-based stale deactivations are excluded from off-market totals/);
    assert.match(presentation, /Standing active inventory and active-listing rent summaries remain withheld/);
    assert.doesNotMatch(presentation, /activeListings24h|activeInventory|medianActiveRent/);
    assert.doesNotMatch(reader, /AS active_inventory|AS median_active_rent/);
    assert.doesNotMatch(presentation, /MarketIqTrendPoint|MarketIqTrendSeries/);
  });
});
