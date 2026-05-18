// Shared TypeScript types for the Dwellsy IQ PM Intel Platform.
// Canonical shapes for v0.6.2 — see Methodology_v0.6_Spec.md (Sections 2–10),
// Methodology_v0.6.1_Patches.md, and Methodology_v0.6.2_Patches.md (8 patches:
// 7-cell taxonomy, multi-level percentile ranks, stars, rent stability,
// short-history caveat, unit-count precision, geographic concentration,
// pre-computed text).
//
// The seed normalizes heterogeneous per-market input schemas down to this
// canonical shape; downstream components read only from this shape.

// 5-cell legacy taxonomy (v0.6.1 form). Kept for route segment back-compat.
export type QuadrantKey =
  | "MF/BTR / Institutional"
  | "MF/BTR / Independent"
  | "Scattered / Institutional"
  | "Scattered / Independent"
  | "Hybrid";

// 7-cell canonical taxonomy (v0.6.2). Used everywhere we render the new
// classification badge and select primary peer cohorts.
export type Quadrant7CellKey =
  | "SFR Independent"
  | "SFR Institutional"
  | "Small MF/BTR Independent"
  | "Small MF/BTR Institutional"
  | "Large MF/BTR Independent"
  | "Large MF/BTR Institutional"
  | "Hybrid";

// Star assignment per metric (Patch 3). Cohort selection falls back
// primary → fallback → MSA depending on cohort size (N ≥ 10 threshold).
export type StarLevel = "gold" | "silver" | null;
export type CohortLevel = "primary" | "fallback" | "msa";

// Multi-level percentile shape used per metric in rank.percentiles.
export interface MultiLevelPercentile {
  primary: number | null;
  primaryCohortN: number | null;
  fallback: number | null;
  fallbackCohortN: number | null;
  msa: number | null;
  msaCohortN: number | null;
}

