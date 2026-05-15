// Shared TypeScript types for the Dwellsy IQ PM Intel Platform.
// See build spec section 6.

export interface ScorecardData {
  methodologyVersion: string;
  dataAsOf: string; // ISO date
  pm: {
    slug: string;
    name: string;
    quadrant: string;
    hybrid: boolean;
  };
  market: {
    id: string;
    name: string;
    state: string;
    fullName: string;
  };
  rank: {
    overall: number;
    overallTotal: number;
    quadrant: number | null;
    quadrantTotal: number;
    quadrantMedianDomT12: number;
  };
  coverage: {
    firstListing: string;
    monthsOnPlatform: number;
    lifetimeListings: number;
    t6Listings: number;
    t12Listings: number;
    urusLifetime: number;
    urusT12: number;
    activeListings: number;
    institutionalUnits: number;
    institutionalBuildings: number;
    smallMfUnits: number;
    smallMfBuildings: number;
    unitLevelCount: number;
    sfrCount: number;
    totalObservedUnits: number;
    citiesObserved: number;
    dataTier: "Full ranking" | "Limited";
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
    peerQuadrantDomT12: number;
    peerQuadrantHouseDomT12: number | null;
    peerQuadrantAptDomT12: number | null;
    peerQuadrantDomLifetime: number;
    marketDomT12: number;
    marketHouseDomT12: number;
    marketAptDomT12: number;
    marketDomLifetime: number;
    timeSeries: Array<{
      year: number;
      domDays: number;
      marketDomDays: number;
      gapPct: number;
    }>;
  };
  rentTrajectory: Array<{ year: number; premiumPct: number; n: number }>;
  pricing: {
    t12MedianPremium: number;
    t12PctAbove10: number;
    t12PctBelow10: number;
    t12ConcessionRate: number;
    marketConcessionT12: number;
  };
  marketing: {
    completeness: number;
    amenitiesMentioned: number;
    descLen: number;
    peerCompleteness: number;
    peerAmenities: number;
    peerDescLen: number;
  };
  selectionBias: {
    buildings: number;
    observed: number;
    expected: number;
    ratio: number;
    assessment: string;
  };
  tenancy: {
    totalUnits: number;
    multiEpisodeUnits: number;
    multiEpisodePct: number;
    aptGap: number | null;
    aptN: number;
    aptPosition: string | null; // "within cohort range" | "below cohort range" | "above cohort range" | "at cohort low end (p25)"
    aptP25: number | null;
    aptP50: number | null;
    aptP75: number | null;
    aptCohortN: number;
    aptPctMedian: number | null;
    sfrGap: number | null;
    sfrN: number;
    sfrPosition: string | null;
    sfrP25: number | null;
    sfrP50: number | null;
    sfrP75: number | null;
    sfrCohortN: number;
    sfrPctMedian: number | null;
  };
  geographicCoverage: {
    citiesText: string;
    coverageMapPoints: Array<{ lat: number; lon: number; n: number }>;
  };
  classificationRationale: string;
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
      medianDomT12: number;
    };
  };
}

export interface PMListItem {
  slug: string;
  name: string;
  quadrant: string;
  hybrid: boolean;
  rankOverall: number | null;
  rankQuadrant: number | null;
  domT12: number;
  totalObservedUnits: number;
  primaryCity: string;
  claimed: boolean;
}

export type Quadrant =
  | "MF/BTR / Institutional"
  | "MF/BTR / Independent"
  | "Scattered Site / Institutional"
  | "Scattered Site / Independent";

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
