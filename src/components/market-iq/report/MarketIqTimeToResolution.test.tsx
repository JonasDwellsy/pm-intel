import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MarketIqTimeToResolutionAvailability } from "@/lib/market-iq/time-to-resolution";
import { MarketIqTimeToResolution } from "./MarketIqTimeToResolution";

const available: MarketIqTimeToResolutionAvailability = {
  state: "available",
  resolution: {
    asOf: "2026-08-21T18:53:05.000Z",
    windowStart: "2026-05-23T19:00:00.000Z",
    windowEnd: "2026-08-21T19:00:00.000Z",
    sampleSize: 4_125,
    medianDays: 27.4,
    p25Days: 10,
    p75Days: 56,
    p90Days: 111.8,
    bedroomSegments: [{ key: "apartment:1", label: "1-bedroom apartments", sampleSize: 1_174, medianDays: 26, p25Days: 9.5, p75Days: 51 }],
    rentBands: [{ key: "1000_1499", label: "$1,000–$1,499", sampleSize: 1_771, medianDays: 29.6, p25Days: 10.9, p75Days: 56 }],
  },
};

describe("MarketIqTimeToResolution", () => {
  it("labels the measure and renders its distribution without implying a lease", () => {
    render(<MarketIqTimeToResolution availability={available} marketName="Cleveland" />);

    expect(screen.getByRole("region", { name: "Time to resolution in Cleveland" })).not.toBeNull();
    expect(screen.getByText("27.4 days")).not.toBeNull();
    expect(screen.getByText("4,125")).not.toBeNull();
    expect(screen.getByText(/may have leased or been withdrawn/)).not.toBeNull();
    expect(screen.getByText(/this is not time to lease/)).not.toBeNull();
    expect(screen.getByRole("region", { name: "By property type and bedrooms" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "By advertised asking-rent band" })).not.toBeNull();
    expect(screen.getByText(/^Source current through /)).not.toBeNull();
  });

  it("shows an honest unavailable state without claiming source freshness", () => {
    render(<MarketIqTimeToResolution availability={{ state: "unavailable", attemptedAt: "2026-08-21T19:15:00.000Z" }} marketName="Cleveland" />);

    expect(screen.getByText("Time-to-resolution data is unavailable.")).not.toBeNull();
    expect(screen.getByText(/Read attempted /)).not.toBeNull();
    expect(screen.queryByText(/^Source current through /)).toBeNull();
    expect(screen.getByText(/No monthly trend, active-listing estimate, seeded example, or other substitute/)).not.toBeNull();
  });
});
