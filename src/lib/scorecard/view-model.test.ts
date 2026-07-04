import test from "node:test";
import { strict as assert } from "node:assert";
import { buildScorecardView } from "./view-model";
import type { ScorecardData } from "@/lib/types";

type TrajPoint = {
  portfolioPoint: number | null;
  goldCount?: number;
  silverCount?: number;
  submarketCount?: number | null;
  concessionRate?: number | null;
  eligible?: boolean;
  date?: string;
};

type PoolMemberFixture = {
  slug: string;
  name?: string;
  quadrant7Cell?: string | null;
  rentTrajectory?: Array<{ quarter: string; mixAdjMedian: number }> | null;
  scorecard?: any;
};

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

function makePool(members: PoolMemberFixture[]) {
  return members.map((m) => ({
    slug: m.slug,
    name: m.name ?? m.slug,
    quadrant7Cell: m.quadrant7Cell ?? "SFR Independent",
    scorecard: m.scorecard ?? scFixture({
      pm: { slug: m.slug, name: m.name ?? m.slug, quadrant7Cell: m.quadrant7Cell ?? "SFR Independent" },
      rentTrajectory: m.rentTrajectory ?? null,
    }),
  }));
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
  assert.match(row.value, /est\. units/i);
  assert.doesNotMatch(row.value, /confidence/i); // confidence dropped from headline (still in scaleFit.estimate)
  assert.match(row.value, /SFR Independent/i); // type label included
  assert.match(row.value, /Chattanooga/i); // market name included
});

test("operating rows carry label/value/position/star and drop null-percentile metrics", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      performance: { domT12: 18, marketDomT12: 31, houseDomT12: 16, aptDomT12: 22, domStar: "silver" },
      rentPerformance: { pmYoyChange: 0.031, cohortMedianYoyChange: 0.028, star: null },
      marketing: { compositeScore: 88, star: "silver" },
      tenancy: { multiEpisodePct: 31, star: "gold" }, // seed scale is 0–100, not a fraction
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
  // Regression: multiEpisodePct is already 0–100 in the seed — render "31%",
  // never "3100%" (the *100 bug that showed "2200%" on real data).
  const tenancy = v.operating.metrics.find((m) => m.key === "tenancy")!;
  assert.equal(tenancy.value, "31%");
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

test("momentum falls back to quality series when portfolio series is empty (MF/BTR, no self-report)", () => {
  const points: TrajPoint[] = [
    { portfolioPoint: null, goldCount: 1, silverCount: 1 },
    { portfolioPoint: null, goldCount: 2, silverCount: 1 },
    { portfolioPoint: null, goldCount: 3, silverCount: 2 },
    { portfolioPoint: null, goldCount: 4, silverCount: 2 },
  ];
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { quadrant7Cell: "MF/BTR" },
      portfolioEstimate: { status: "insufficient_data", point: null, low: null, high: null, confidence: null },
      coverage: { monthsOnPlatform: 57, observedCommunities: 12 },
      rentTrajectory: [],
    }),
    pool: [],
    trajectory: { points },
    marketConcessionMedian: null,
  });
  assert.notEqual(v.momentum.direction, "insufficient");
  const row = v.readout.find((r) => r.area === "Momentum")!;
  assert.match(row.value, /Operating quality/i);
  assert.doesNotMatch(row.value, /Building history/i);
  // portfolio sparkline itself is untouched — still reflects its own empty/insufficient state
  const portfolio = v.momentum.sparklines.find((s) => s.key === "portfolio")!;
  assert.equal(portfolio.direction, "insufficient");
  assert.deepEqual(portfolio.series, []);
});

test("rent tier position is populated from operator rent vs pool", () => {
  // focal rent 2000 above pool [1000, 1500] → upper half
  const focalRentTraj = [{ quarter: "2024-Q4", mixAdjMedian: 2000 }];
  const view = buildScorecardView({
    scorecard: scFixture({ rentTrajectory: focalRentTraj }),
    pool: makePool([
      { slug: "member-a", rentTrajectory: [{ quarter: "2024-Q4", mixAdjMedian: 1000 }] },
      { slug: "member-b", rentTrajectory: [{ quarter: "2024-Q4", mixAdjMedian: 1500 }] },
    ]),
    trajectory: { points: [] },
    marketConcessionMedian: 0.01,
  });
  assert.ok(view.scaleFit.rentTier != null && view.scaleFit.rentTier.position > 0.5);
});

test("reach and quality sparklines populate from trajectory; share stays empty", () => {
  const points: TrajPoint[] = [
    { portfolioPoint: 100, goldCount: 1, silverCount: 1, submarketCount: 3 },
    { portfolioPoint: 120, goldCount: 2, silverCount: 1, submarketCount: 4 },
    { portfolioPoint: 140, goldCount: 3, silverCount: 1, submarketCount: 6 },
  ];
  const view = buildScorecardView({
    scorecard: scFixture({ rentTrajectory: [] }),
    pool: [],
    trajectory: { points },
    marketConcessionMedian: 0.01,
  });
  const spark = (k: string) => view.momentum.sparklines.find((s) => s.key === k)!;
  assert.deepEqual(spark("reach").series, [3, 4, 6]);
  assert.deepEqual(spark("quality").series, [3, 5, 7]); // gold*2 + silver
  assert.equal(spark("share").series.length, 0);
});

