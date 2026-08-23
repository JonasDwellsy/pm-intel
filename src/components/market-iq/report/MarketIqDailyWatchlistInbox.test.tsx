import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketIqDailyWatchlistInbox } from "./MarketIqDailyWatchlistInbox";

const state = {
  cadence: "in_app_only" as const,
  lastDeliveredAt: null,
  matches: [{
    id: "match-1",
    watchlistName: "Downtown rent cuts",
    marketId: "cleveland-elyria-mentor-oh",
    editionId: "edition-1",
    eventKey: "price_change:event-1",
    eventType: "price_change",
    headline: "Rent fell at 100 Main St",
    detail: "Advertised asking rent changed from $1,500 to $1,350.",
    observedAt: "2026-08-22T08:30:00.000Z",
    propertyId: "property-1",
    sectionHref: "#daily-rent-moves",
    readAt: null,
    emailedAt: null,
  }],
};

describe("MarketIqDailyWatchlistInbox", () => {
  it("shows persisted matches with direct evidence links and opt-in delivery", () => {
    render(<MarketIqDailyWatchlistInbox state={state} savePreference={vi.fn()} markRead={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Your match inbox" })).not.toBeNull();
    expect(screen.getByText("Rent fell at 100 Main St")).not.toBeNull();
    expect(screen.getByRole("link", { name: "View property" }).getAttribute("href")).toContain("/market-iq/property/property-1");
    expect(screen.getByRole("link", { name: "Open Daily Edition" }).getAttribute("href")).toContain("edition=edition-1#daily-rent-moves");
    expect((screen.getByLabelText("Delivery") as HTMLSelectElement).value).toBe("in_app_only");
  });

  it("saves an explicit email cadence and scopes read changes to supplied match ids", async () => {
    const savePreference = vi.fn().mockResolvedValue({ ok: true });
    const markRead = vi.fn().mockResolvedValue({ ok: true });
    render(<MarketIqDailyWatchlistInbox state={state} savePreference={savePreference} markRead={markRead} />);
    fireEvent.change(screen.getByLabelText("Delivery"), { target: { value: "weekly" } });
    expect(savePreference).toHaveBeenCalledWith("weekly");
    await waitFor(() => expect(screen.getByRole("button", { name: "Mark all read" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(markRead).toHaveBeenCalledWith(["match-1"]);
  });
});
