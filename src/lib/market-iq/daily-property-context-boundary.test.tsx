import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

const reader = readFileSync(resolve(process.cwd(), "src/lib/dwellsy-source/listing-events.server.ts"), "utf8");
const contract = readFileSync(resolve(process.cwd(), "src/lib/market-iq/listing-events.ts"), "utf8");
const presentation = readFileSync(resolve(process.cwd(), "src/components/market-iq/report/MarketIqDailyEvents.tsx"), "utf8");
const map = readFileSync(resolve(process.cwd(), "src/components/market-iq/report/MarketIqDailyActivityMap.tsx"), "utf8");

describe("daily property context boundary", () => {
  it("carries source photos, manager identity, and coordinates through the event contract", () => {
    assert.match(reader, /company\.company_name_displayed/);
    assert.match(reader, /listing\.latitude/);
    assert.match(reader, /listing\.longitude/);
    assert.match(reader, /primaryImageUrl\(row\.media\)/);
    assert.match(contract, /propertyManagerName\?: string \| null/);
    assert.match(contract, /latitude\?: number \| null/);
    assert.match(contract, /longitude\?: number \| null/);
  });

  it("renders the source context without importing monthly trend types", () => {
    assert.match(presentation, /Managed by \{event\.propertyManagerName\}/);
    assert.match(presentation, /event\.imageUrl/);
    assert.match(map, /MarketIqListingEvent/);
    assert.doesNotMatch(`${presentation}\n${map}`, /MarketIqTrendPoint|MarketIqTrendSeries/);
  });
});
