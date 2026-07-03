import test from "node:test";
import { strict as assert } from "node:assert";
import { buildScorecardView } from "./view-model";
import type { ScorecardData } from "@/lib/types";

function scFixture(over: any = {}): ScorecardData {
  return {
    pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent",
          companyId: "191930", website: "https://doorby.com", ...(over.pm ?? {}) },
    market: { id: "chattanooga-tn", name: "Chattanooga", state: "TN", fullName: "Chattanooga MSA" },
    rank: { percentiles: { dom: 66, tenancy: 82, rentPerformance: 48, marketing: 70, communityVisibility: null },
            percentilesMulti: { composite: { primary: 68, msa: 62 } }, compositeCohortUsedForStar: "primary" },
    performance: { domStar: "silver" }, tenancy: { star: "gold" }, rentPerformance: { star: null },
    marketing: { star: "silver" }, communityVisibility: { star: null },
    ...over,
  } as unknown as ScorecardData;
}

test("header carries name, star counts, and both links (companyId + website)", () => {
  const v = buildScorecardView({ scorecard: scFixture(), pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01 });
  assert.equal(v.header.name, "Doorby");
  assert.equal(v.header.dwellsyCompanyUrl, "https://dwellsy.com/company/191930");
  assert.equal(v.header.website, "https://doorby.com");
  assert.equal(v.header.singleMarket, true);
  assert.equal(typeof v.header.goldCount, "number");
});

test("header dwellsyCompanyUrl is null when companyId missing", () => {
  const v = buildScorecardView({ scorecard: scFixture({ pm: { companyId: null, name: "X", slug: "x", quadrant7Cell: "SFR Independent" } }), pool: [], trajectory: { points: [] }, marketConcessionMedian: null });
  assert.equal(v.header.dwellsyCompanyUrl, null);
});

test("readout has the four areas with the Operating Performance label", () => {
  const v = buildScorecardView({ scorecard: scFixture(), pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01 });
  const areas = v.readout.map((r) => r.area);
  assert.deepEqual(areas, ["Scale & Fit", "Operating Performance", "Momentum", "Watch Items"]);
  const op = v.readout.find((r) => r.area === "Operating Performance");
  assert.equal(op!.label, "good"); // composite primary 68 -> good
});

test("scaleFit surfaces estimate band + confidence + observed units, and fills the readout", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      portfolioEstimate: { status: "estimated", point: 644, low: 410, high: 870, confidence: "Medium" },
      coverage: { urusT12: 318, citiesObserved: 3 },
      geographicCoverage: { topCities: [{ name: "Chattanooga", pct: 0.52 }], coverageMapPoints: [] },
      lendingSignals: { geographicConcentration: { top3CityShare: 0.84, cohortMedianTop3: 0.61 } },
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01,
  });
  assert.equal(v.scaleFit.estimate.point, 644);
  assert.equal(v.scaleFit.estimate.confidence, "Medium");
  assert.equal(v.scaleFit.observedUnits, 318);
  assert.equal(v.scaleFit.top3Share, 0.84);
  const row = v.readout.find((r) => r.area === "Scale & Fit")!;
  assert.match(row.value, /644/);
  assert.match(row.value, /Medium/i);
});

test("operating rows carry label/value/position/star and drop null-percentile metrics", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      performance: { domT12: 18, marketDomT12: 31, houseDomT12: 16, aptDomT12: 22, domStar: "silver" },
      rentPerformance: { pmYoyChange: 0.031, cohortMedianYoyChange: 0.028, star: null },
      marketing: { compositeScore: 88, star: "silver" },
      tenancy: { multiEpisodePct: 0.31, star: "gold" },
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01,
  });
  const keys = v.operating.metrics.map((m) => m.key);
  assert.ok(keys.includes("dom"));
  assert.ok(!keys.includes("communityVisibility")); // null percentile + null star -> dropped
  const dom = v.operating.metrics.find((m) => m.key === "dom")!;
  assert.equal(dom.label, "good");        // 66th
  assert.equal(dom.position, 0.66);
  assert.equal(dom.star, "silver");
  assert.equal(v.operating.sectionLabel, "good"); // composite 68
});

test("momentum classifies portfolio from trajectory; other series insufficient for now", () => {
  const v = buildScorecardView({
    scorecard: scFixture({ rentTrajectory: [] }),
    pool: [],
    trajectory: { points: [
      { portfolioPoint: 100 }, { portfolioPoint: 110 }, { portfolioPoint: 120 }, { portfolioPoint: 135 },
    ] },
    marketConcessionMedian: 0.01,
  });
  const portfolio = v.momentum.sparklines.find((s) => s.key === "portfolio")!;
  assert.equal(portfolio.direction, "growing");
  assert.deepEqual(portfolio.series, [100, 110, 120, 135]);
  const reach = v.momentum.sparklines.find((s) => s.key === "reach")!;
  assert.equal(reach.direction, "insufficient"); // no history yet
  assert.equal(v.momentum.direction, "growing");
});

test("watch items + peers assembled; readout shows non-positive count", () => {
  const poolMember = (slug: string, name: string, units: number) => ({
    slug, name, quadrant7Cell: "SFR Independent",
    scorecard: scFixture({ pm: { slug, name, quadrant7Cell: "SFR Independent" },
      portfolioEstimate: { status: "estimated", point: units },
      rank: { percentilesMulti: { composite: { msa: 55 } }, compositeCohortUsedForStar: "msa", percentiles: {} } }),
  });
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent", companyId: "1" },
      concessionRate: 0.48, coverage: { yearsVisible: 2.3 },
      lendingSignals: { geographicConcentration: { top3CityShare: 0.84, cohortMedianTop3: 0.61 },
                        rentStability: { volatilityPP: 1.1, cohortMedianVolatility: 3.0, suppressed: false } },
      portfolioEstimate: { status: "estimated", point: 644 },
    }),
    pool: [
      { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent",
        scorecard: scFixture({ pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent" }, portfolioEstimate: { status: "estimated", point: 644 } }) },
      poolMember("river", "River City Homes", 720),
      poolMember("volunteer", "Volunteer PM", 520),
    ],
    trajectory: { points: [] }, marketConcessionMedian: 0.01,
  });
  assert.ok(v.watchItems.length >= 1 && v.watchItems[0].kind === "risk");
  assert.ok(v.peers.some((p) => p.isFocal && p.slug === "doorby-chattanooga-tn"));
  assert.ok(v.peers.some((p) => p.slug === "river"));
  const wr = v.readout.find((r) => r.area === "Watch Items")!;
  assert.match(wr.value, /\d/); // has a count
});
