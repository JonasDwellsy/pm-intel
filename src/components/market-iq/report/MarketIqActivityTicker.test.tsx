import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MarketIqMarketActivity } from "@/lib/market-iq/report/report";
import { MarketIqActivityTicker } from "./MarketIqActivityTicker";

const activity: MarketIqMarketActivity = {
  asOf: "2026-08-18T21:30:00.000Z",
  newListings24h: 1,
  sourceUpdates24h: 4,
  confirmedPriceChanges24h: 0,
  events: [{
    id: "new:123",
    eventType: "new_listing",
    city: "Columbus",
    zip: "43215",
    propertyType: "apartment",
    bedrooms: 1,
    askingRent: 1_250,
    previousRent: null,
    observedAt: "2026-08-18T21:30:00.000Z",
    imageUrl: "https://media.example.com/listing.webp",
    listingUrl: "https://dwellsy.com/details/123",
  }],
};

describe("MarketIqActivityTicker", () => {
  it("shows source listing media and links the event to its Dwellsy detail page", () => {
    const { container } = render(<MarketIqActivityTicker activity={activity} marketName="Columbus" />);

    expect(container.querySelector('img[src="https://media.example.com/listing.webp"]')).not.toBeNull();
    const links = screen.getAllByRole("link", { name: /view 1-bed apartment listing in columbus on dwellsy/i });
    expect(links[0].getAttribute("href")).toBe("https://dwellsy.com/details/123");
    expect(links[0].getAttribute("target")).toBe("_blank");
  });
});
