import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MarketIqDailyEventExplorer } from "@/components/market-iq/report/MarketIqDailyEventExplorer";
import type { MarketIqListingEvent, MarketIqMarketActivity } from "@/lib/market-iq/listing-events";

const events: MarketIqListingEvent[] = [
  { id: "new", eventType: "new_listing", address: "100 Main St", city: "Cleveland", zip: "44113", propertyType: "apartment", bedrooms: 0, askingRent: 1_100, previousRent: null, observedAt: "2026-08-22T15:00:00.000Z", listingUrl: "https://dwellsy.com/property/new" },
  { id: "increase", eventType: "price_change", address: "200 Lake Ave", city: "Lakewood", zip: "44107", propertyType: "house", bedrooms: 3, askingRent: 1_750, previousRent: 1_600, observedAt: "2026-08-22T14:00:00.000Z" },
  { id: "decrease", eventType: "price_change", address: "300 Euclid Ave", city: "Cleveland", zip: "44114", propertyType: "apartment", bedrooms: 2, askingRent: 1_300, previousRent: 1_550, observedAt: "2026-08-22T13:00:00.000Z" },
  { id: "departure", eventType: "delisting", address: "400 Lee Rd", city: "Cleveland Heights", zip: "44118", propertyType: "house", bedrooms: 4, askingRent: 2_400, previousRent: null, listingAgeDays: 41, observedAt: "2026-08-22T12:00:00.000Z" },
];

function activity(overrides: Partial<MarketIqMarketActivity> = {}): MarketIqMarketActivity {
  return {
    asOf: "2026-08-22T16:00:00.000Z",
    newListings24h: 3,
    sourceUpdates24h: 2_000,
    confirmedPriceChanges24h: 4,
    advertisedConcessions24h: 1,
    delistings24h: 5,
    agingThresholds24h: 2,
    events,
    eventsTruncated: true,
    ...overrides,
  };
}

describe("MarketIqDailyEventExplorer", () => {
  it("keeps retained-record and exact observed totals distinct", () => {
    render(<MarketIqDailyEventExplorer activity={activity()} timeZone="America/New_York" />);

    const explorer = screen.getByRole("region", { name: "Daily event explorer" });
    expect(within(explorer).getByRole("heading", { name: "Explore this edition" })).toBeTruthy();
    expect(within(explorer).getByText(/of 4 retained records/)).toBeTruthy();
    expect(within(explorer).getByText(/The source observed/).textContent).toContain("15 reportable events");
    expect(within(explorer).getByText(/The source observed/).textContent).toContain("retains 4 individual records");
    expect(within(explorer).getByRole("link", { name: "Open source listing ↗" }).getAttribute("href")).toBe("https://dwellsy.com/property/new");
    expect(within(explorer).getByText("Aug 22, 11:00 AM EDT").getAttribute("datetime")).toBe("2026-08-22T15:00:00.000Z");
  });

  it("combines interactive filters and resets to the full retained ledger", async () => {
    const user = userEvent.setup();
    render(<MarketIqDailyEventExplorer activity={activity()} timeZone="America/New_York" />);

    await user.selectOptions(screen.getByLabelText("Event"), "rent_changes");
    await user.selectOptions(screen.getByLabelText("Rent move"), "decrease");
    await user.selectOptions(screen.getByLabelText("Change size"), "200");
    expect(screen.getByRole("heading", { name: /Asking rent changed.*Cleveland/ })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Asking rent changed.*Lakewood/ })).toBeNull();
    expect(screen.getByText("Showing 1 of 1 matching retained records.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Reset filters (3)" }));
    expect(screen.getByText("Showing 4 of 4 matching retained records.")).toBeTruthy();

    await user.type(screen.getByLabelText("Address search"), "Lake Ave");
    expect(screen.getByRole("heading", { name: /Asking rent changed.*Lakewood/ })).toBeTruthy();
    expect(screen.getByText("Showing 1 of 1 matching retained records.")).toBeTruthy();
  });

  it("reveals retained records in bounded pages", async () => {
    const user = userEvent.setup();
    const manyEvents = Array.from({ length: 30 }, (_, index): MarketIqListingEvent => ({
      id: `new:${index}`,
      eventType: "new_listing",
      address: `${index + 1} Market St`,
      city: "Cleveland",
      zip: "44113",
      propertyType: "apartment",
      bedrooms: 1,
      askingRent: 1_000 + index,
      previousRent: null,
      observedAt: new Date(Date.UTC(2026, 7, 22, 15, index)).toISOString(),
    }));
    render(<MarketIqDailyEventExplorer activity={activity({ newListings24h: 30, confirmedPriceChanges24h: 0, advertisedConcessions24h: 0, delistings24h: 0, agingThresholds24h: 0, events: manyEvents, eventsTruncated: false })} timeZone="America/New_York" />);

    expect(screen.getByText("Showing 25 of 30 matching retained records.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show 5 more records" }));
    expect(screen.getByText("Showing 30 of 30 matching retained records.")).toBeTruthy();
  });
});
