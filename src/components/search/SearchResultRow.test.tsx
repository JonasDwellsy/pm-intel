import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SearchResultRow } from "./SearchResultRow";
import type { PMSearchResult } from "@/lib/pm-search";

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
