import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { MarketIqListingEvent } from "@/lib/market-iq/listing-events";
import { MarketIqDailyActivityMap } from "./MarketIqDailyActivityMap";

const events: MarketIqListingEvent[] = [
  { id: "new:1", eventType: "new_listing", address: "100 Main St", city: "Cleveland", zip: "44113", propertyType: "apartment", bedrooms: 1, askingRent: 1_250, previousRent: null, observedAt: "2026-08-21T14:30:00.000Z", latitude: 41.5, longitude: -81.69 },
  { id: "price:2", eventType: "price_change", address: "200 Main St", city: "Cleveland", zip: "44113", propertyType: "apartment", bedrooms: 2, askingRent: 1_400, previousRent: 1_500, observedAt: "2026-08-21T14:00:00.000Z", latitude: 41.51, longitude: -81.68 },
];

describe("MarketIqDailyActivityMap", () => {
  it("exposes interactive category controls for source-located events", async () => {
    const user = userEvent.setup();
    render(<MarketIqDailyActivityMap events={events} marketName="Cleveland" />);

    const controls = within(screen.getByRole("group", { name: "Map activity filters" }));
    const arrivals = controls.getByRole("button", { name: "New listings" });
    const rentMoves = controls.getByRole("button", { name: "Rent moves" });
    expect(arrivals.getAttribute("aria-pressed")).toBe("true");
    expect(rentMoves.getAttribute("aria-pressed")).toBe("true");

    await user.click(rentMoves);
    expect(rentMoves.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("2 mapped")).not.toBeNull();
  });

  it("reports records withheld from the map when coordinates are absent", () => {
    render(<MarketIqDailyActivityMap events={[...events, { ...events[0], id: "new:missing", latitude: null, longitude: null }]} marketName="Cleveland" />);
    expect(screen.getByText("2 mapped · 1 without coordinates")).not.toBeNull();
  });
});
