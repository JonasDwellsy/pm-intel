import { describe, expect, it } from "vitest";

import { buildMarketIqDailyEventCsv } from "@/lib/market-iq/daily-event-export";
import { buildDailyEventHeadlines } from "@/lib/market-iq/daily-events";
import type { MarketIqListingEvent } from "@/lib/market-iq/listing-events";

const events: MarketIqListingEvent[] = [
  { id: "rent,1", eventType: "price_change", address: "100 \"Main\" St", city: "Cleveland", zip: "44113", propertyType: "apartment", bedrooms: 2, askingRent: 1_300, previousRent: 1_500, observedAt: "2026-08-23T03:15:00.000Z", listingUrl: "https://dwellsy.com/listing/1" },
  { id: "concession", eventType: "concession", address: "=HYPERLINK(\"bad\")", city: "+Cleveland", zip: "44114", propertyType: "house", bedrooms: 3, askingRent: 1_800, previousRent: null, observedAt: "2026-08-23T02:15:00.000Z", concession: { kind: "free_rent", label: "Free-rent offer", evidence: "One month free, terms apply" } },
];

describe("Daily Event Explorer CSV export", () => {
  it("exports exact retained evidence and edition-level count disclosures", () => {
    const result = buildMarketIqDailyEventCsv({
      headlines: buildDailyEventHeadlines(events),
      marketName: "Cleveland–Elyria",
      timeZone: "America/New_York",
      editionAsOf: "2026-08-23T03:30:00.000Z",
      observedEventTotal: 140,
      retainedRecordTotal: 80,
      retainedRecordsPartial: true,
    });

    expect(result.filename).toBe("market-iq-cleveland-elyria-2026-08-22-filtered-retained-events.csv");
    expect(result.rowCount).toBe(2);
    expect(result.content.startsWith("\uFEFFedition_source_as_of,observed_event_total")).toBe(true);
    expect(result.content).toContain("2026-08-23T03:30:00.000Z,140,80,2,true");
    expect(result.content).toContain("price_change,2026-08-23T03:15:00.000Z");
    expect(result.content).toContain('"100 ""Main"" St"');
    expect(result.content).toContain(",1300,1500,-200,");
    expect(result.content).toContain("free_rent,Free-rent offer,\"One month free, terms apply\"");
  });

  it("neutralizes spreadsheet formulas in source-controlled text fields", () => {
    const result = buildMarketIqDailyEventCsv({
      headlines: buildDailyEventHeadlines(events),
      marketName: "Cleveland",
      timeZone: "America/New_York",
      editionAsOf: "2026-08-23T03:30:00.000Z",
      observedEventTotal: 2,
      retainedRecordTotal: 2,
      retainedRecordsPartial: false,
    });
    expect(result.content).toContain('"\'=HYPERLINK(""bad"")"');
    expect(result.content).toContain("'+Cleveland");
  });

  it("emits a header-only file when no retained records match", () => {
    const result = buildMarketIqDailyEventCsv({
      headlines: [],
      marketName: "Cleveland",
      timeZone: "America/New_York",
      editionAsOf: "2026-08-23T03:30:00.000Z",
      observedEventTotal: 140,
      retainedRecordTotal: 80,
      retainedRecordsPartial: true,
    });
    expect(result.rowCount).toBe(0);
    expect(result.content.split("\r\n")).toHaveLength(2);
  });
});