export interface ScorecardData {
  methodologyVersion: string;
  designVersion?: string; // v1.0 from the new merged seed
  dataAsOf: string; // ISO date
  pm: {
    slug: string;
    name: string;
    quadrant: string; // QuadrantKey (5-cell legacy)
    quadrant7Cell?: Quadrant7CellKey | string; // v0.6.2 canonical
    hybrid: boolean;
    institutional?: boolean;
    accentColor?: string;
    primaryCity?: string;
  };
  market: {
    id: string;
    name: string;
    state: string; // 2-letter
    fullName: string;
  };
  rank: {
    overall: number;
    overallTotal: number;
    quadrant: number | null;
    quadrantTotal: number;
    quadrantMedianDomT12: number | null;
    composite: number | null;
    // v0.6.1 flat shape stays in for back-compat; v0.6.2 widens to nested
    // multi-level objects. The seed populates both — `percentiles.<m>` reads
    // the MSA-level number, `percentilesMulti.<m>` carries the full nested.
    percentiles: {
      dom: number | null;
      tenancy: number | null;
      rentPerformance: number | null;
      marketing: number | null;
      communityVisibility: number | null;
    };
    percentilesMulti?: {
      dom?: MultiLevelPercentile;
      tenancy?: MultiLevelPercentile;
      rentPerformance?: MultiLevelPercentile;
      marketing?: MultiLevelPercentile;
      communityVisibility?: MultiLevelPercentile;
      composite?: MultiLevelPercentile;
    };
    weightingScheme: "with_cv" | "without_cv";
    // Composite star is pre-computed at seed time per Patch 3.
    compositeStar?: StarLevel;
    compositeCohortUsedForStar?: CohortLevel;
    compositeCohortName?: string;
  };
  coverage: {
    firstListing: string;
    monthsOnPlatform: number;
    lifetimeListings: number;
    t6Listings: number | null;
    t12Listings: number;
    urusLifetime: number;
    urusT12: number;
    activeListings: number;
    totalObservedUnits: number;
    nationalObservedUnitsT12: number | null;
    citiesObserved: number;
    dataTier: "Full ranking" | "Limited";
    concentratedShare: number | null;
    // v0.6.2 additions (Patch 6 — unit-count precision).
    observedCommunities?: number;
    observedCommunityTotalUnits?: number;
    yearsVisible?: number;
  };
  performance: {
    domT12: number;
    domT12N: number;
    domLifetime: number;
    houseDomT12: number | null;
    houseUrusT12: number;
    houseEligible: boolean;
    aptDomT12: number | null;
    aptUrusT12: number;
    aptEligible: boolean;
    peerQuadrantDomT12: number | null;
    peerQuadrantDomLifetime: number | null;
    marketDomT12: number;
    marketDomLifetime: number;
    // v0.6.2 DOM star + cohort fields (Patch 3).
    domStar?: StarLevel;
    domCohortUsedForStar?: CohortLevel;
    domCohortName?: string;
  };
  // 6-quarter mix-adjusted median rent series (v0.6.1 — replaces 5-year
  // premium-vs-comp series). Render reports absolute medians + a derived YoY.
  rentTrajectory: Array<{ quarter: string; mixAdjMedian: number; n: number }>;
  // Composite-ranking input: PM YoY rent change vs MSA cohort median. Always
  // present for eligible PMs (one per row in v0.6.1 outputs); nullable for
  // forward-compat with partial data.
  rentPerformance: {
    pmYoyChange: number;
    cohortMedianYoyChange: number | null;
    delta: number;
    percentileRank: number;
    state: "positive" | "neutral" | "negative";
    // v0.6.2 star fields (Patch 3).
    star?: StarLevel;
    cohortUsedForStar?: CohortLevel;
    cohortName?: string;
  } | null;
  marketing: {
    completeness: number;
    amenitiesMentioned: number;
    descLen: number;
    completenessScore: number;
    amenitiesScore: number;
    descScore: number;
    medianPhotosT12: number | null;
    zeroPhotoT12: number | null;
    compositeScore: number;
    // v0.6.2 star fields (Patch 3).
    star?: StarLevel;
    cohortUsedForStar?: CohortLevel;
    cohortName?: string;
  };
  tenancy: {
    totalUnits: number;
    multiEpisodeUnits: number;
    multiEpisodePct: number;
    overallGap: number | null;
    tenancyPercentile: number | null;
    apartment: TenancyAssetBlock;
    house: TenancyAssetBlock;
    // v0.6.2 short-history caveat + star fields (Patches 3 + 5).
    shortHistoryFlag?: boolean;
    yearsVisible?: number;
    star?: StarLevel;
    cohortUsedForStar?: CohortLevel;
    cohortName?: string;
  };
  // v0.6.2 Lending Signals (Patches 4 + 7). The seed populates the two
  // data-pipeline-computed signals; v1.0 design surfaces three more
  // (vacancySignal, operatorStability, pricingTier) that the renderer
  // derives from existing fields. Both shapes are optional here.
  lendingSignals?: {
    rentStability?: {
      volatilityPP: number | null;
      yearsOfHistory: number;
      cohortMedianVolatility?: number;
      suppressed: boolean;
      reason?: string;
      star: StarLevel;
    };
    geographicConcentration?: {
      top3CityShare: number;
      cohortMedianTop3: number;
      cohortLevel: CohortLevel;
      linearPositionIndicator: "more_concentrated" | "near_cohort" | "more_dispersed";
    };
  };
  // v0.6.2 pre-computed text (Patch 8) — executive summary, distinguishing
  // characteristics bullets, and the map narrative annotation. All three are
  // dignity-validated at seed time per Design Spec Section 1.
  generatedText?: {
    executiveSummary: string;
    distinguishingCharacteristics: string[];
    mapNarrativeAnnotation: string;
    generatedAt?: string;
    generatedFromMethodologyVersion?: string;
    generatedFromDesignVersion?: string;
  };
  geographicCoverage: {
    citiesText: string;
    topCities?: Array<{ name: string; pct: number }>;
    coverageMapPoints: Array<{
      lat: number;
      lon: number;
      n: number;
      city?: string;
      type?: string;
    }>;
    mapCenter?: { lat: number; lon: number };
    mapBounds?: { north: number; south: number; east: number; west: number };
    msaBackdropPoints?: Array<{ lat: number; lon: number }>;
  };
  // Suppressed for operators failing Section 4's scope gate (Scattered,
  // Hybrid below the gate, MF/BTR under tenure). null → section omitted.
  communityVisibility: CommunityVisibilityBlock | null;
  classificationRationale: string;
}

