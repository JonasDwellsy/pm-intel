import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { MarketIqListingEvent, MarketIqMarketActivity } from "@/lib/market-iq/report/report";
import { MarketIqActivityTicker } from "./MarketIqActivityTicker";

function listingEvent(index: number, overrides: Partial<MarketIqListingEvent> = {}): MarketIqListingEvent {
  const priceChanged = index % 3 === 0;
  return {
    id: `${priceChanged ? "price" : "new"}:${index}`,
    eventType: priceChanged ? "price_change" : "new_listing",
    address: `${100 + index} Main St, Apt ${index}`,
    city: index % 2 === 0 ? "Lakewood" : "Columbus",
    zip: index % 2 === 0 ? "44107" : "43215",
    propertyType: index % 4 === 0 ? "house" : "apartment",
    bedrooms: index % 4,
    askingRent: 1_200 + index,
    previousRent: priceChanged ? 1_300 + index : null,
    observedAt: `2026-08-18T${String(20 - (index % 10)).padStart(2, "0")}:30:00.000Z`,
    imageUrl: `https://media.example.com/listing-${index}.webp`,
    listingUrl: `https://dwellsy.com/details/${400 + index}`,
    ...overrides,
  };
}

const activity: MarketIqMarketActivity = {
  asOf: "2026-08-18T21:30:00.000Z",
  newListings24h: 21,
  sourceUpdates24h: 84,
  confirmedPriceChanges24h: 10,
  eventsTruncated: false,
  events: [listingEvent(0, {
    id: "new:123",
    eventType: "new_listing",
    address: "100 Main St, Apt 4",
    city: "Columbus",
    zip: "43215",
    propertyType: "apartment",
    bedrooms: 1,
    askingRent: 1_250,
    previousRent: null,
    imageUrl: "https://media.example.com/listing.webp",
    listingUrl: "https://dwellsy.com/details/456",
  }), ...Array.from({ length: 30 }, (_, index) => listingEvent(index + 1))],
};

describe("MarketIqActivityTicker", () => {
  it("keeps the compact ticker and links its source address to the canonical property", () => {
    const { container } = render(<MarketIqActivityTicker activity={activity} marketName="Columbus" />);

    expect(container.querySelector('img[src="https://media.example.com/listing.webp"]')).not.toBeNull();
    const links = screen.getAllByRole("link", { name: /view 1-bed apartment listing in columbus on dwellsy/i });
    expect(screen.getAllByText("100 Main St, Apt 4")).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("https://dwellsy.com/details/456");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("button", { name: "View all activity (31)" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("expands the saved activity, filters it, and paginates without fetching", async () => {
    const user = userEvent.setup();
    render(<MarketIqActivityTicker activity={activity} marketName="Columbus" />);

    await user.click(screen.getByRole("button", { name: "View all activity (31)" }));
    const explorer = screen.getByRole("region", { name: "All recent listing activity" });
    expect(within(explorer).getByText("31 reportable events in the saved 24-hour read")).not.toBeNull();
    expect(within(explorer).getByText("Showing 25 of 31 matching events")).not.toBeNull();

    await user.click(within(explorer).getByRole("button", { name: "Load 25 more" }));
    expect(within(explorer).getByText("Showing 31 of 31 matching events")).not.toBeNull();

    await user.click(within(explorer).getByRole("button", { name: "Price changes" }));
    expect(within(explorer).getByText("Showing 10 of 10 matching events")).not.toBeNull();
    expect(within(explorer).queryByRole("button", { name: "Load 25 more" })).toBeNull();

    await user.selectOptions(within(explorer).getByRole("combobox", { name: "Municipality" }), "Lakewood");
    expect(within(explorer).getByText("Showing 5 of 5 matching events")).not.toBeNull();
    expect(within(explorer).getAllByText(/Lakewood · 44107/)).toHaveLength(5);
  });

  it("states when the saved read reached its safety limit", async () => {
    const user = userEvent.setup();
    render(<MarketIqActivityTicker activity={{ ...activity, eventsTruncated: true }} marketName="Columbus" />);

    await user.click(screen.getByRole("button", { name: "View all activity (31+)" }));
    const explorer = screen.getByRole("region", { name: "All recent listing activity" });
    expect(within(explorer).getByText("Latest 31 reportable events in the saved 24-hour read")).not.toBeNull();
    expect(within(explorer).getByText("The saved read reached its 200-event safety limit.")).not.toBeNull();
  });
});
