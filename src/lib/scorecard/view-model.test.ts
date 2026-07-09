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
  shareOfMarket?: number | null;
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
  assert.match(row.value, /managed units \(est\.\)/i);
  assert.doesNotMatch(row.value, /confidence/i); // confidence dropped from headline (still in scaleFit.estimate)
  assert.match(row.value, /SFR Independent/i); // type label included
  assert.match(row.value, /Chattanooga/i); // market name included
});

test("operating rows carry label/value/position/star and drop null-percentile metrics", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      performance: { domT12: 18, marketDomT12: 31, peerQuadrantDomT12: 25, houseDomT12: 16, aptDomT12: 22, domStar: "silver" },
      rentPerformance: { pmYoyChange: 0.031, cohortMedianYoyChange: 0.028, star: null },
      marketing: { compositeScore: 88, star: "silver" },
      tenancy: { multiEpisodeUnits: 168, multiEpisodePct: 31, retention18Pct: 72.4,
                 retentionCurve: { m12: 85.3, m18: 72.4, m24: 60.2 },
                 tenancyQualified: true, tenancySuppressed: false, star: "gold" },
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
  // Lease-up benchmarks against the same-quadrant peer (cohort) median
  // (peerQuadrantDomT12), NOT the whole-MSA median (marketDomT12) — consistent
  // with the other cards. "average" wording retired in favor of "cohort median".
  assert.equal(dom.benchmark, "cohort 25d");
  assert.match(dom.interpretation, /Leases in about 18 days, versus a 25-day cohort median\./);
  assert.equal(v.operating.sectionLabel, "good"); // composite 68
  // Tenant retention renders retention18Pct (share reaching 18 months), NOT
  // overallGap or multiEpisodePct (analysis-pool size decoys). The big value is
  // a clean "%" that fits the headline slot; the "stay 1.5+ years" meaning lives
  // in the interpretation.
  const tenancy = v.operating.metrics.find((m) => m.key === "tenancy")!;
  assert.equal(tenancy.value, "72%");
  assert.match(tenancy.interpretation, /About 72% of Doorby's tenancies reach 1.5 years/);
  assert.deepEqual(tenancy.sub, []); // 12-/24-mo sub-line removed
});

// GUARDRAIL: locks each Operating metric to its correct seed field so a future
// wrong-field regression (like tenancy showing multiEpisodePct) fails CI. Each
// field gets a distinct value + a decoy where a wrong field would be plausible.
test("GUARDRAIL: operating metrics map to the correct seed field (not a decoy)", () => {
  const sc = scFixture({
    performance: { domT12: 40, marketDomT12: 50, domStar: "silver" },
    // multiEpisodePct/multiEpisodeUnits are DECOYS — the value must be retention18Pct.
    tenancy: { multiEpisodePct: 88, multiEpisodeUnits: 99, retention18Pct: 61,
               tenancyQualified: true, tenancySuppressed: false, star: "gold" },
    rentPerformance: { pmYoyChange: 0.05, cohortMedianYoyChange: 0.02, star: null },
    marketing: { compositeScore: 77, star: "silver" },
    rank: { percentiles: { dom: 66, tenancy: 82, rentPerformance: 48, marketing: 70, communityVisibility: null } },
  });
  const v = buildScorecardView({ scorecard: sc, pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01 } as any);
  const by = new Map(v.operating.metrics.map((m) => [m.key, m.value]));
  assert.equal(by.get("dom"), "40d");            // performance.domT12
  assert.equal(by.get("tenancy"), "61%"); // tenancy.retention18Pct — NOT the 88% multiEpisodePct decoy
  assert.equal(by.get("rentPerformance"), "5.0%"); // rentPerformance.pmYoyChange
  assert.equal(by.get("marketing"), "77");         // marketing.compositeScore
});

test("tenancy renders 18-month retention, not multiEpisodePct", () => {
  const sc = scFixture({
    pm: { slug: "x", name: "X", quadrant7Cell: "SFR Independent" },
    // decoy that must NOT be shown as the value:
    tenancy: { multiEpisodePct: 88, retention18Pct: 72.4,
               tenancyQualified: true, tenancySuppressed: false, star: "gold" },
  });
  const vm = buildScorecardView({
    scorecard: sc,
    pool: [{ slug: "x", name: "X", quadrant7Cell: "SFR Independent", scorecard: sc }],
    trajectory: { points: [] },
    marketConcessionMedian: 0.01,
  } as any);
  const row = vm.operating.metrics.find((m) => m.key === "tenancy")!;
  assert.equal(row.value, "72%");     // retention18Pct — NOT the 88% decoy
});

