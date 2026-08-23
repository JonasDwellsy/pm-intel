import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketIqAlertWorkbench } from "@/components/market-iq/MarketIqAlertWorkbench";
import type { MarketIqAlertWorkbenchState } from "@/lib/market-iq/daily-alert-workbench";

const state: MarketIqAlertWorkbenchState = {
  viewerUserId: "user-1",
  teamMembers: [{ userId: "user-1", name: "Jonas" }, { userId: "user-2", name: "Nikolay" }],
  truncated: false,
  items: [
    {
      id: "match-1",
      watchlistId: "watch-team",
      watchlistName: "Downtown competitors",
      watchlistVisibility: "organization",
      marketId: "cleveland-elyria-mentor-oh",
      marketName: "Cleveland",
      editionId: "edition-1",
      eventKey: "price_change:event-1",
      eventType: "price_change",
      headline: "Rent fell at 100 Main St",
      detail: "Advertised asking rent changed from $1,500 to $1,350.",
      observedAt: "2026-08-23T08:30:00.000Z",
      city: "Cleveland",
      propertyManagerName: "Northstar Residential",
      propertyId: "property-1",
      sectionHref: "#daily-rent-moves",
      readAt: null,
      emailedAt: null,
      triage: { status: "new", assignedToUserId: null, notes: [] },
    },
    {
      id: "match-2",
      watchlistId: "watch-team",
      watchlistName: "Downtown competitors",
      watchlistVisibility: "organization",
      marketId: "columbus-oh",
      marketName: "Columbus",
      editionId: "edition-2",
      eventKey: "new_to_market:event-2",
      eventType: "new_to_market",
      headline: "A new apartment entered Columbus",
      detail: "The listing was first observed at $1,700 asking rent.",
      observedAt: "2026-08-23T07:30:00.000Z",
      city: "Columbus",
      propertyManagerName: null,
      propertyId: "property-2",
      sectionHref: "#daily-new-listings",
      readAt: null,
      emailedAt: null,
      triage: { status: "reviewing", assignedToUserId: "user-1", notes: [] },
    },
    {
      id: "match-3",
      watchlistId: "watch-private",
      watchlistName: "My private watch",
      watchlistVisibility: "private",
      marketId: "san-jose-sunnyvale-santa-clara-ca",
      marketName: "San Jose",
      editionId: "edition-3",
      eventKey: "off_market:event-3",
      eventType: "off_market",
      headline: "A listing left the market in San Jose",
      detail: "Leased or withdrawn, undetermined.",
      observedAt: "2026-08-22T07:30:00.000Z",
      city: "San Jose",
      propertyManagerName: null,
      propertyId: null,
      sectionHref: "#daily-off-market",
      readAt: "2026-08-22T08:00:00.000Z",
      emailedAt: null,
      triage: { status: "resolved", assignedToUserId: "user-2", notes: [] },
    },
  ],
};

const baseProps = {
  state,
  markRead: vi.fn().mockResolvedValue({ ok: true }),
  updateTriage: vi.fn().mockResolvedValue({ ok: true, status: "new", assignedToUserId: null }),
  addNote: vi.fn().mockResolvedValue({ ok: true, status: "new", assignedToUserId: null }),
};

describe("MarketIqAlertWorkbench", () => {
  it("opens on unresolved alerts across markets with direct property and edition evidence", () => {
    render(<MarketIqAlertWorkbench {...baseProps} bulkUpdate={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Alert workbench" })).not.toBeNull();
    expect(screen.getByText("Rent fell at 100 Main St")).not.toBeNull();
    expect(screen.getByText("A new apartment entered Columbus")).not.toBeNull();
    expect(screen.queryByText("A listing left the market in San Jose")).toBeNull();
    expect(screen.getAllByRole("link", { name: "View property" })[0]?.getAttribute("href")).toContain("/market-iq/property/property-1");
    expect(screen.getAllByRole("link", { name: "Open evidence" })[0]?.getAttribute("href")).toContain("edition=edition-1#daily-rent-moves");
  });

  it("can isolate personal resolved work from the team queue", () => {
    render(<MarketIqAlertWorkbench {...baseProps} bulkUpdate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /All alerts/ }));
    fireEvent.change(screen.getByLabelText("Watchlist access"), { target: { value: "private" } });
    expect(screen.getByText("A listing left the market in San Jose")).not.toBeNull();
    expect(screen.queryByText("Rent fell at 100 Main St")).toBeNull();
  });

  it("bulk-updates every selected visible alert", async () => {
    const bulkUpdate = vi.fn().mockResolvedValue({ ok: true, updatedMatchIds: ["match-1", "match-2"] });
    render(<MarketIqAlertWorkbench {...baseProps} bulkUpdate={bulkUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Select visible" }));
    fireEvent.change(screen.getByLabelText("Set status"), { target: { value: "resolved" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply update" }));
    expect(bulkUpdate).toHaveBeenCalledWith(["match-1", "match-2"], { status: "resolved" });
    await waitFor(() => expect(screen.getByText("2 alerts updated.")).not.toBeNull());
  });
});
