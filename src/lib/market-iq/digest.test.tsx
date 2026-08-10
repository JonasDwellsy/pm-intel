import { describe, expect, it } from "vitest";
import { buildMarketIqDigest } from "@/lib/market-iq/digest";

describe("buildMarketIqDigest", () => {
  it("includes only alerts that match geography and product filters", () => {
    const digest = buildMarketIqDigest({
      recipientName: "Jonas",
      dashboardUrl: "https://preview.example/market-iq",
      watchlists: [{
        id: "watch-1",
        name: "Lakewood apartments",
        marketId: "cleveland-elyria-mentor-oh",
        geographyType: "city",
        geographyValues: ["Lakewood, OH"],
        propertyTypes: ["apartment"],
        bedroomCounts: [1],
        alertsEnabled: true,
        alertCadence: "weekly",
        updatedAt: "2026-08-10T00:00:00.000Z",
      }],
      alerts: [
        {
          id: "included",
          geographyType: "city",
          geographyValue: "Lakewood, OH",
          propertyType: "apartment",
          bedrooms: 1,
          severity: "material",
          headline: "Lakewood 1-bed rents rose",
          narrative: "Matched narrative.",
          observedMonth: new Date("2026-06-01T00:00:00.000Z"),
        },
        {
          id: "excluded",
          geographyType: "city",
          geographyValue: "Lakewood, OH",
          propertyType: "house",
          bedrooms: 3,
          severity: "material",
          headline: "Lakewood house rents rose",
          narrative: "Should be excluded.",
          observedMonth: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
    });
    expect(digest.alertCount).toBe(1);
    expect(digest.text).toContain("Lakewood 1-bed rents rose");
    expect(digest.text).not.toContain("Lakewood house rents rose");
  });
});
