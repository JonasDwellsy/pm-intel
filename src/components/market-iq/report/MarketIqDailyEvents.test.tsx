import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MarketIqMarketActivityAvailability } from "@/lib/market-iq/listing-events";
import { MarketIqDailyEvents } from "./MarketIqDailyEvents";

const available: MarketIqMarketActivityAvailability = {
  state: "available",
  activity: {
    asOf: "2026-08-21T15:00:00.000Z",
    newListings24h: 11,
    sourceUpdates24h: 2,
    confirmedPriceChanges24h: 7,
    advertisedConcessions24h: 3,
    delistings24h: 9,
    agingThresholds24h: 1,
    events: [
      { id: "new:1", eventType: "new_listing", address: "100 Main St", city: "Cleveland", zip: "44113", propertyType: "apartment", bedrooms: 1, askingRent: 1_250, previousRent: null, observedAt: "2026-08-21T14:30:00.000Z" },
      { id: "price:2", eventType: "price_change", address: "200 Detroit Ave", city: "Lakewood", zip: "44107", propertyType: "house", bedrooms: 3, askingRent: 1_700, previousRent: 1_800, observedAt: "2026-08-21T13:15:00.000Z" },
      { id: "delisting:3", eventType: "delisting", address: "300 Lee Rd", city: "Cleveland Heights", zip: "44118", propertyType: "apartment", bedrooms: 2, askingRent: 1_425, previousRent: null, listingAgeDays: 19, observedAt: "2026-08-21T12:45:00.000Z" },
      { id: "aging:4:30", eventType: "aging_threshold", address: "400 Van Aken Blvd", city: "Shaker Heights", zip: "44120", propertyType: "house", bedrooms: 3, askingRent: 1_850, previousRent: null, listingAgeDays: 30, observedAt: "2026-08-21T11:15:00.000Z" },
      { id: "concession:5", eventType: "concession", address: "500 Euclid Ave", city: "Cleveland", zip: "44113", propertyType: "apartment", bedrooms: 2, askingRent: 1_500, previousRent: null, observedAt: "2026-08-21T10:30:00.000Z", concession: { kind: "free_rent", label: "Free-rent offer", evidence: "Apply today and receive one month free. Terms apply" } },
    ],
  },
};

