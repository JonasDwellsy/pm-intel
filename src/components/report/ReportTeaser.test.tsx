import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { ReportTeaser } from "./ReportTeaser";
import { tierFromScorecard } from "@/lib/report/confidence-tier";

// The teaser is the whole sales surface for an invited buyer arriving cold.
// It must not promise what the paid report does not contain, and it must give
// them a way to see a complete report before paying.
//
// tierInfo below is produced by the REAL tierFromScorecard — not a fabricated
// literal — so these assertions actually exercise the code path that ships.
// A hand-written `{ label, blurb }` object proves nothing: it can drift from
// what confidence-tier.ts actually returns while every assertion here keeps
// passing. tierFromScorecard splits ranked operators into "high" / "moderate"
// confidence purely off scorecard.performance.domT12N vs
// HIGH_CONFIDENCE_MIN_OBS (50, see confidence-tier.ts), so two fixtures differ
// only in that field to land on either side of the split.

function buildScorecard(domT12N: number | null) {
  return {
    pm: { slug: "acme-property-management-denver-co", name: "Acme Property Management",
          quadrant7Cell: "SFR Independent", quadrant: "Scattered / Independent" },
    market: { id: "denver-co", fullName: "Denver MSA", state: "CO", name: "Denver" },
    coverage: { dataTier: "Full ranking", t12Listings: 412, citiesObserved: 9, observedCommunities: 3, monthsOnPlatform: 26 },
    performance: { domStar: "gold", domT12N }, tenancy: { star: "silver" },
    rentPerformance: { star: null }, marketing: { compositeScore: 74, star: "silver" },
    communityVisibility: { star: null },
  } as never;
}

// >= HIGH_CONFIDENCE_MIN_OBS (50) -> "high" confidence.
const highConfidenceScorecard = buildScorecard(120);
// < HIGH_CONFIDENCE_MIN_OBS -> "moderate" confidence, the smaller-sample branch.
const moderateConfidenceScorecard = buildScorecard(12);

const scorecard = highConfidenceScorecard;
const tierInfo = tierFromScorecard(scorecard);

const text = () =>
  render(<ReportTeaser scorecard={scorecard} tierInfo={tierInfo} />).container.textContent ?? "";

describe("ReportTeaser", () => {
  test("does not promise a peer rank or percentile — high confidence", () => {
    // HARD CONSTRAINT: scorecards never surface rank or composite (PR #132).
    // Advertising it here sells a buyer something they will not receive.
    const highTierInfo = tierFromScorecard(highConfidenceScorecard);
    expect(highTierInfo.confidence).toBe("high");
    const t = render(
      <ReportTeaser scorecard={highConfidenceScorecard} tierInfo={highTierInfo} />
    ).container.textContent?.toLowerCase() ?? "";
    expect(t).not.toContain("percentile");
    expect(/\brank\b/.test(t)).toBe(false);
  });

  test("does not promise a peer rank or percentile — moderate confidence", () => {
    // The smaller-sample branch is the one the CRITICAL finding called out by
    // name (it used to say "read the percentiles as directional").
    const moderateTierInfo = tierFromScorecard(moderateConfidenceScorecard);
    expect(moderateTierInfo.confidence).toBe("moderate");
    const t = render(
      <ReportTeaser scorecard={moderateConfidenceScorecard} tierInfo={moderateTierInfo} />
    ).container.textContent?.toLowerCase() ?? "";
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