test("tenancy suppressed shows the caveat, not a value", () => {
  const sc = scFixture({
    pm: { slug: "y", name: "Y", quadrant7Cell: "SFR Independent" },
    tenancy: { retention18Pct: null, tenancyQualified: false,
               tenancySuppressed: true,
               tenancySuppressedReason: "Too early to assess renewal — this operator has been tracked 1.3 years.",
               star: null },
  });
  const vm = buildScorecardView({
    scorecard: sc,
    pool: [{ slug: "y", name: "Y", quadrant7Cell: "SFR Independent", scorecard: sc }],
    trajectory: { points: [] },
    marketConcessionMedian: 0.01,
  } as any);
  const row = vm.operating.metrics.find((m) => m.key === "tenancy");
  assert.ok(row, "suppressed tenancy row is still present");
  assert.equal(row!.value, "—");
  assert.match(row!.interpretation, /Too early to assess renewal/);
});

// The position bar + label read the primary 7-cell cohort percentile (where the
// star lives), not the MSA-wide flat value.
test("operating position + label use the primary cohort percentile, not MSA flat", () => {
  const sc = scFixture({
    tenancy: { retention18Pct: 65, tenancyQualified: true, tenancySuppressed: false, star: "gold" },
    rank: {
      percentiles: { dom: 40, tenancy: 40, rentPerformance: 40, marketing: 40, communityVisibility: null },
      percentilesMulti: { tenancy: { primary: 90, fallback: 80, msa: 40 } },
    },
  });
  const v = buildScorecardView({ scorecard: sc, pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01 } as any);
  const ten = v.operating.metrics.find((m) => m.key === "tenancy")!;
  assert.equal(ten.position, 0.9); // primary cohort 90, not msa 40
  assert.equal(ten.label, "strong"); // 90 → strong, not 40 → neutral
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

test("reach, quality, and share sparklines populate from trajectory", () => {
  const points: TrajPoint[] = [
    { portfolioPoint: 100, goldCount: 1, silverCount: 1, submarketCount: 3, shareOfMarket: 0.10 },
    { portfolioPoint: 120, goldCount: 2, silverCount: 1, submarketCount: 4, shareOfMarket: 0.12 },
    { portfolioPoint: 140, goldCount: 3, silverCount: 1, submarketCount: 6, shareOfMarket: 0.15 },
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
  assert.deepEqual(spark("share").series, [0.10, 0.12, 0.15]);
  assert.equal(spark("share").direction, "growing"); // scale-invariant: +50%
});

test("share sparkline stays empty (building history) when points carry no shareOfMarket", () => {
  // Pre-backfill state: recon rows have no t12ListingsCount → shareOfMarket null.
  const points: TrajPoint[] = [
    { portfolioPoint: 100, submarketCount: 3 },
    { portfolioPoint: 120, submarketCount: 4 },
    { portfolioPoint: 140, submarketCount: 6 },
  ];
  const view = buildScorecardView({
    scorecard: scFixture({ rentTrajectory: [] }),
    pool: [],
    trajectory: { points },
    marketConcessionMedian: 0.01,
  });
  const share = view.momentum.sparklines.find((s) => s.key === "share")!;
  assert.equal(share.series.length, 0);
  assert.equal(share.direction, "insufficient");
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
      lendingSignals: { geographicConcentration: { top3CityShare: 0.84, cohortMedianTop3: 0.61 } },
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

// --- Task 1: operator tenure ---
// (The vacancy-signal test that used to live here was removed alongside
// the vacancy-signal machinery — see the Classic-retirement cleanup.)

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

// --- Task 2: concession detail + apartment/house unit mix ---

test("concession detail surfaces rate, market median, patterns, samples", () => {
  const focalScorecard = scFixture({
    pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent", companyId: "1" },
    coverage: { t12Listings: 100 },
    concessionRate: 0.4,
    concessionListingCount: 40,
    concessionPatterns: ["move_in_special"],
    concessionSamples: ["Move in today and get a free month on us"],
  });
  // buildConcessionContext's benchmark is the LISTING-WEIGHTED market rate:
  // total concession listings ÷ total T12 listings across the pool (incl. the
  // focal). Here: (40 + 5 + 10) / (100 + 50 + 50) = 55/200 = 0.275 -> 27.5%.
  // Note this deliberately differs from the old median-of-rates (which was
  // 20%) — that's the whole point of the switch.
  const pool = [
    { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent", scorecard: focalScorecard },
    { slug: "member-a", name: "A", quadrant7Cell: "SFR Independent", scorecard: scFixture({ pm: { slug: "member-a", name: "A", quadrant7Cell: "SFR Independent" }, coverage: { t12Listings: 50 }, concessionRate: 0.1, concessionListingCount: 5 }) },
    { slug: "member-b", name: "B", quadrant7Cell: "SFR Independent", scorecard: scFixture({ pm: { slug: "member-b", name: "B", quadrant7Cell: "SFR Independent" }, coverage: { t12Listings: 50 }, concessionRate: 0.2, concessionListingCount: 10 }) },
  ];
  const v = buildScorecardView({
    scorecard: focalScorecard,
    pool,
    trajectory: { points: [] },
    marketConcessionMedian: 0.01,
  });
  assert.ok(v.operating.concession != null);
  assert.equal(v.operating.concession!.ratePct, 40);
  assert.ok(Math.abs(v.operating.concession!.marketRatePct! - 27.5) < 1e-6); // listing-weighted 55/200
  assert.equal(v.operating.concession!.patterns.length >= 1, true);
  assert.equal(v.operating.concession!.patterns[0], "Move-in special");
  assert.equal(v.operating.concession!.samples.length, 1);
});

test("no concession object when operator has zero concessions", () => {
  const focalScorecard = scFixture({
    coverage: { t12Listings: 100 },
    concessionRate: 0,
    concessionListingCount: 0,
  });
  const v = buildScorecardView({
    scorecard: focalScorecard,
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
  });
  assert.equal(v.operating.concession, null);
});

test("no concession object when concessionRate is absent", () => {
  const focalScorecard = scFixture({ coverage: { t12Listings: 100 } });
  const v = buildScorecardView({
    scorecard: focalScorecard,
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
  });
  assert.equal(v.operating.concession, null);
});

test("unit mix present for SFR/hybrid with a nonzero split; null for pure MF", () => {
  const sfr = buildScorecardView({
    scorecard: scFixture({
      pm: { quadrant7Cell: "SFR Independent" },
      performance: { houseUrusT12: 1035, aptUrusT12: 258 },
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: null,
  });
  assert.deepEqual(
    { h: sfr.scaleFit.unitMix!.houseUrus, a: sfr.scaleFit.unitMix!.aptUrus },
    { h: 1035, a: 258 }
  );

  const mf = buildScorecardView({
    scorecard: scFixture({
      pm: { quadrant7Cell: "Large MF/BTR Independent" },
      performance: { houseUrusT12: 0, aptUrusT12: 155 },
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: null,
  });
  assert.equal(mf.scaleFit.unitMix, null);
});

test("unit mix present for Hybrid quadrant7Cell", () => {
  const hybrid = buildScorecardView({
    scorecard: scFixture({
      pm: { quadrant7Cell: "Hybrid" },
      performance: { houseUrusT12: 400, aptUrusT12: 100 },
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: null,
  });
  assert.ok(hybrid.scaleFit.unitMix != null);
  assert.deepEqual(
    { h: hybrid.scaleFit.unitMix!.houseUrus, a: hybrid.scaleFit.unitMix!.aptUrus },
    { h: 400, a: 100 }
  );
});

test("unit mix null for SFR when house+apt urus total is zero", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { quadrant7Cell: "SFR Independent" },
      performance: { houseUrusT12: 0, aptUrusT12: 0 },
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: null,
  });
  assert.equal(v.scaleFit.unitMix, null);
});

// --- v0.6.5: estimated managed units fallback (when pipeline portfolioEstimate absent) ---

test("SFR with no pipeline estimate gets turnover-adjusted estimate (default k)", () => {
  const v = buildScorecardView({
    scorecard: scFixture({ pm: { quadrant7Cell: "SFR Independent" }, coverage: { urusT12: 100 } }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: null,
  });
  assert.equal(v.scaleFit.estimate.point, 300); // 100 × default 3.0
  assert.equal(v.scaleFit.estimate.status, "estimated");
  const scaleRow = v.readout.find((r) => r.area === "Scale & Fit")!;
  assert.match(scaleRow.value, /managed units \(est\.\)/i);
});

test("SFR estimate honors an explicit sfrMultiplier", () => {
  const v = buildScorecardView({
    scorecard: scFixture({ pm: { quadrant7Cell: "SFR Independent" }, coverage: { urusT12: 100 } }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: null, sfrMultiplier: 2,
  });
  assert.equal(v.scaleFit.estimate.point, 200);
});

test("MF (not thin) uses declared community units, no band", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { quadrant7Cell: "Large MF/BTR Independent" },
      coverage: { urusT12: 120, observedCommunities: 5, observedCommunityTotalUnits: 500 },
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: null,
  });
  assert.equal(v.scaleFit.estimate.point, 500);
  assert.equal(v.scaleFit.estimate.low, null);
});

test("thin MF (≤2 communities) keeps 'self-report', no estimate", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { quadrant7Cell: "Small MF/BTR Independent" },
      coverage: { urusT12: 40, observedCommunities: 1, observedCommunityTotalUnits: 300 },
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: null,
  });
  assert.equal(v.scaleFit.estimate.point, null);
  const scaleRow = v.readout.find((r) => r.area === "Scale & Fit")!;
  assert.match(scaleRow.value, /self-report/i);
});

test("pipeline portfolioEstimate wins over the read-time fallback", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { quadrant7Cell: "SFR Independent" },
      coverage: { urusT12: 100 },
      portfolioEstimate: { status: "estimated", point: 640, low: 400, high: 900, confidence: "High" },
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: null,
  });
  assert.equal(v.scaleFit.estimate.point, 640); // not 300
  assert.equal(v.scaleFit.estimate.confidence, "High");
});

// --- Task 3: cross-market aggregate (footprint sparkline + member markets) ---

test("cross-market footprint sparkline + market list for multi-market operator", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent", companyId: "1" },
      canonicalOperatorId: "doorby",
    }),
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
    marketCount: 3,
    memberMarketNames: ["Charlotte", "Baltimore", "Chicago"],
    aggregateTrajectory: {
      points: [
        { portfolioPoint: 100, marketsPresent: 2 },
        { portfolioPoint: 110, marketsPresent: 3 },
        { portfolioPoint: 120, marketsPresent: 3 },
      ],
    },
  });
  assert.deepEqual(v.scaleFit.crossMarket!.marketNames, ["Charlotte", "Baltimore", "Chicago"]);
  assert.equal(v.scaleFit.crossMarket!.canonicalSlug, "doorby");
  const fp = v.momentum.sparklines.find((s) => s.key === "footprint")!;
  assert.deepEqual(fp.series, [2, 3, 3]);
});

