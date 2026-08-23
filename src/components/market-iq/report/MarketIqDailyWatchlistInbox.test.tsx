import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketIqDailyWatchlistInbox } from "./MarketIqDailyWatchlistInbox";

const state = {
  cadence: "in_app_only" as const,
  lastDeliveredAt: null,
  viewerUserId: "user-1",
  teamMembers: [{ userId: "user-1", name: "Jonas" }, { userId: "user-2", name: "Nikolay" }],
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
    watchlistVisibility: "organization" as const,
    triage: { status: "new" as const, assignedToUserId: null, notes: [] },
  }],
};

const updateTriage = vi.fn().mockResolvedValue({ ok: true, status: "new", assignedToUserId: null });
const addNote = vi.fn().mockResolvedValue({ ok: true, status: "new", assignedToUserId: null });

describe("MarketIqDailyWatchlistInbox", () => {
  it("shows persisted matches with direct evidence links and opt-in delivery", () => {
    render(<MarketIqDailyWatchlistInbox state={state} savePreference={vi.fn()} markRead={vi.fn()} updateTriage={updateTriage} addNote={addNote} />);
    expect(screen.getByRole("heading", { name: "Your match inbox" })).not.toBeNull();
    expect(screen.getByText("Rent fell at 100 Main St")).not.toBeNull();
    expect(screen.getByRole("link", { name: "View property" }).getAttribute("href")).toContain("/market-iq/property/property-1");
    expect(screen.getByRole("link", { name: "Open Daily Edition" }).getAttribute("href")).toContain("edition=edition-1#daily-rent-moves");
    expect((screen.getByLabelText("Delivery") as HTMLSelectElement).value).toBe("in_app_only");
  });

  it("saves an explicit email cadence and scopes read changes to supplied match ids", async () => {
    const savePreference = vi.fn().mockResolvedValue({ ok: true });
    const markRead = vi.fn().mockResolvedValue({ ok: true });
    render(<MarketIqDailyWatchlistInbox state={state} savePreference={savePreference} markRead={markRead} updateTriage={updateTriage} addNote={addNote} />);
    fireEvent.change(screen.getByLabelText("Delivery"), { target: { value: "weekly" } });
    expect(savePreference).toHaveBeenCalledWith("weekly");
    await waitFor(() => expect(screen.getByRole("button", { name: "Mark all read" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(markRead).toHaveBeenCalledWith(["match-1"]);
  });

  it("updates shared triage, assignment, and internal notes", async () => {
    const triage = vi.fn().mockImplementation(async (_matchId, input) => ({ ok: true, ...input }));
    const noteAction = vi.fn().mockResolvedValue({ ok: true, status: "reviewing", assignedToUserId: "user-2", note: { id: "note-1", authorUserId: "user-1", authorName: "You", body: "Check the competing floor plan.", createdAt: "2026-08-23T03:00:00.000Z" } });
    render(<MarketIqDailyWatchlistInbox state={state} savePreference={vi.fn()} markRead={vi.fn()} updateTriage={triage} addNote={noteAction} />);
    fireEvent.change(screen.getByLabelText("Status for Rent fell at 100 Main St"), { target: { value: "reviewing" } });
    expect(triage).toHaveBeenCalledWith("match-1", { status: "reviewing", assignedToUserId: null });
    await waitFor(() => expect(screen.getByLabelText("Assignee for Rent fell at 100 Main St").hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getByLabelText("Assignee for Rent fell at 100 Main St"), { target: { value: "user-2" } });
    await waitFor(() => expect(triage).toHaveBeenLastCalledWith("match-1", { status: "reviewing", assignedToUserId: "user-2" }));
    fireEvent.click(screen.getByText("Internal notes (0)"));
    fireEvent.change(screen.getByLabelText("Add internal note for Rent fell at 100 Main St"), { target: { value: "Check the competing floor plan." } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(noteAction).toHaveBeenCalledWith("match-1", "Check the competing floor plan.");
    await waitFor(() => expect(screen.getByText("Check the competing floor plan.")).not.toBeNull());
  });
});
