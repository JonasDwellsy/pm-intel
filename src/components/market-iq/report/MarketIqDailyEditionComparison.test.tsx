import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketIqDailyEditionComparisonPanel } from "@/components/market-iq/report/MarketIqDailyEditionComparison";

describe("MarketIqDailyEditionComparisonPanel", () => {
  it("shows current counts, neutral differences, and exact source times", () => {
    render(<MarketIqDailyEditionComparisonPanel
      timeZone="America/New_York"
      comparison={{
        state: "available",
        currentObservedAt: "2026-08-22T02:00:00.000Z",
        previousObservedAt: "2026-08-21T02:00:00.000Z",
        metrics: [
          { key: "new_listings", label: "New listings", current: 46, previous: 40, difference: 6 },
          { key: "rent_moves", label: "Rent moves", current: 14, previous: 14, difference: 0 },
        ],
      }}
    />);

    expect(screen.getByRole("heading", { name: "Observed flow, side by side" })).toBeTruthy();
    expect(screen.getByText("+6")).toBeTruthy();
    expect(screen.getByText("No change")).toBeTruthy();
    expect(screen.getByText(/Aug 20, 10:00 PM EDT/)).toBeTruthy();
    expect(screen.getByText(/Aug 21, 10:00 PM EDT/)).toBeTruthy();
    expect(screen.getByText(/not a rent trend or an inference about market direction/)).toBeTruthy();
  });

  it("states that an unavailable prior read is not replaced by older data", () => {
    render(<MarketIqDailyEditionComparisonPanel
      timeZone="America/New_York"
      comparison={{ state: "previous_unavailable", attemptedAt: "2026-08-21T02:00:00.000Z" }}
    />);

    expect(screen.getByRole("heading", { name: "The preceding edition cannot be compared" })).toBeTruthy();
    expect(screen.getByText(/not compared with an older substitute/)).toBeTruthy();
    expect(screen.getByText("Read attempted Aug 20, 10:00 PM EDT.")).toBeTruthy();
  });
});