describe("MarketIqDailyEvents", () => {
  it("renders an editorial market tape with scannable event records and source timestamps", () => {
    render(<MarketIqDailyEvents availability={available} marketName="Cleveland" />);

    expect(screen.getByRole("region", { name: "New to market" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Notable rent moves" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Off the market" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "The aging watch" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Concessions" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Observed 24-hour flow" })).not.toBeNull();
    expect(screen.getByText("11")).not.toBeNull();
    expect(screen.getByText("9")).not.toBeNull();
    expect(screen.getByText("7")).not.toBeNull();
    expect(screen.getByText("3")).not.toBeNull();
    expect(screen.getByText(/Age-based stale deactivations are excluded from off-market totals/)).not.toBeNull();
    expect(screen.getByText(/Standing active inventory and active-listing rent summaries remain withheld/)).not.toBeNull();
    expect(screen.getByText(/Leased or withdrawn, undetermined/)).not.toBeNull();
    expect(screen.getByText("Cleveland · 100 Main St")).not.toBeNull();
    expect(screen.getByText("1 BR · Apartment")).not.toBeNull();
    expect(screen.getByText("−$100 · −5.6%")).not.toBeNull();
    expect(screen.getByText("19 days listed")).not.toBeNull();
    expect(screen.getByText("30")).not.toBeNull();
    expect(screen.getByText(/Apply today and receive one month free/)).not.toBeNull();
    expect(screen.getByText(/Advertised, not verified/)).not.toBeNull();
    expect(screen.getByLabelText("1 record available for 11 observed events")).not.toBeNull();
    expect(screen.getAllByLabelText(/^Observed Aug/)).toHaveLength(4);
    expect(screen.getByLabelText(/^Crossed Aug/)).not.toBeNull();
    expect(screen.getByText(/^Source current through /)).not.toBeNull();
  });

  it("features the largest confirmed rent movements before more recent smaller moves", () => {
    const smallerRecentMove = { id: "price:small", eventType: "price_change" as const, address: "600 Lake Ave", city: "Lakewood", zip: "44107", propertyType: "apartment" as const, bedrooms: 1, askingRent: 1_225, previousRent: 1_250, observedAt: "2026-08-21T14:45:00.000Z" };
    const largerOlderMove = { id: "price:large", eventType: "price_change" as const, address: "700 Clifton Blvd", city: "Lakewood", zip: "44107", propertyType: "apartment" as const, bedrooms: 2, askingRent: 1_300, previousRent: 1_600, observedAt: "2026-08-21T12:00:00.000Z" };
    render(<MarketIqDailyEvents availability={{ ...available, activity: { ...available.activity, events: [smallerRecentMove, largerOlderMove] } }} marketName="Cleveland" />);

    const section = screen.getByRole("region", { name: "Notable rent moves" });
    const rows = section.querySelectorAll("article");
    expect(rows[0]?.textContent).toContain("−$300");
    expect(rows[1]?.textContent).toContain("−$25");
  });

  it("offers a native view-all disclosure when a section exceeds its editorial limit", () => {
    const events = Array.from({ length: 6 }, (_, index) => ({
      id: `new:${index}`,
      eventType: "new_listing" as const,
      address: `${index + 1} Market St`,
      city: "Cleveland",
      zip: "44113",
      propertyType: "apartment" as const,
      bedrooms: 1,
      askingRent: 1_000 + index * 25,
      previousRent: null,
      observedAt: `2026-08-21T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
    }));
    render(<MarketIqDailyEvents availability={{ ...available, activity: { ...available.activity, newListings24h: events.length, events } }} marketName="Cleveland" />);

    const section = screen.getByRole("region", { name: "New to market" });
    expect(within(section).getByText("View all 6")).not.toBeNull();
    expect(section.querySelector("details")).not.toBeNull();
  });

  it("states when the saved edition retains fewer records than the exact observed total", () => {
    const events = Array.from({ length: 6 }, (_, index) => ({
      id: `new:${index}`,
      eventType: "new_listing" as const,
      address: `${index + 1} Market St`,
      city: "Cleveland",
      zip: "44113",
      propertyType: "apartment" as const,
      bedrooms: 1,
      askingRent: 1_000,
      previousRent: null,
      observedAt: `2026-08-21T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
    }));
    render(<MarketIqDailyEvents availability={{ ...available, activity: { ...available.activity, newListings24h: 11, events } }} marketName="Cleveland" />);

    const section = screen.getByRole("region", { name: "New to market" });
    expect(within(section).getByLabelText("6 records available for 11 observed events")).not.toBeNull();
    expect(within(section).getByText("Individual records are available for 6 of 11 observed events in this saved edition.")).not.toBeNull();
    expect(within(section).getByText("View 6 available records")).not.toBeNull();
    expect(within(section).queryByText("View all 6")).toBeNull();
  });

  it("groups indistinguishable rent changes while preserving links to both source records", () => {
    const duplicateMoves = ["record-a", "record-b"].map((id, index) => ({
      id,
      eventType: "price_change" as const,
      address: "395 E 149th St",
      city: "Cleveland",
      zip: "44110",
      propertyType: "house" as const,
      bedrooms: 3,
      askingRent: 1_000,
      previousRent: 1_300,
      observedAt: "2026-08-21T20:19:00.000Z",
      listingUrl: `https://dwellsy.com/details/${index + 1}`,
    }));
    render(<MarketIqDailyEvents availability={{ ...available, activity: { ...available.activity, confirmedPriceChanges24h: 2, events: duplicateMoves } }} marketName="Cleveland" />);

    const section = screen.getByRole("region", { name: "Notable rent moves" });
    expect(section.querySelectorAll("article")).toHaveLength(1);
    expect(within(section).getByText("2 listing records at this address")).not.toBeNull();
    expect(within(section).getAllByRole("link", { name: /^Open record/ })).toHaveLength(2);
  });

  it("labels a same-day departure as less than one day", () => {
    const event = { id: "delisting:new", eventType: "delisting" as const, address: "1 Short St", city: "Cleveland", zip: "44113", propertyType: "apartment" as const, bedrooms: 1, askingRent: 1_000, previousRent: null, listingAgeDays: 0, observedAt: "2026-08-21T12:45:00.000Z" };
    render(<MarketIqDailyEvents availability={{ ...available, activity: { ...available.activity, delistings24h: 1, events: [event] } }} marketName="Cleveland" />);

    expect(screen.getByText("Less than 1 day")).not.toBeNull();
    expect(screen.queryByText("0 days listed")).toBeNull();
  });

  it("renders an honest unavailable state with attempt time and no freshness claim", () => {
    render(<MarketIqDailyEvents availability={{ state: "unavailable", attemptedAt: "2026-08-21T16:00:00.000Z" }} marketName="Cleveland" />);

    expect(screen.getByText("No events were observed for the period.")).not.toBeNull();
    expect(screen.getByText(/Read attempted /)).not.toBeNull();
    expect(screen.queryByText(/^Source current through /)).toBeNull();
    expect(screen.queryByRole("region", { name: "New to market" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Observed 24-hour flow" })).toBeNull();
    expect(screen.getByText(/No monthly trend, seeded example, or other substitute/)).not.toBeNull();
  });

  it("distinguishes an available zero-event read from a failed read", () => {
    render(<MarketIqDailyEvents availability={{ ...available, activity: { ...available.activity, newListings24h: 0, confirmedPriceChanges24h: 0, advertisedConcessions24h: 0, delistings24h: 0, agingThresholds24h: 0, events: [] } }} marketName="Cleveland" />);

    expect(screen.getByText("No new listings were observed for the period.")).not.toBeNull();
    expect(screen.getByText("No confirmed asking-rent changes were observed for the period.")).not.toBeNull();
    expect(screen.getByText("No listings were observed leaving the market for the period.")).not.toBeNull();
    expect(screen.getByText("No active listings crossed an aging threshold for the period.")).not.toBeNull();
    expect(screen.getByText("No concession language was observed in new-listing text for the period.")).not.toBeNull();
    expect(screen.queryByText("The listing-event source read was unavailable.")).toBeNull();
  });
});
