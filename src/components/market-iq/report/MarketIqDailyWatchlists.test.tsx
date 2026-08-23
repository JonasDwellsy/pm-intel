import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MarketIqMarketActivity } from "@/lib/market-iq/listing-events";
import { MarketIqDailyWatchlists } from "./MarketIqDailyWatchlists";

const activity: MarketIqMarketActivity = {
  asOf: "2026-08-22T20:00:00.000Z",
  newListings24h: 1,
  sourceUpdates24h: 1,
  confirmedPriceChanges24h: 0,
  advertisedConcessions24h: 0,
  delistings24h: 0,
  agingThresholds24h: 0,
  events: [{
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
  }],
};

describe("MarketIqDailyWatchlists", () => {
  it("saves a map-selected center and radius in the personal watchlist contract", async () => {
    const user = userEvent.setup();
    const saveWatchlist = vi.fn().mockImplementation(async (_marketId, input) => ({
      ok: true,
      watchlist: {
        id: "watch-1",
        marketId: "columbus-oh",
        ...input,
        visibility: input.visibility ?? "private",
        isOwner: true,
        isFollowing: true,
        createdAt: "2026-08-22T20:00:00.000Z",
        updatedAt: "2026-08-22T20:00:00.000Z",
      },
    }));
    render(<MarketIqDailyWatchlists activity={activity} marketId="columbus-oh" timeZone="America/New_York" initialWatchlists={[]} saveWatchlist={saveWatchlist} deleteWatchlist={vi.fn()} followWatchlist={vi.fn()} />);

    await user.type(screen.getByLabelText("Watchlist name"), "Atlas competitors");
    await user.click(screen.getByRole("button", { name: "Add map radius" }));
    await user.selectOptions(screen.getByLabelText("Competitive-set center"), "property-1");
    await user.selectOptions(screen.getByLabelText("Radius"), "5");
    await user.click(screen.getByRole("button", { name: "Create watchlist" }));

    await waitFor(() => expect(saveWatchlist).toHaveBeenCalled());
    expect(saveWatchlist.mock.calls[0]?.[1].filters.competitiveSet).toEqual({
      latitude: 39.961,
      longitude: -83.002,
      radiusMiles: 5,
      label: "The Atlas",
      propertyId: "property-1",
    });
  });

  it("lets a teammate follow an organization watchlist without granting edit controls", async () => {
    const user = userEvent.setup();
    const followWatchlist = vi.fn().mockResolvedValue({ ok: true, isFollowing: true });
    render(<MarketIqDailyWatchlists activity={activity} marketId="columbus-oh" timeZone="America/New_York" initialWatchlists={[{
      id: "watch-team",
      name: "Team competitors",
      marketId: "columbus-oh",
      filters: { query: "", eventTypes: [], geography: "all", bedrooms: "all", propertyType: "all", rentDirection: "all", minimumRentMagnitude: 0, competitiveSet: null },
      visibility: "organization",
      isOwner: false,
      isFollowing: false,
      createdAt: "2026-08-22T20:00:00.000Z",
      updatedAt: "2026-08-22T20:00:00.000Z",
    }]} saveWatchlist={vi.fn()} deleteWatchlist={vi.fn()} followWatchlist={followWatchlist} />);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Follow" }));
    expect(followWatchlist).toHaveBeenCalledWith("columbus-oh", "watch-team", true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Unfollow" })).not.toBeNull());
  });
});
