// dev-only local preview harness for the redesigned scorecard.
// Returns 404 in production. No DB or auth required — renders a pure fixture.

import { notFound } from "next/navigation";
import { ScorecardBody } from "@/components/scorecard/ScorecardBody";
import type { ScorecardView } from "@/lib/scorecard/view-model";
import type { ScorecardData } from "@/lib/types";
import { vacancyDetail, rentStabilityDetail, concessionDetail } from "@/lib/scorecard/operating-detail";

export const dynamic = "force-dynamic";

// ─── minimal ScorecardData fixture (for MethodologyFooter) ─────────────────

const FIXTURE_SCORECARD: ScorecardData = {
  methodologyVersion: "0.24",
  designVersion: "v1.0",
  dataAsOf: "2026-06-30",
  pm: {
    slug: "doorby-realty-phoenix",
    name: "Doorby Realty",
    quadrant: "Scattered / Independent",
    quadrant7Cell: "SFR Independent",
    hybrid: false,
    companyId: "doorby-realty",
    website: "https://doorby.com",
  },
  canonicalOperatorId: "doorby-realty-phoenix",
  market: {
    id: "phoenix-az",
    name: "Phoenix",
    state: "AZ",
    fullName: "Phoenix, AZ",
  },
  rank: {
    overall: 8,
    overallTotal: 42,
    quadrant: 3,
    quadrantTotal: 18,
    quadrantMedianDomT12: 28,
    composite: 71,
    percentiles: {
      dom: 82,
      tenancy: 64,
      rentPerformance: 58,
      marketing: 76,
      communityVisibility: null,
    },
    percentilesMulti: {
      composite: {
        primary: 71,
        primaryCohortN: 18,
        fallback: null,
        fallbackCohortN: null,
        msa: 71,
        msaCohortN: 42,
      },
    },
    weightingScheme: "without_cv",
    compositeStar: "silver",
    compositeCohortUsedForStar: "primary",
  },
  coverage: {
    firstListing: "2021-09-15",
    monthsOnPlatform: 57,
    lifetimeListings: 3840,
    t6Listings: 312,
    t12Listings: 618,
    urusLifetime: 2104,
    urusT12: 481,
    activeListings: 87,
    totalObservedUnits: 481,
    nationalObservedUnitsT12: null,
    citiesObserved: 4,
    dataTier: "Full ranking",
    concentratedShare: 0.72,
    observedCommunities: 9,
    yearsVisible: 4.75,
  },
  performance: {
    domT12: 21,
    domT12N: 618,
    domLifetime: 24,
    houseDomT12: 19,
    houseUrusT12: 380,
    houseEligible: true,
    aptDomT12: 28,
    aptUrusT12: 101,
    aptEligible: true,
    peerQuadrantDomT12: 27,
    peerQuadrantDomLifetime: 29,
    marketDomT12: 28,
    marketDomLifetime: 31,
    domStar: "gold",
    domCohortUsedForStar: "primary",
  },
  rentTrajectory: [
    { quarter: "2025-Q1", mixAdjMedian: 1840, n: 88 },
    { quarter: "2025-Q2", mixAdjMedian: 1870, n: 102 },
    { quarter: "2025-Q3", mixAdjMedian: 1895, n: 118 },
    { quarter: "2025-Q4", mixAdjMedian: 1920, n: 121 },
    { quarter: "2026-Q1", mixAdjMedian: 1950, n: 134 },
    { quarter: "2026-Q2", mixAdjMedian: 1975, n: 109 },
  ],
  rentPerformance: {
    pmYoyChange: 0.038,
    cohortMedianYoyChange: 0.022,
    delta: 0.016,
    percentileRank: 58,
    state: "positive",
    star: "silver",
    cohortUsedForStar: "primary",
  },
  marketing: {
    completeness: 0.88,
    amenitiesMentioned: 6.2,
    descLen: 310,
    completenessScore: 84,
    amenitiesScore: 78,
    descScore: 72,
    medianPhotosT12: 14,
    zeroPhotoT12: 0.02,
    compositeScore: 78,
    star: "silver",
    cohortUsedForStar: "primary",
  },
  tenancy: {
    totalUnits: 481,
    multiEpisodeUnits: 128,
    multiEpisodePct: 26.6,
    overallGap: 18,
    tenancyPercentile: 64,
    apartment: {
      gap: 21,
      n: 101,
      cohortP25: null,
      cohortP50: null,
      cohortP75: null,
      cohortN: 18,
    },
    house: {
      gap: 17,
      n: 380,
      cohortP25: null,
      cohortP50: null,
      cohortP75: null,
      cohortN: 18,
    },
    star: null,
    cohortUsedForStar: "msa",
    yearsVisible: 4.75,
  },
  lendingSignals: {
    rentStability: {
      volatilityPP: 1.8,
      yearsOfHistory: 4,
      cohortMedianVolatility: 3.1,
      suppressed: false,
      star: null,
    },
    geographicConcentration: {
      top3CityShare: 0.91,
      cohortMedianTop3: 0.78,
      cohortLevel: "primary",
      linearPositionIndicator: "more_concentrated",
    },
  },
  geographicCoverage: {
    citiesText: "Phoenix, Scottsdale, Tempe, Mesa",
    topCities: [
      { name: "Phoenix", pct: 0.61 },
      { name: "Scottsdale", pct: 0.18 },
      { name: "Tempe", pct: 0.12 },
    ],
    coverageMapPoints: [],
    msaBackdropPoints: [],
    mapBounds: { north: 33.9, south: 33.2, east: -111.6, west: -112.5 },
  },
  communityVisibility: null,
  classificationRationale:
    "Doorby Realty operates primarily scattered single-family rentals in the Phoenix MSA. Its unit count (481 observed URUs) places it firmly in the SFR Independent cell with no institutional-scale indicators.",
  portfolioEstimate: {
    status: "estimated",
    point: 644,
    low: 410,
    high: 870,
    confidence: "Medium",
  },
  concessionRate: 0.04,
  concessionListingCount: 25,
  concessionPatterns: ["move_in_special"],
  concessionSampleText: "Move-in special: first month free on 12-month leases.",
};

