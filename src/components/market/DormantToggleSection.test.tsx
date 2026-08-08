import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DormantToggleSection } from "./DormantToggleSection";
import type { PMListItem as PMListItemType } from "@/lib/types";

// PMListItem mounts AddToWatchList, which reads Clerk's useAuth. Signed-out is
// the right default here: it exercises the row exactly as an anonymous visitor
// browsing a market page sees it.
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: false, userId: null }),
  // Signed-out rows route through GatedLink, which wraps the card in a
  // SignInButton. Pass children straight through so the row still renders.
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// These assert the two things that make the section safe to ship: dormant
// operators are HIDDEN until asked for, and when shown they are labelled with
// the observed fact rather than a claim about the business.

function row(over: Partial<PMListItemType> = {}): PMListItemType {
  return {
    slug: "acme-property-phoenix-az",
    name: "Acme Property Management",
    quadrant: "Scattered / Independent",
    quadrant7Cell: "SFR Independent",
    operatorType: "pm",
    hybrid: false,
    rankOverall: null,
    rankOverallTotal: null,
    rankQuadrant: null,
    rankQuadrantTotal: null,
    domT12: 41,
    totalObservedUnits: 120,
    estManagedUnits: 400,
    primaryCity: "Phoenix",
    primaryCityShare: 0.8,
    claimed: false,
    rentVsComp: null,
    concessionRate: null,
    accentColor: null,
    coverageMapPoints: [],
    compositeStar: null,
    compositeCohortName: null,
    goldCount: 0,
    silverCount: 0,
    operatorStatus: "dormant",
    lastListingDate: "2026-05-27",
    ...over,
  } as PMListItemType;
}

const mount = (dormant: PMListItemType[]) =>
  render(
    <DormantToggleSection dormant={dormant} stateSlug="arizona" citySlug="phoenix" />
  );

describe("DormantToggleSection", () => {
  it("renders nothing when the market has no dormant operators", () => {
    const { container } = mount([]);
    expect(container.firstChild).toBeNull();
  });

  it("hides the operators until the toggle is opened", () => {
    mount([row()]);
    // Collapsed: the count is offered, the operator is not yet listed.
    expect(screen.getByRole("button", { name: /show 1 dormant operator/i })).toBeTruthy();
    expect(screen.queryByText("Acme Property Management")).toBeNull();
  });

  it("reveals the operators on click and flips the label", async () => {
    mount([row(), row({ slug: "beta-pm-phoenix-az", name: "Beta PM" })]);
    const btn = screen.getByRole("button", { name: /show 2 dormant operators/i });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(btn);
    expect(screen.getByText("Acme Property Management")).toBeTruthy();
    expect(screen.getByText("Beta PM")).toBeTruthy();
    expect(screen.getByRole("button", { name: /hide 2 dormant operators/i })).toBeTruthy();
  });

  it("labels each revealed operator Dormant with its last observed listing", async () => {
    mount([row()]);
    await userEvent.click(screen.getByRole("button", { name: /show/i }));
    expect(screen.getByText("Dormant")).toBeTruthy();
    // UTC-parsed, so it must not slip to May 26 for anyone west of GMT.
    expect(screen.getByText(/last listing May 27, 2026/)).toBeTruthy();
  });

  it("explains the exclusion without claiming the operator stopped operating", async () => {
    mount([row()]);
    await userEvent.click(screen.getByRole("button", { name: /show/i }));
    const body = document.body.textContent ?? "";
    expect(body).toMatch(/no new listings inside the recency window/i);
    expect(body).toMatch(/held out of the ranked list/i);
    // The words we never use — each asserts a business fact we cannot observe.
    for (const forbidden of [/\binactive\b/i, /\bdeparted\b/i, /left the market/i, /out of business/i, /\bclosed\b/i]) {
      expect(body).not.toMatch(forbidden);
    }
  });
});
