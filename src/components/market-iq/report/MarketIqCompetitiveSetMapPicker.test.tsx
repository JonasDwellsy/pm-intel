import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MarketIqListingEvent } from "@/lib/market-iq/listing-events";
import { MarketIqCompetitiveSetMapPicker, marketIqCompetitiveSetCircle } from "./MarketIqCompetitiveSetMapPicker";

const events: MarketIqListingEvent[] = [{
  id: "new-1",
  eventType: "new_listing",
  propertyId: "property-1",
  propertyName: "The Atlas",
  address: "100 Main St",
  city: "Columbus",
  zip: "43215",
  propertyType: "apartment",
  bedrooms: 2,
  askingRent: 1_600,
  previousRent: null,
  observedAt: "2026-08-22T19:00:00.000Z",
  latitude: 39.961,
  longitude: -83.002,
}];

describe("MarketIqCompetitiveSetMapPicker", () => {
  it("lets a user select a source-located property even when interactive mapping is unavailable", () => {
    const onChange = vi.fn();
    render(<MarketIqCompetitiveSetMapPicker events={events} leaseUpAlerts={[]} value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Competitive-set center"), { target: { value: "property-1" } });
    expect(onChange).toHaveBeenCalledWith({ latitude: 39.961, longitude: -83.002, radiusMiles: 3, label: "The Atlas", propertyId: "property-1" });
    expect(screen.getByText("1 source-located properties")).not.toBeNull();
  });

  it("builds a closed geographic radius polygon around the configured center", () => {
    const circle = marketIqCompetitiveSetCircle({ latitude: 39.96, longitude: -83, radiusMiles: 3, label: "River House" });
    const coordinates = circle.features[0]?.geometry.coordinates[0];
    expect(coordinates).toHaveLength(65);
    expect(coordinates?.[0]).toEqual(coordinates?.[64]);
  });
});
