// Shared TypeScript types for the Dwellsy IQ PM Intel Platform.
// Canonical shapes for v0.6.1 — see Methodology_v0.6_Spec.md (Sections 2–10)
// and Methodology_v0.6.1_Patches.md.
//
// The seed normalizes heterogeneous per-market input schemas down to this
// canonical shape; downstream components read only from this shape.

export type QuadrantKey =
  | "MF/BTR / Institutional"
  | "MF/BTR / Independent"
  | "Scattered / Institutional"
  | "Scattered / Independent"
  | "Hybrid";

export interface ScorecardData {
  methodologyVersion: string;
  dataAsOf: string; // ISO date
  pm: {
    slug: string;
    name: string;
    quadrant: string; // QuadrantKey, but kept string for forward-compat
    hybrid: boolean;
    accentColor?: string;
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
    percentiles: {
      dom: number | null;
      tenancy: number | null;
      rentPerformance: number | null;
      marketing: number | null;
      communityVisibility: number | null;
    };
    weightingScheme: "with_cv" | "without_cv";
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
  };
  tenancy: {
    totalUnits: number;
    multiEpisodeUnits: number;
    multiEpisodePct: number;
    overallGap: number | null;
    tenancyPercentile: number | null;
    apartment: TenancyAssetBlock;
    house: TenancyAssetBlock;
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
}

export interface PMListItem {
  slug: string;
  name: string;
  quadrant: string;
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
