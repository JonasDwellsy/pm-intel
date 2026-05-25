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

// v0.6.4 Patch 1 — cross-market canonical operator entity (multi-market
// only). Lifted from src/data/scorecard_data.json's top-level
// canonicalOperators map by the data loader. Single-market operators
// don't have a row here.
export interface CanonicalOperator {
  canonicalSlug: string;
  canonicalName: string;
  marketIds: string[];
  pmSlugs: string[];
  marketCount: number;
  aggregateStats: {
    totalT12Listings?: number;
    totalT24T12Listings?: number;
    totalUrusT12?: number;
  };
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
  // v0.6.4 Patch 1 — canonical operator identity. Every PM carries
  // these; multi-market operators share the same id across markets.
  // Single-market operators get an id equal to their PM slug. Optional
  // for back-compat with v0.6.3 reseeds.
  canonicalOperatorId?: string;
  canonicalOperatorName?: string;
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
    // v0.6.4 Patch 5 — normalized to {lat, lon, n, city?} only. Earlier
    // generations of the pipeline emitted {lat, lng, address, city,
    // type}; merge.py now normalizes everything to this shape (drops
    // dead address + type fields, renames lng → lon, keeps city for
    // the PDF map's city-label centroid computation). See the
    // normalize_coverage_points() helper in scripts/data-pipeline/merge.py
    // for the migration logic.
    coverageMapPoints: Array<{
      lat: number;
      lon: number;
      n: number;
      city?: string;
    }>;
    mapCenter?: { lat: number; lon: number };
    mapBounds?: { north: number; south: number; east: number; west: number };
    msaBackdropPoints?: Array<{ lat: number; lon: number }>;
  };
  // Suppressed for operators failing Section 4's scope gate (Scattered,
  // Hybrid below the gate, MF/BTR under tenure). null → section omitted.
  communityVisibility: CommunityVisibilityBlock | null;
  classificationRationale: string;
  // v0.6.3 Patch 6 — share-trajectory listing counts. t12ListingsCount is
  // listings observed in the trailing 12 months anchored to Patch 6's
  // reference date; t24t12ListingsCount is the prior 12-month window
  // (i.e. T24 → T12). Both come straight from the seed JSON; runtime
  // computation in src/lib/share-trajectory.ts pools across the ranked
  // MSA cohort to derive each operator's share + share-trajectory YoY.
  // Optional + nullable for back-compat with pre-Patch-6 seed runs.
  t12ListingsCount?: number;
  t24t12ListingsCount?: number;
  // v0.6.4 Patch 2 — concession classifier output carried through from
  // the seed pipeline. concessionRate is null when the operator wasn't
  // found in the classifier CSV input (no T12 description data); 0 when
  // found but no concession-language matches; otherwise the decimal
  // fraction of T12 listings mentioning concessions. concessionPatterns
  // is an array of pattern identifiers ordered by frequency (e.g.
  // ["move_in_special", "free_month_lease"]). concessionSampleText is
  // one representative listing excerpt for display on the Layer 5
  // section. All four optional for back-compat with pre-Patch-2
  // reseeds; downstream null-guards handle absence.
  concessionListingCount?: number;
  concessionRate?: number | null;
  concessionPatterns?: string[];
  concessionSampleText?: string;
  // v0.6.4 Patch 2 follow-up — array of up to 3 distinct listing
  // excerpts (the seed pipeline picks varied samples so the Layer 5
  // section can show different concession types side-by-side). The
  // earlier single `concessionSampleText` field stays for back-compat
  // with any pre-array reader; the array is authoritative for the UI.
  concessionSamples?: string[];
  // v0.7 — portfolio size estimator. Pre-computed at seed time and
  // baked into the stored scorecard blob so the Layer 5 widget, Ask
  // tools, and brief generator all read identical numbers without
  // touching the algorithm. status discriminates:
  //   "estimated"             — point/low/high/cohort/cohortN/confidence populated
  //   "insufficient_data"     — Large MF/BTR cohort; message populated
  //   "insufficient_history"  — <3 months on platform; widget hides
  //   "no_listings"           — urusT12 = 0; widget hides
  portfolioEstimate?: {
    status:
      | "estimated"
      | "insufficient_data"
      | "insufficient_history"
      | "no_listings";
    point?: number;
    low?: number;
    high?: number;
    cohort?: string;
    cohortN?: number;
    confidence?: "Low" | "Medium" | "High";
    multiplierMedian?: number;
    message?: string;
    methodologyVersion?: string;
  };
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