test("thin MF/BTR operator: maturityNote contains 'Early coverage', communitiesObserved = 1, readout[0] mentions community + self-report, momentum readout contains 'mo observed' when insufficient", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { quadrant7Cell: "MF/BTR" },
      coverage: { observedCommunities: 1, monthsOnPlatform: 6, urusT12: 58, totalObservedUnits: 58 },
      portfolioEstimate: { status: "insufficient_data", point: null, low: null, high: null, confidence: null },
      rentTrajectory: [],
    }),
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
  });
  assert.ok(v.maturityNote != null && v.maturityNote.includes("Early coverage"));
  assert.equal(v.scaleFit.communitiesObserved, 1);
  const scaleRow = v.readout.find((r) => r.area === "Scale & Fit")!;
  assert.match(scaleRow.value, /community/i);
  assert.match(scaleRow.value, /self-report/i);
  // momentum: all series insufficient (no trajectory points), months = 6
  const momRow = v.readout.find((r) => r.area === "Momentum")!;
  assert.match(momRow.value, /6 mo observed/i);
});

test("maturity note lead: 'Limited footprint' at months >= 18, 'Early coverage' below that (single-community MF)", () => {
  const longHistory = buildScorecardView({
    scorecard: scFixture({
      pm: { quadrant7Cell: "MF/BTR" },
      coverage: { observedCommunities: 1, monthsOnPlatform: 57, urusT12: 58, totalObservedUnits: 58 },
      portfolioEstimate: { status: "insufficient_data", point: null, low: null, high: null, confidence: null },
      rentTrajectory: [],
    }),
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
  });
  assert.ok(longHistory.maturityNote != null);
  assert.match(longHistory.maturityNote!, /^Limited footprint —/);
  assert.doesNotMatch(longHistory.maturityNote!, /Early coverage/);

  const shortHistory = buildScorecardView({
    scorecard: scFixture({
      pm: { quadrant7Cell: "MF/BTR" },
      coverage: { observedCommunities: 1, monthsOnPlatform: 6, urusT12: 58, totalObservedUnits: 58 },
      portfolioEstimate: { status: "insufficient_data", point: null, low: null, high: null, confidence: null },
      rentTrajectory: [],
    }),
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
  });
  assert.ok(shortHistory.maturityNote != null);
  assert.match(shortHistory.maturityNote!, /^Early coverage —/);
});

test("non-thin operator (observedCommunities = 40): maturityNote is null", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      coverage: { observedCommunities: 40, monthsOnPlatform: 48, urusT12: 2000 },
    }),
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
  });
  assert.equal(v.maturityNote, null);
});

test("SFR operator: communitiesObserved is null and maturityNote is null even with a small community count", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { quadrant7Cell: "SFR Independent" },
      coverage: { observedCommunities: 26, monthsOnPlatform: 6 },
    }),
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
  });
  assert.equal(v.scaleFit.communitiesObserved, null);
  assert.equal(v.maturityNote, null);
});

test("rentTier populated when scorecard + pool carry rentTrajectory", () => {
  const focalRentTraj = [{ quarter: "2024-Q4", mixAdjMedian: 2000, n: 15 }];
  const v = buildScorecardView({
    scorecard: scFixture({ rentTrajectory: focalRentTraj }),
    pool: makePool([
      { slug: "member-a", rentTrajectory: [{ quarter: "2024-Q4", mixAdjMedian: 1000 }] },
      { slug: "member-b", rentTrajectory: [{ quarter: "2024-Q4", mixAdjMedian: 1500 }] },
    ]),
    trajectory: { points: [] },
    marketConcessionMedian: null,
  });
  assert.ok(v.scaleFit.rentTier !== null);
  assert.equal(v.scaleFit.rentTier!.rentMedian, 2000);
  assert.equal(v.scaleFit.rentTier!.sampleSize, 15);
  assert.ok(v.scaleFit.rentTier!.position > 0.5);
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
  // New format: lists headline text (not a bare count); chip label shows "N to review"
  assert.ok(wr.value.length > 0); // has content
  assert.ok(wr.label != null && /to review/i.test(String(wr.label))); // chip present
});

test("readout[0] Scale & Fit includes type label and market name", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      portfolioEstimate: { status: "estimated", point: 200, low: null, high: null, confidence: "High" },
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: null,
  });
  const row = v.readout.find((r) => r.area === "Scale & Fit")!;
  assert.match(row.value, /SFR Independent/i); // typeLabel from quadrant7Cell
  assert.match(row.value, /Chattanooga/i);      // mktShort from market.name
  assert.match(row.value, /200/);               // point estimate
});