test("no crossMarket for single-market operator", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent", companyId: "1" },
      canonicalOperatorId: "doorby-chattanooga-tn",
    }),
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
  });
  assert.equal(v.scaleFit.crossMarket, null);
  const fp = v.momentum.sparklines.find((s) => s.key === "footprint")!;
  assert.deepEqual(fp.series, []);
});

test("'Also operates in' excludes the home market from the member list", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent", companyId: "1" },
      market: { id: "chattanooga-tn", name: "Chattanooga", state: "TN", fullName: "Chattanooga MSA" },
      canonicalOperatorId: "doorby",
    }),
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
    marketCount: 2,
    memberMarketNames: ["Chattanooga MSA", "Nashville MSA"], // home + one other
  } as any);
  assert.deepEqual(v.scaleFit.crossMarket!.marketNames, ["Nashville MSA"]); // home dropped
  assert.equal(v.header.singleMarket, false);
});

test("single-member canonical whose only market is the home market → single-market, no crossMarket (the Crye Leike case)", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { slug: "crye-leike-memphis", name: "Crye Leike", quadrant7Cell: "SFR Independent", companyId: "1" },
      market: { id: "memphis-tn-ms-ar", name: "Memphis", state: "TN", fullName: "Memphis, TN-MS-AR MSA" },
      // has a canonical id that differs from the slug, but the only member market IS the home market
      canonicalOperatorId: "crye-leike-property-management",
    }),
    pool: [],
    trajectory: { points: [] },
    marketConcessionMedian: null,
    marketCount: 1,
    memberMarketNames: ["Memphis, TN-MS-AR MSA"],
  } as any);
  assert.equal(v.scaleFit.crossMarket, null); // not "Also operates in Memphis"
  assert.equal(v.header.singleMarket, true); // footprint reads "1 market", not "Multi-market"
});
