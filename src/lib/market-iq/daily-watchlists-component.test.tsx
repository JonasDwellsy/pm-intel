import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarketIqDailyWatchlists } from "@/components/market-iq/report/MarketIqDailyWatchlists";
import { EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS } from "@/lib/market-iq/daily-watchlists";
import type { MarketIqMarketActivity } from "@/lib/market-iq/listing-events";

const activity: MarketIqMarketActivity = {
  asOf: "2026-08-22T20:00:00.000Z",
  newListings24h: 1,
  sourceUpdates24h: 1,
  confirmedPriceChanges24h: 0,
  advertisedConcessions24h: 0,
  delistings24h: 0,
  agingThresholds24h: 0,
  events: [{
    id: "event-1",
    eventType: "new_listing",
    address: "100 Main St",
    city: "Columbus",
    zip: "43215",
    propertyType: "apartment",
    bedrooms: 2,
    askingRent: 1_600,
    previousRent: null,
    observedAt: "2026-08-22T19:00:00.000Z",
    propertyManagerName: "Northstar Residential",
  }],
};

describe("Daily Watchlist presentation", () => {
  it("shows personal scoping, retained-event matches, and original observation time", () => {
    const html = renderToStaticMarkup(<MarketIqDailyWatchlists
      activity={activity}
      marketId="columbus-oh"
      timeZone="America/New_York"
      initialWatchlists={[{
        id: "watch-1",
        name: "Downtown arrivals",
        marketId: "columbus-oh",
        filters: { ...EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS, query: "Northstar" },
        visibility: "private",
        isOwner: true,
        isFollowing: true,
        createdAt: "2026-08-22T18:00:00.000Z",
        updatedAt: "2026-08-22T18:00:00.000Z",
      }]}
      saveWatchlist={async () => ({ ok: false, message: "not called" })}
      deleteWatchlist={async () => ({ ok: false, message: "not called" })}
      followWatchlist={async () => ({ ok: false, message: "not called" })}
    />);
    expect(html).toContain("Your watchlists");
    expect(html).toContain("Keep a watchlist private or share it with your workspace");
    expect(html).toContain("Downtown arrivals");
    expect(html).toContain("1 match");
    expect(html).toContain("Aug 22, 3:00 PM EDT");
    expect(html).toContain("Managed by Northstar Residential");
  });
});
