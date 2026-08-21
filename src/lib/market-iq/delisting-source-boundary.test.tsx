import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/dwellsy-source/listing-events.server.ts"),
  "utf8",
);

describe("daily delisting source boundary", () => {
  it("derives delistings from real deactivation events and their listing lifetime", () => {
    assert.match(source, /FROM dwellsy_prod\.property_listing_table listing/);
    assert.match(source, /listing\.deactivation_time AS observed_at/);
    assert.match(source, /listing\.deactivation_time - listing\.creation_time/);
    assert.match(source, /listing\.deactivation_time >= NOW\(\) - INTERVAL '24 hours'/);
    assert.match(source, /'delisting'::text AS event_type/);
  });

  it("does not substitute active-listing timestamps for delisting observations", () => {
    const delistingCte = source.slice(
      source.indexOf("delisting_events AS"),
      source.indexOf("SELECT *\n  FROM ("),
    );
    assert.doesNotMatch(delistingCte, /listing_create_time AS observed_at/);
    assert.doesNotMatch(delistingCte, /last_update_time AS observed_at/);
    assert.doesNotMatch(delistingCte, /NOW\(\) AS observed_at/);
  });
});
