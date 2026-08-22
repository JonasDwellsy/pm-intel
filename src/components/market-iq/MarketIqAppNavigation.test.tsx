import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarketIqAppNavigation } from "@/components/market-iq/MarketIqAppNavigation";

const usePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

describe("MarketIqAppNavigation", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/market-iq/daily");
  });

  it("uses Daily Edition for the desktop and mobile Market intelligence links", () => {
    render(
      <MarketIqAppNavigation
        signedIn
        hasProduct
        clientAdvisoryEnabled={false}
      />,
    );

    const links = screen.getAllByRole("link", { name: "Market intelligence" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/market-iq/daily");
      expect(link.getAttribute("aria-current")).toBe("page");
    }
    expect(screen.getByText("Open Market IQ navigation")).toBeTruthy();
  });
});