// ─── ScorecardView fixture ───────────────────────────────────────────────────

const FIXTURE_VIEW: ScorecardView = {
  header: {
    name: "Doorby Realty",
    quadrant7Cell: "SFR Independent",
    marketFullName: "Phoenix, AZ",
    singleMarket: true,
    goldCount: 1,
    silverCount: 2,
    dwellsyCompanyUrl: "https://dwellsy.com/company/doorby-realty",
    website: "https://doorby.com",
  },
  readout: [
    {
      area: "Scale & Fit",
      value: "~644 est. units · Medium confidence",
    },
    {
      area: "Operating Performance",
      value: "Above cohort median on 4 of 4 scored dimensions",
      label: "good",
    },
    {
      area: "Momentum",
      value: "Growing",
    },
    {
      area: "Watch Items",
      value: "3 to review · 2 positive",
    },
  ],
  scaleFit: {
    takeaway:
      "Doorby Realty operates in Phoenix, AZ as a SFR Independent.",
    observedUnits: 481,
    estimate: {
      point: 644,
      low: 410,
      high: 870,
      confidence: "Medium",
      status: "estimated",
      message: null,
    },
    topCities: [
      { name: "Phoenix", pct: 0.61 },
      { name: "Scottsdale", pct: 0.18 },
      { name: "Tempe", pct: 0.12 },
    ],
    top3Share: 0.91,
    cohortTop3: 0.78,
    rentTier: { position: 0.72, rentMedian: 1850, marketP25: 1400, marketP75: 2100, sampleSize: 240 },
    communitiesObserved: 36,
    propertyType: "SFR Independent",
    citiesObserved: 4,
    singleMarket: true,
    tenure: { yearsVisible: 4.8, marketCount: 6, cohortMedianYears: 3.1 },
    unitMix: { houseUrus: 210, aptUrus: 60 },
    crossMarket: {
      canonicalSlug: "doorby",
      marketNames: ["Chattanooga", "Nashville", "Knoxville", "Memphis", "Huntsville", "Birmingham"],
    },
  },
  operating: {
    sectionLabel: "good",
    takeaway: "Above the cohort median on 4 of 4 scored dimensions.",
    strongest: ["Lease-up speed", "Marketing discipline"],
    vacancy: { pct: 12.1, cohortMedianPct: 18.4, star: "gold", ...vacancyDetail(12.1, 18.4) },
    rentStability: {
      volatilityPP: 3.2,
      cohortMedianPP: 5.1,
      suppressed: false,
      reason: null,
      star: "silver",
      ...rentStabilityDetail(3.2, 5.1),
    },
    concession: {
      ratePct: 34,
      marketMedianPct: 12,
      patterns: ["Move-in special", "Reduced deposit"],
      samples: ["First month free on a 13-month lease.", "$500 off move-in costs."],
      ...concessionDetail(34, 12),
    },
    watch: [],
    metrics: [
      {
        key: "dom",
        title: "Lease-up speed",
        label: "strong",
        value: "21d",
        benchmark: "market avg 28d",
        position: 0.82,
        star: "gold",
        sub: ["Houses 19d", "Apartments 28d"],
        interpretation: "Leases in about 21 days, versus a 28-day market average.",
      },
      {
        key: "tenancy",
        title: "Tenant retention",
        label: "good",
        value: "9.2mo",
        benchmark: "cohort 6.5 mo",
        position: 0.64,
        star: null,
        sub: ["based on 140 repeat-listed units"],
        interpretation:
          "Median tenancy of about 9.2 months, versus a 6.5-month cohort median (longer = stickier).",
      },
      {
        key: "rentPerformance",
        title: "Rent performance",
        label: "good",
        value: "3.8%",
        benchmark: "cohort 2.2%",
        position: 0.58,
        star: "silver",
        sub: [],
        interpretation: "Year-over-year rent change of 3.8%, versus a 2.2% cohort median.",
      },
      {
        key: "marketing",
        title: "Marketing discipline",
        label: "strong",
        value: "78",
        benchmark: "quality / 100",
        position: 0.76,
        star: "silver",
        sub: [],
        interpretation:
          "Composite listing-quality score of 78 out of 100 (photos, description, completeness).",
      },
    ],
  },
  momentum: {
    direction: "growing",
    takeaway:
      "Doorby Realty appears larger versus when first observed.",
    sparklines: [
      {
        key: "portfolio",
        label: "Portfolio",
        direction: "growing",
        series: [390, 420, 445, 460, 470, 481],
      },
      {
        key: "share",
        label: "Listing share",
        direction: "insufficient",
        series: [],
      },
      {
        key: "reach",
        label: "Geographic reach",
        direction: "growing",
        series: [2, 3, 3, 4, 5],
      },
      {
        key: "quality",
        label: "Operating quality",
        direction: "growing",
        series: [4, 4, 5, 6, 7],
      },
      {
        key: "footprint",
        label: "Cross-market footprint",
        direction: "growing",
        series: [3, 4, 5, 6, 6, 6],
      },
    ],
  },
  watchItems: [
    {
      kind: "risk",
      headline: "High geographic concentration",
      explanation:
        "91% of observed units sit in just 3 cities vs. a cohort median of 78%. Concentration increases exposure to local market shocks.",
      ask: "What's the plan for geographic diversification over the next 12–24 months?",
    },
    {
      kind: "risk",
      headline: "Concession use climbing",
      explanation:
        "Concessions rose from 4% to 11% of listings over recent quarters — a sharp increase.",
      ask: "Is this a response to softening demand, or a deliberate leasing push?",
    },
    {
      kind: "data",
      headline: "Portfolio estimate is model-derived",
      explanation:
        "The 644-unit estimate carries medium confidence. Direct disclosure of total units would sharpen this figure.",
    },
    {
      kind: "positive",
      headline: "Best-in-cohort lease-up speed",
      explanation:
        "21-day average DOM (gold star) — meaningfully faster than the 28-day market average. Suggests strong pricing and listing quality.",
    },
    {
      kind: "positive",
      headline: "Recent rating improvement",
      explanation:
        "The operator moved up in its star rating over the most recent scoring period — a sign of improving operating consistency.",
    },
  ],
  maturityNote: null,
  peers: [
    {
      slug: "sonoran-property-management",
      name: "Sonoran Property Mgmt",
      isFocal: false,
      quadrant7Cell: "SFR Independent",
      estimatedUnits: 820,
      relativeSize: 0.95,
      operatingLabel: "good",
    },
    {
      slug: "doorby-realty-phoenix",
      name: "Doorby Realty",
      isFocal: true,
      quadrant7Cell: "SFR Independent",
      estimatedUnits: 644,
      relativeSize: 0.75,
      operatingLabel: "good",
    },
    {
      slug: "desert-home-partners",
      name: "Desert Home Partners",
      isFocal: false,
      quadrant7Cell: "SFR Independent",
      estimatedUnits: 510,
      relativeSize: 0.59,
      operatingLabel: "neutral",
    },
    {
      slug: "valley-residential-llc",
      name: "Valley Residential LLC",
      isFocal: false,
      quadrant7Cell: "SFR Independent",
      estimatedUnits: 390,
      relativeSize: 0.45,
      operatingLabel: "watch",
    },
  ],
};

// ─── page ────────────────────────────────────────────────────────────────────

export default function ScorecardPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div>
      <div
        style={{
          background: "#fffbea",
          borderBottom: "2px solid #f5c842",
          padding: "10px 24px",
          fontSize: "13px",
          color: "#7a5c12",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <strong>Dev preview</strong> — fixture data, no DB or auth required.
        Remove before shipping.
      </div>
      <ScorecardBody
        view={FIXTURE_VIEW}
        scorecard={FIXTURE_SCORECARD}
        isClaimed={false}
        geographicCoverage={FIXTURE_SCORECARD.geographicCoverage}
      />
    </div>
  );
}
