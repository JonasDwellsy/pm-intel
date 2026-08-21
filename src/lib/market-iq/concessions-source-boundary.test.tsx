import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

const reader = readFileSync(resolve(process.cwd(), "src/lib/dwellsy-source/listing-events.server.ts"), "utf8");
const parser = readFileSync(resolve(process.cwd(), "src/lib/market-iq/concessions.ts"), "utf8");
const daily = readFileSync(resolve(process.cwd(), "src/lib/market-iq/daily-events.ts"), "utf8");

describe("daily concessions source boundary", () => {
  it("anchors concessions to new listings and canonical listing text", () => {
    const cte = reader.slice(reader.indexOf("concession_events AS"), reader.indexOf("price_events AS"));
    assert.match(cte, /JOIN dwellsy_prod\.property_listing_table canonical ON canonical\.id = listing\.listing_id/);
    assert.match(cte, /canonical\.listing_title/);
    assert.match(cte, /canonical\.listing_short_text/);
    assert.match(cte, /canonical\.listing_long_text/);
    assert.match(cte, /listing\.listing_create_time AS observed_at/);
    assert.match(cte, /listing\.listing_create_time >= NOW\(\) - INTERVAL '24 hours'/);
    assert.doesNotMatch(cte, /NOW\(\) AS observed_at/);
  });

  it("reserves event capacity for concessions and labels them as unverified advertising", () => {
    assert.match(reader, /'concession'::text AS event_type/);
    assert.match(reader, /PARTITION BY event_type/);
    assert.match(daily, /advertised, not verified/i);
  });

  it("does not import monthly trend types or derive a rent trend", () => {
    for (const source of [reader, parser, daily]) {
      assert.doesNotMatch(source, /MarketIqTrendPoint|MarketIqTrendSeries/);
      assert.doesNotMatch(source, /year_over_year|month_over_month|gaussian/i);
    }
  });
});
