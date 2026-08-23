import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketIqCompetitiveSetSignalRules } from "./MarketIqCompetitiveSetSignalRules";

const storedRule = {
  id: "rule-1",
  watchlistId: "watch-1",
  eventType: "rent_changes" as const,
  propertyScope: "peers" as const,
  windowDays: 1 as const,
  condition: "count_at_least" as const,
  threshold: 3,
  enabled: true,
  createdAt: "2026-08-23T09:00:00.000Z",
  updatedAt: "2026-08-23T09:00:00.000Z",
};

describe("MarketIqCompetitiveSetSignalRules", () => {
  it("creates a personal grouped rule and forces comparisons to seven days", async () => {
    const saveRule = vi.fn().mockResolvedValue({ ok: true, rule: storedRule });
    render(<MarketIqCompetitiveSetSignalRules watchlistId="watch-1" canConfigure initialRules={[]} saveRule={saveRule} deleteRule={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Condition"), { target: { value: "increase_at_least" } });
    expect((screen.getByLabelText("Window") as HTMLSelectElement).value).toBe("7");
    expect(screen.getByLabelText("Window").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(saveRule).toHaveBeenCalledWith("watch-1", expect.objectContaining({ condition: "increase_at_least", windowDays: 7, threshold: 3 }));
    await waitFor(() => expect(screen.getByText("Signal rule saved.")).not.toBeNull());
  });

  it("pauses and removes a persisted rule", async () => {
    const paused = { ...storedRule, enabled: false };
    const saveRule = vi.fn().mockResolvedValue({ ok: true, rule: paused });
    const deleteRule = vi.fn().mockResolvedValue({ ok: true });
    render(<MarketIqCompetitiveSetSignalRules watchlistId="watch-1" canConfigure initialRules={[storedRule]} saveRule={saveRule} deleteRule={deleteRule} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(saveRule).toHaveBeenCalledWith("watch-1", expect.objectContaining({ enabled: false }));
    await waitFor(() => expect(screen.getByText("Signal rule paused.")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(deleteRule).toHaveBeenCalledWith("watch-1", "rule-1");
    await waitFor(() => expect(screen.getByText("No signal rules yet. Individual observed events will continue to appear through the watchlist’s existing matching behavior.")).not.toBeNull());
  });

  it("requires following a shared competitive set before configuration", () => {
    render(<MarketIqCompetitiveSetSignalRules watchlistId="watch-1" canConfigure={false} initialRules={[]} saveRule={vi.fn()} deleteRule={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Add rule" })).toBeNull();
    expect(screen.getByText("Follow this team watchlist before creating personal signal rules.")).not.toBeNull();
  });
});