export interface TenancyAssetBlock {
  gap: number | null;
  n: number;
  cohortP25: number | null;
  cohortP50: number | null;
  cohortP75: number | null;
  cohortN: number;
}

export interface CommunityVisibilityBlock {
  qualifies: true;
  ratio: number;
  state: "partial" | "likely-partial" | "comprehensive";
  stateLabel: string;
  chipClass: "dq-chip" | "dq-chip-orange";
  expectedTurnoverRate: number;
  perCommunity: Array<{
    communityId: number | string;
    knownSize: number;
    expectedListings: number;
    actualListings: number;
  }>;
  percentileRank: number;
  // v0.6.2 star fields (Patch 3).
  star?: StarLevel;
  cohortUsedForStar?: CohortLevel;
  cohortName?: string;
}

// Detect a known v0.6.2 data-pipeline gap: the marketing subscores for some
// cohorts (Nashville SFR Independent is the worst-affected) were not
// computed during the v0.6.2 generation pass. The raw inputs (completeness
// %, amenitiesMentioned, descLen) populate as expected, but the three
// subscores AND the composite all land at 0. A genuine 0 composite is
// mathematically impossible for an operator with any listings; uniform 0
// across raw + subscores indicates pipeline failure. The suppressed flag
// drives a "Insufficient marketing data" disclosure on the Operational
// Discipline tile + card rather than rendering a fake 0/100 number.
// Tracked for v0.7 — recompute marketing scores across affected cohorts.
export function marketingDataSuppressed(m: {
  compositeScore: number;
  completenessScore: number;
  amenitiesScore: number;
  descScore: number;
}): boolean {
  return (
    m.compositeScore === 0 &&
    m.completenessScore === 0 &&
    m.amenitiesScore === 0 &&
    m.descScore === 0
  );
}

export interface MarketSummary {
  id: string;
  city: string;
  state: string;
  fullName: string;
  operatorCountEligible: number;
  operatorCountTotal: number;
  medianDomT12: number;
  quadrantSummary: {
    [quadrant: string]: {
      count: number;
      medianDomT12: number | null;
    };
  };
  // v0.6.2 7-cell counts per market (Patch 1). Optional for back-compat.
  quadrant7CellSummary?: {
    [quadrant7Cell: string]: number;
  };
}

export interface PMListItem {
  slug: string;
  name: string;
  quadrant: string;
  /** v0.6.2 7-cell taxonomy label; nullable for forward-compat. */
  quadrant7Cell: string | null;
  hybrid: boolean;
  rankOverall: number | null;
  rankOverallTotal: number | null;
  rankQuadrant: number | null;
  rankQuadrantTotal: number | null;
  domT12: number;
  totalObservedUnits: number;
  primaryCity: string;
  primaryCityShare: number | null;
  claimed: boolean;
  // Additive optional fields used by the market landing operator cards.
  rentVsComp: number | null;
  concessionRate: number | null;
  accentColor: string | null;
  coverageMapPoints: Array<{ lat: number; lon: number; n: number }>;
  /** v0.6.2 composite star (gold/silver/null) and cohort label — surfaced
   *  on the market landing operator cards. */
  compositeStar: StarLevel;
  compositeCohortName: string | null;
}

export type Quadrant =
  | "MF/BTR / Institutional"
  | "MF/BTR / Independent"
  | "Scattered / Institutional"
  | "Scattered / Independent";

export interface LeadFormData {
  marketId?: string;
  propertyType: "single-family" | "small-mf" | "multifamily" | "condo";
  unitCount?: number;
  preferredQuadrant?: Quadrant;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  notes?: string;
}
