import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketIqDailyEditionArchive, MarketIqDailyEditionMissing } from "@/components/market-iq/report/MarketIqDailyEditionArchive";
import type { MarketIqDailyEdition } from "@/lib/market-iq/daily-edition-archive";

function edition(id: string, observedAt: string, state: "available" | "unavailable" = "available"): MarketIqDailyEdition<unknown> {
  return { id, observedAt, state, value: null };
}

describe("MarketIqDailyEditionArchive", () => {
  it("links an archived edition to older, newer, and latest persisted reads", () => {
    const latest = edition("latest", "2026-08-23T02:00:00.000Z");
    const current = edition("current", "2026-08-22T02:00:00.000Z");
    const previous = edition("previous", "2026-08-21T02:00:00.000Z", "unavailable");

    render(<MarketIqDailyEditionArchive
      marketId="cleveland-elyria-mentor-oh"
      current={current}
      latest={latest}
      previous={previous}
      next={latest}
      recent={[latest, current, previous]}
      timeZone="America/New_York"
    />);

    expect(screen.getByRole("link", { name: "← Previous day" }).getAttribute("href")).toContain("edition=previous");
    expect(screen.getByRole("link", { name: "Next day →" }).getAttribute("href")).toContain("edition=latest");
    expect(screen.getByRole("link", { name: "Latest" }).getAttribute("href")).toBe("/market-iq/daily?market=cleveland-elyria-mentor-oh");
    expect(screen.getByRole("link", { name: "Aug 20 · read unavailable" })).toBeTruthy();
  });

  it("explains a missing edition without substituting another snapshot", () => {
    render(<MarketIqDailyEditionMissing marketId="cleveland-elyria-mentor-oh" />);

    expect(screen.getByRole("heading", { name: "That saved edition is not available." })).toBeTruthy();
    expect(screen.getByText(/No historical edition has been reconstructed or substituted/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open latest edition" }).getAttribute("href")).toBe("/market-iq/daily?market=cleveland-elyria-mentor-oh");
  });
});
