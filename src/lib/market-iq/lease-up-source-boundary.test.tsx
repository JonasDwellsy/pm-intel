import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

const reader = readFileSync(resolve(process.cwd(), "src/lib/dwellsy-source/listing-events.server.ts"), "utf8");
const contract = readFileSync(resolve(process.cwd(), "src/lib/market-iq/listing-events.ts"), "utf8");
const presentation = readFileSync(resolve(process.cwd(), "src/components/market-iq/report/MarketIqDailyEvents.tsx"), "utf8");

describe("daily lease-up source boundary", () => {
  it("requires an observed 25-plus apartment-listing cohort at one parent property", () => {
    assert.match(reader, /GROUP BY listing\.parent_property_id/);
    assert.match(reader, /COUNT\(DISTINCT listing\.listing_id\) >= 25/);
    assert.match(reader, /listing\.property_category = 'Apartment'/);
    assert.match(reader, /MAX\(listing\.listing_create_time\) >= NOW\(\) - INTERVAL '24 hours'/);
    assert.match(reader, /MAX\(listing\.listing_create_time\) - MIN\(listing\.listing_create_time\) <= INTERVAL '7 days'/);
  });

  it("carries a real source timestamp and never substitutes generation time", () => {
    assert.match(reader, /MAX\(listing\.listing_create_time\) AS observed_at/);
    assert.doesNotMatch(reader.slice(reader.indexOf("const LEASE_UP_SQL"), reader.indexOf("const COUNTS_SQL")), /NOW\(\) AS observed_at/);
    assert.match(contract, /observedAt: string/);
  });

  it("labels the signal as observed advertising evidence rather than verified construction or occupancy", () => {
    assert.match(presentation, /lease-up signal from advertised inventory/);
    assert.match(presentation, /not independent verification of construction status or occupancy/);
  });
});
