import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketIqSectionNavigation } from "@/components/market-iq/MarketIqSectionNavigation";

const usePathname = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

describe("MarketIqSectionNavigation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the active alert workbench and its recipient-scoped open count", async () => {
    usePathname.mockReturnValue("/market-iq/alerts");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 7 }) }));
    render(<MarketIqSectionNavigation />);
    const alerts = screen.getByRole("link", { name: /Alerts/ });
    expect(alerts.getAttribute("href")).toBe("/market-iq/alerts");
    expect(alerts.getAttribute("aria-current")).toBe("page");
    await waitFor(() => expect(screen.getByText("7")).not.toBeNull());
  });
});
