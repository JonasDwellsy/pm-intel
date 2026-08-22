import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketIqPropertyActivityView } from "@/components/market-iq/report/MarketIqPropertyActivityView";
import type { MarketIqPropertyActivityView as PropertyActivityView } from "@/lib/market-iq/property-activity";

const view: PropertyActivityView = {
  propertyId: "9001",
  propertyName: "Lake House",
  propertyManagerName: "North Shore Management",
  address: "100 Lake Ave",
  city: "Cleveland",
  zip: "44101",
  propertyType: "apartment",
  imageUrl: "https://images.example/property.jpg",
  listingUrl: "https://dwellsy.com/details/9001",
  latitude: 41.5,
  longitude: -81.7,
  latestSummary: {
    propertyId: "9001",
    propertyName: "Lake House",
    propertyManagerName: "North Shore Management",
    address: "100 Lake Ave",
    city: "Cleveland",
    zip: "44101",
    propertyType: "apartment",
    activeListingCount: 3,
    askingRentMin: 1100,
    askingRentMax: 1450,
    bedroomCounts: [{ bedrooms: 1, activeListings: 2 }, { bedrooms: 2, activeListings: 1 }],
    imageUrl: "https://images.example/property.jpg",
    listingUrl: "https://dwellsy.com/details/9001",
    latitude: 41.5,
    longitude: -81.7,
    observedAt: "2026-08-22T10:00:00.000Z",
    editionId: "edition-1",
  },
  activity: [{
    id: "new_listing:new:41",
    kind: "new_listing",
    headline: "New 1-bedroom apartment in Cleveland at $1,200",
    detail: "100 Lake Ave was observed with an asking rent of $1,200.",
    observedAt: "2026-08-22T09:00:00.000Z",
    editionId: "edition-1",
    listingUrl: "https://dwellsy.com/details/9001",
  }],
  leaseUpObserved: false,
  editionCount: 1,
  firstObservedAt: "2026-08-22T09:00:00.000Z",
  lastObservedAt: "2026-08-22T09:00:00.000Z",
};

describe("MarketIqPropertyActivityView", () => {
  it("presents exact source facts and links back to the persisted edition", () => {
    render(<MarketIqPropertyActivityView view={view} marketId="cleveland-elyria-mentor-oh" marketName="Cleveland" timeZone="America/New_York" />);
    expect(screen.getByRole("heading", { name: "Lake House" })).toBeTruthy();
    expect(screen.getByText("North Shore Management", { exact: false })).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("$1,100 to $1,450")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Daily Edition" }).getAttribute("href")).toContain("edition=edition-1");
    expect(screen.getByText(/does not infer occupancy/)).toBeTruthy();
  });
});
