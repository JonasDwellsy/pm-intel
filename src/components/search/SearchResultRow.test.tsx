import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SearchResultRow } from "./SearchResultRow";
import type { PMSearchResult } from "@/lib/pm-search";

// v0.27 (Task 6) — "ranked"/"canonical" rows now mount the AddToWatchList
// island, which calls Clerk's useAuth() and throws outside a
// <ClerkProvider/>. These tests don't exercise the pin control itself
// (see AddToWatchList.test.tsx for that) — mock a signed-out session so
// the island quietly renders null and the existing row assertions below
// are unaffected.
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: false, userId: null }),
}));

const market: PMSearchResult = {
  tier: "market", name: "Denver, CO", marketId: "denver-co", marketCity: "Denver",
  stateCode: "CO", stateSlug: "colorado", citySlug: "denver", operatorCount: 145,
  href: "/property-managers/colorado/denver", score: 0,
} as PMSearchResult;

const aliased: PMSearchResult = {
  tier: "ranked", name: "29th Street Property Management", slug: "x-denver-co",
  marketId: "denver-co", marketCity: "Denver", stateCode: "CO", stateSlug: "colorado",
  citySlug: "denver", goldCount: 0, silverCount: 0, t12Listings: 10,
  href: "/property-managers/colorado/denver/x-denver-co", score: 0,
  matchedAlias: "Haven Residential",
} as PMSearchResult;

describe("SearchResultRow", () => {
  it("renders a market row: badge, operator count, market href, no star chip", () => {
    render(<ul><SearchResultRow result={market} active={false} /></ul>);
    expect(screen.getByText("Market")).toBeTruthy();
    expect(screen.getByText("145")).toBeTruthy();
    expect(
      screen.getByRole("link").getAttribute("href")
    ).toContain("/property-managers/colorado/denver");
  });
  it("shows an 'also:' line when a result matched on an alias", () => {
    render(<ul><SearchResultRow result={aliased} active={false} /></ul>);
    expect(screen.getByText(/also:/)).toBeTruthy();
    expect(screen.getByText(/Haven Residential/)).toBeTruthy();
  });
});

// v0.8 dormant tier — the chip now covers canonical (multi-market) rollup
// rows, not just single-market ranked ones. These pin the two halves of the
// rule: fully quiet gets labelled, and the absence of a status renders
// exactly as before rather than mislabelling an active operator.

const dormantCanonical: PMSearchResult = {
  tier: "canonical", name: "Bridge Property Management",
  canonicalSlug: "bridge-property-management", marketCount: 8,
  markets: [{ marketCity: "Nashville", stateCode: "TN" }, { marketCity: "Houston", stateCode: "TX" }],
  goldCount: 0, silverCount: 0, totalT12Listings: 4126, totalT24T12Listings: 0,
  totalUrusT12: 0, status: "dormant", lastListingDate: "2026-04-22",
  href: "/operators/bridge-property-management", score: 0,
} as PMSearchResult;

const activeCanonical: PMSearchResult = {
  ...(dormantCanonical as Record<string, unknown>),
  name: "Active Cross-Market Co", canonicalSlug: "active-cross-market-co",
  status: undefined, lastListingDate: undefined,
} as PMSearchResult;

describe("SearchResultRow — dormant canonical rows", () => {
  it("chips a canonical operator that is dormant in every market", () => {
    render(<ul><SearchResultRow result={dormantCanonical} active={false} /></ul>);
    expect(screen.getByText("Dormant")).toBeTruthy();
    // UTC-parsed, so it must not slip a day for anyone west of GMT.
    expect(screen.getByText(/no listings since Apr 22, 2026/)).toBeTruthy();
  });

  it("renders a canonical row with no status exactly as before — no chip", () => {
    render(<ul><SearchResultRow result={activeCanonical} active={false} /></ul>);
    expect(screen.queryByText("Dormant")).toBeNull();
    expect(screen.queryByText(/no listings since/)).toBeNull();
  });

  it("never asserts the operator stopped operating", () => {
    render(<ul><SearchResultRow result={dormantCanonical} active={false} /></ul>);
    const body = document.body.textContent ?? "";
    for (const forbidden of [/\binactive\b/i, /\bdeparted\b/i, /left the market/i,
                             /out of business/i, /\bclosed\b/i, /shut down/i]) {
      expect(body).not.toMatch(forbidden);
    }
  });
});
