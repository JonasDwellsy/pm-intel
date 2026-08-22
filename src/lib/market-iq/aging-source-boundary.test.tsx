import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/dwellsy-source/listing-events.server.ts"),
  "utf8",
);

function agingCte() {
  return source.slice(
    source.indexOf("aging_events AS"),
    source.indexOf("delisting_events AS"),
  );
}

describe("daily aging-watch source boundary", () => {
  it("emits only 30, 60, and 90-day crossings for listings still active", () => {
    const sql = agingCte();
    assert.match(sql, /CROSS JOIN \(VALUES \(30\), \(60\), \(90\)\) threshold\(days\)/);
    assert.match(sql, /listing\.active_listing_status = 'active'/);
    assert.match(sql, /listing\.record_status = 'active'/);
    assert.match(sql, /'aging_threshold'::text AS event_type/);
  });

  it("anchors observation time to the source creation timestamp plus the threshold", () => {
    const sql = agingCte();
    assert.match(sql, /listing\.listing_create_time \+ make_interval\(days => threshold\.days\) AS observed_at/);
    assert.doesNotMatch(sql, /NOW\(\) AS observed_at/);
    assert.doesNotMatch(sql, /last_update_time AS observed_at/);
  });

  it("keeps each daily section represented when the shared event cap is reached", () => {
    assert.match(source, /ROW_NUMBER\(\) OVER \(PARTITION BY event_type ORDER BY observed_at DESC\)/);
    assert.match(source, /event_rank <= \$\{MIN_SAVED_EVENTS_PER_TYPE\}/);
  });
});