test("readout[2] Momentum gives nuanced phrase for growing trajectory", () => {
  const v = buildScorecardView({
    scorecard: scFixture({ rentTrajectory: [] }),
    pool: [],
    trajectory: { points: [
      { portfolioPoint: 100 }, { portfolioPoint: 120 }, { portfolioPoint: 140 }, { portfolioPoint: 160 },
    ] },
    marketConcessionMedian: null,
  });
  const row = v.readout.find((r) => r.area === "Momentum")!;
  assert.equal(row.value, "Portfolio larger than when first observed");
});

test("readout[3] Watch Items lists item headlines and chip reads 'N to review'", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      concessionRate: 0.48, // triggers "Heavy concession use" watch item
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01,
  });
  const row = v.readout.find((r) => r.area === "Watch Items")!;
  assert.ok(row.value.includes("concession") || row.value.length > 0); // headline text present
  assert.ok(row.label != null && /\d+ to review/i.test(String(row.label))); // "N to review" chip
});

// --- Task 1: vacancy / rent stability / operator tenure ---

test("operating view surfaces vacancy + rent stability from lending-signal builders", () => {
  const focalScorecard = scFixture({
    pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent", companyId: "1" },
    performance: { domT12: 18 },
    tenancy: { overallGap: 2 },
    coverage: { yearsVisible: 4 },
    lendingSignals: { rentStability: { volatilityPP: 1.1, cohortMedianVolatility: 3.0, yearsOfHistory: 4, suppressed: false, star: "gold" } },
  });
  const pool = makePool([
    { slug: "doorby-chattanooga-tn", quadrant7Cell: "SFR Independent", scorecard: focalScorecard },
    { slug: "member-a", quadrant7Cell: "SFR Independent", scorecard: scFixture({ pm: { slug: "member-a", name: "A", quadrant7Cell: "SFR Independent" }, performance: { domT12: 30 }, tenancy: { overallGap: 3 }, coverage: { yearsVisible: 3 } }) },
    { slug: "member-b", quadrant7Cell: "SFR Independent", scorecard: scFixture({ pm: { slug: "member-b", name: "B", quadrant7Cell: "SFR Independent" }, performance: { domT12: 25 }, tenancy: { overallGap: 4 }, coverage: { yearsVisible: 5 } }) },
  ]);
  const v = buildScorecardView({
    scorecard: focalScorecard,
    pool,
    trajectory: { points: [] },
    marketConcessionMedian: 0.01,
  });
  assert.ok(v.operating.vacancy != null && typeof v.operating.vacancy.pct === "number");
  assert.ok(v.operating.rentStability != null);
  assert.equal(v.operating.rentStability!.suppressed, false);
  assert.equal(v.operating.rentStability!.volatilityPP, 1.1);
  assert.equal(v.operating.rentStability!.cohortMedianPP, 3.0);
  assert.equal(v.operating.rentStability!.star, "gold");
});

test("rent stability suppressed state carries the reason", () => {
  const focalScorecard = scFixture({
    pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent", companyId: "1" },
    coverage: { yearsVisible: 0.5 },
    lendingSignals: { rentStability: { volatilityPP: null, cohortMedianVolatility: null, yearsOfHistory: 0.5, suppressed: true, reason: "Insufficient observation history for a stable estimate.", star: null } },
  });
  const v = buildScorecardView({
    scorecard: focalScorecard,
    pool: makePool([{ slug: "doorby-chattanooga-tn", quadrant7Cell: "SFR Independent", scorecard: focalScorecard }]),
    trajectory: { points: [] },
    marketConcessionMedian: null,
  });
  assert.equal(v.operating.rentStability!.suppressed, true);
  assert.match(v.operating.rentStability!.reason!, /insufficient/i);
});

test("scaleFit tenure surfaces yearsVisible + marketCount", () => {
  const focalScorecard = scFixture({
    pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent", companyId: "1" },
    coverage: { yearsVisible: 4.77 },
  });
  const v = buildScorecardView({
    scorecard: focalScorecard,
    pool: makePool([{ slug: "doorby-chattanooga-tn", quadrant7Cell: "SFR Independent", scorecard: focalScorecard }]),
    trajectory: { points: [] },
    marketConcessionMedian: null,
    marketCount: 1,
  });
  assert.equal(v.scaleFit.tenure!.marketCount, 1);
  assert.ok(v.scaleFit.tenure!.yearsVisible > 0);
  assert.equal(v.scaleFit.tenure!.yearsVisible, 4.77);
});

test("operating.vacancy and operating.rentStability are null when focal is absent from pool", () => {
  const v = buildScorecardView({
    scorecard: scFixture(),
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
  });
  assert.equal(v.operating.vacancy, null);
  assert.equal(v.operating.rentStability, null);
});

test("scaleFit.tenure defaults marketCount to 1 when input.marketCount is omitted", () => {
  const v = buildScorecardView({
    scorecard: scFixture({ coverage: { yearsVisible: 2.1 } }),
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
  });
  assert.equal(v.scaleFit.tenure!.marketCount, 1);
  assert.equal(v.scaleFit.tenure!.yearsVisible, 2.1);
});
