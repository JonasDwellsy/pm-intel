import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MarketIqMarketActivityAvailability } from "@/lib/market-iq/listing-events";
import { MarketIqDailyEvents } from "./MarketIqDailyEvents";

const available: MarketIqMarketActivityAvailability = {
  state: "available",
  activity: {
    asOf: "2026-08-21T15:00:00.000Z",
    newListings24h: 1,
    sourceUpdates24h: 2,
    confirmedPriceChanges24h: 1,
    events: [
      { id: "new:1", eventType: "new_listing", city: "Cleveland", zip: "44113", propertyType: "apartment", bedrooms: 1, askingRent: 1_250, previousRent: null, observedAt: "2026-08-21T14:30:00.000Z" },
      { id: "price:2", eventType: "price_change", city: "Lakewood", zip: "44107", propertyType: "house", bedrooms: 3, askingRent: 1_700, previousRent: 1_800, observedAt: "2026-08-21T13:15:00.000Z" },
    ],
  },
};

describe("MarketIqDailyEvents", () => {
  it("renders separate observed-event sections with source timestamps", () => {
    render(<MarketIqDailyEvents availability={available} marketName="Cleveland" />);

    expect(screen.getByRole("region", { name: "New to market" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Rent changes" })).not.toBeNull();
    expect(screen.getByText("New 1-bedroom apartment in Cleveland at $1,250")).not.toBeNull();
    expect(screen.getByText(/changed from \$1,800 to \$1,700 asking rent/)).not.toBeNull();
    expect(screen.getAllByText(/^Observed /)).toHaveLength(2);
    expect(screen.getByText(/^Source current through /)).not.toBeNull();
  });

  it("renders an honest unavailable state with attempt time and no freshness claim", () => {
    render(<MarketIqDailyEvents availability={{ state: "unavailable", attemptedAt: "2026-08-21T16:00:00.000Z" }} marketName="Cleveland" />);

    expect(screen.getByText("No events were observed for the period.")).not.toBeNull();
    expect(screen.getByText(/Read attempted /)).not.toBeNull();
    expect(screen.queryByText(/^Source current through /)).toBeNull();
    expect(screen.queryByRole("region", { name: "New to market" })).toBeNull();
    expect(screen.getByText(/No monthly trend, seeded example, or other substitute/)).not.toBeNull();
  });

  it("distinguishes an available zero-event read from a failed read", () => {
    render(<MarketIqDailyEvents availability={{ ...available, activity: { ...available.activity, events: [] } }} marketName="Cleveland" />);

    expect(screen.getByText("No new listings were observed for the period.")).not.toBeNull();
    expect(screen.getByText("No confirmed asking-rent changes were observed for the period.")).not.toBeNull();
    expect(screen.queryByText("The listing-event source read was unavailable.")).toBeNull();
  });
});
