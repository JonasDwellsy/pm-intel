import { describe, expect, it } from "vitest";
import { buildMarketIqTrendPulse } from "@/lib/market-iq/trends";

describe("buildMarketIqTrendPulse", () => {
  it("uses the latest complete pilot segments and identifies the strongest signal", () => {
    const month = new Date("2026-06-01T00:00:00.000Z");
    const pulse = buildMarketIqTrendPulse({
      sourceName: "Dwellsy IQ Rent Trends",
      geographyType: "msa",
      geographyValue: "17460",
      points: [
        { month, propertyType: "apartment", bedrooms: 1, observations: 204, askingRent: 950, yearOverYearPct: 6.15 },
        { month, propertyType: "apartment", bedrooms: 2, observations: 202, askingRent: 1150, yearOverYearPct: 1.37 },
        { month, propertyType: "house", bedrooms: 2, observations: 58, askingRent: 1200, yearOverYearPct: 3.85 },
        { month, propertyType: "house", bedrooms: 3, observations: 157, askingRent: 1601, yearOverYearPct: 4.36 },
      ],
    });
    expect(pulse.trendSource.availableThrough).toBe("2026-06-01");
    expect(pulse.segments).toHaveLength(4);
    expect(pulse.signal.heading).toBe("1-bed apartments are tightening");
    expect(pulse.signal.narrative).toContain("6.2% year over year");
  });
});
