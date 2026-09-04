import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { ReportTeaser } from "./ReportTeaser";

// The teaser is the whole sales surface for an invited buyer arriving cold.
// It must not promise what the paid report does not contain, and it must give
// them a way to see a complete report before paying.

const scorecard = {
  pm: { slug: "acme-property-management-denver-co", name: "Acme Property Management",
        quadrant7Cell: "SFR Independent", quadrant: "Scattered / Independent" },
  market: { id: "denver-co", fullName: "Denver MSA", state: "CO", name: "Denver" },
  coverage: { t12Listings: 412, citiesObserved: 9, observedCommunities: 3, monthsOnPlatform: 26 },
  performance: { domStar: "gold" }, tenancy: { star: "silver" },
  rentPerformance: { star: null }, marketing: { compositeScore: 74, star: "silver" },
  communityVisibility: { star: null },
} as never;

const tierInfo = { label: "Full ranking", blurb: "Enough live inventory to score on all five measures." } as never;

const text = () =>
  render(<ReportTeaser scorecard={scorecard} tierInfo={tierInfo} />).container.textContent ?? "";

describe("ReportTeaser", () => {
  test("does not promise a peer rank or percentile", () => {
    // HARD CONSTRAINT: scorecards never surface rank or composite (PR #132).
    // Advertising it here sells a buyer something they will not receive.
    const t = text().toLowerCase();
    expect(t).not.toContain("percentile");
    expect(/\brank\b/.test(t)).toBe(false);
  });

  test("every locked row says what the paid report reveals", () => {
    // Grey blocks alone read as broken, not as locked-and-worth-buying.
    const { container } = render(<ReportTeaser scorecard={scorecard} tierInfo={tierInfo} />);
    const items = [...container.querySelectorAll("li")];
    const locked = items.filter((li) => (li.textContent ?? "").length > 0);
    expect(locked.length).toBeGreaterThan(3);
    for (const li of locked) {
      expect((li.textContent ?? "").length).toBeGreaterThan(24);
    }
  });

  test("offers a free sample report", () => {
    const { container } = render(<ReportTeaser scorecard={scorecard} tierInfo={tierInfo} />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/sample");
  });

  test("names the operator and its market so the page stands alone", () => {
    // An invited buyer lands here from a link with no homepage context.
    const t = text();
    expect(t).toContain("Acme Property Management");
    expect(t).toContain("Denver");
  });
});