// Defensive guard against marketing data with no signal at all. Reads from
// the SAME compositeScore field that the Marketing Discipline tile and
// card display so the detection signature matches the display logic. A
// non-zero compositeScore means the operator has a real, displayable score
// regardless of which source field-name convention the data pipeline used
// (the v0.6.2 input arrives in two shapes — `compositeScore` for the
// Chattanooga cohort, `marketingQuality` for the other 6 markets — and the
// seed normalizes both into compositeScore upstream of this check).
//
// True suppression only fires when compositeScore is exactly 0, which is
// mathematically impossible for an operator with any listing data and only
// happens when the seed-time normalization itself fell through every
// fallback. With v0.6.2 + the seed normalization in place, no operator in
// the 7-market footprint trips this — the guard remains as defense in
// depth for future market additions where the input shape could drift.
export function marketingDataSuppressed(m: {
  compositeScore: number;
}): boolean {
  return m.compositeScore === 0;
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
  // v0.6.2 7-cell summary per market — count + median DOM + median rent
  // vs comp (rent metric added in v0.6.3 polish). Drives the redesigned
  // QuadrantSummaryCard which renders three metrics per cell. Optional for
  // back-compat with v0.6.2 callers that constructed a plain count map.
  quadrant7CellSummary?: {
    [quadrant7Cell: string]: {
      count: number;
      medianDomT12: number | null;
      medianRentVsComp: number | null;
    };
  };
  // v0.6.3 — Patch 1: active operator count (≥3 listings T12) replaces the
  // legacy total-operator denominator as the surfaced headline figure.
  // BySubmarket map drives the filtered-state tile.
  activeOperatorCount?: number | null;
  activeOperatorCountBySubmarket?: { [submarketSlug: string]: number };
  // v0.6.3 — Patch 3: market-level rent growth aggregate (decimal, e.g.
  // 0.0023 = +0.23%) plus national benchmark and pre-computed pp delta for
  // the "vs national" benchmark line.
  marketRentGrowthT12?: number | null;
  nationalRentGrowthT12?: number | null;
  marketRentGrowthDeltaVsNationalPp?: number | null;
  // v0.6.3 — Patch 2: eligibility window UI label. Always "T12" in v0.6.3+
  // production; the field is preserved so the methodology page + tile sub-
  // labels can read from a single source of truth instead of hard-coding.
  eligibilityWindow?: string;
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
  /** Slugified top-city names (geographicCoverage.topCities → submarketSlug),
   *  used by the market landing page's `?submarket=` filter. Optional for
   *  back-compat with any consumer that constructs PMListItem manually. */
  topCitySlugs?: string[];
  /** Raw display names matching topCitySlugs index-for-index. Server-side
   *  only — used to recover the filter chip's display label from the URL
   *  slug. Not exposed to client component props. */
  topCityNames?: string[];
  /** Share-of-portfolio percentages matching topCitySlugs index-for-index.
   *  Used by the market landing PM list to swap the "40% Phoenix" subtitle
   *  to "X% Mesa" when a submarket filter is active. */
  topCityPcts?: number[];
  /** v0.6.3 Patch 4 — counts of gold + silver stars across this operator's
   *  Layer 3 per-metric scoring (domStar, rentPerformance.star,
   *  marketing.star, tenancy.star, plus communityVisibility.star when the
   *  block is present for MF/BTR operators). Composite star is excluded
   *  because it's a roll-up of the others. The two counts drive both the
   *  ★N ☆M chip in the row and the (-gold, -silver, rank) sort applied in
   *  loadMarketView. Optional for back-compat with any consumer that
   *  constructs PMListItem manually. */
  goldCount?: number;
  silverCount?: number;
  /** v0.6.4 Patch 3 — DOM star tier for this operator, cohort-relative.
   *  Surfaced on the ranked-operators list so the DOM number can be
   *  colored by *performance* (gold/silver → green, null → neutral),
   *  matching the rent-vs-comp tone semantics. Previously the DOM number
   *  was tinted by quadrant color, which the eye reads as a performance
   *  signal but actually only encodes which quadrant the operator sits in
   *  (MF/BTR Institutional green vs. SFR Independent orange). Two
   *  operators with identical DOM and identical cohort-relative
   *  performance ended up with opposite-direction colors. Optional for
   *  back-compat. */
  domStar?: StarLevel;
  /** v0.6.4 Patch 3 — DBA (doing-business-as) display name. When the
   *  operator belongs to a canonical entity whose canonicalName differs
   *  from this PM's raw CSV name, displayName carries the canonical
   *  name. The Haven Residential / 29th Street Property Management case
   *  is the motivating example: source data carries "Haven Residential"
   *  (listing-level marketing label); the canonical-decisions JSON
   *  overrides the canonical name to "29th Street Property Management"
   *  (operating-company name). Render sites should prefer
   *  `pm.displayName ?? pm.name` so the operating-company name surfaces
   *  on operator cards + scorecard heroes while the raw CSV name stays
   *  internal. When canonicalOperatorName === pm.name (the common case
   *  for non-DBA canonicals — UDR, Tricon, etc.), displayName stays
   *  undefined to keep the field surgical. */
  displayName?: string;
  /** v0.6.3 Patch 5 — raw per-operator YoY rent change (decimal, e.g.
   *  0.043 = +4.3% YoY). Distinct from rentVsComp which carries the
   *  delta-vs-cohort (delta_yoy * 100). Used by the state-level
   *  aggregator in src/lib/state-data.ts to compute stateRentGrowthT12
   *  as the median across all ranked operators pooled across MSAs in
   *  the state. Null when the operator's rentPerformance block is
   *  unavailable. */
  pmYoyChange?: number | null;
  /** v0.6.4 Patch 1 — canonical operator id (slug). Multi-market
   *  operators share the same value across markets. Single-market
   *  operators get a value equal to their PM slug. Drives state-level
   *  count dedup and the cross-market badge / operator profile route.
   *  Optional for back-compat with pre-v0.6.4 reseeds. */
  canonicalOperatorId?: string | null;
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
