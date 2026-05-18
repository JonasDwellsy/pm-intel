import { PrismaClient } from "@prisma/client";
import seedData from "../src/data/scorecard_data.json";
import type {
  CohortLevel,
  CommunityVisibilityBlock,
  MultiLevelPercentile,
  ScorecardData,
  StarLevel,
  TenancyAssetBlock,
} from "../src/lib/types";

const prisma = new PrismaClient();

// ---- v0.6.2 input shape ----
//
// The merged v0.6.2 file (7 markets, 574 PMs) carries two known
// shape inconsistencies inherited from v0.6.1 per-market generation
// (documented in Scorecard_Data_v0.6.2_Summary.md Schema notes):
//
//   1. Market-level cohort YoY rent change uses two field names:
//      `cohortMedianYoyRentChange` (Chatt, Jax) vs `cohortMedianYoyChange`
//      (Nash, Memphis, Knoxville, Clarksville, Phoenix). Accept both.
//   2. The legacy `quadrant` field uses both "Scattered / Independent" and
//      "Scattered Site / Independent" (Jax variant), plus the occasional
//      "Hybrid / Independent" (3 Hybrid operators). Normalize at seed time
//      so the canonical 5-cell route segments (slugify.ts) resolve.
//
// The new `quadrant7Cell` field is canonical and consistent across markets.

type AnyRecord = Record<string, unknown>;

type InputMarket = {
  id: string;
  msaCode: string;
  city: string;
  state: string;
  fullName: string;
  operatorCountTotal: number;
  operatorCountEligible: number;
  medianDomT12: number;
  medianDomLifetime?: number;
  quadrantSummary: Record<
    string,
    { count: number; medianDomT12: number | null; medianDomLifetime?: number | null }
  >;
  quadrant7CellSummary?: Record<string, number>;
  // Two variant field names — readers must accept either.
  cohortMedianYoyRentChange?: number | null;
  cohortMedianYoyChange?: number | null;
  // The v0.6.2 input emits mapBounds in TWO different key shapes across
  // markets (carry-forward from per-market seed runs): Chattanooga emits
  // {north, south, east, west} (canonical); Nashville emits
  // {minLat, maxLat, minLon, maxLon}; Jacksonville / Memphis / Knoxville /
  // Clarksville / Phoenix omit the field entirely. The seed normalizes all
  // three at the buildScorecard layer via normalizeMapBounds() so the
  // canonical ScorecardData shape always renders with the Mapbox-expected
  // {north, south, east, west} keys.
  mapBounds?:
    | { north: number; south: number; east: number; west: number }
    | { minLat: number; maxLat: number; minLon: number; maxLon: number }
    | Record<string, never>;
  mapCenter?: { lat: number; lon: number };
  msaBackdropPoints?: Array<{ lat: number; lon: number }>;
  msaIndexUrus?: number;
  msaTotalListings?: number;
};

type InputFile = {
  methodologyVersion: string;
  designVersion?: string;
  dataAsOf: string;
  markets: InputMarket[];
  pms: AnyRecord[];
};

const data = seedData as unknown as InputFile;

// ---- normalization helpers ----

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function asInt(v: unknown): number | null {
  const n = asNumber(v);
  return n === null ? null : Math.round(n);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function get(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object") {
    return (obj as AnyRecord)[key];
  }
  return undefined;
}

function getObj(obj: unknown, key: string): AnyRecord | null {
  const v = get(obj, key);
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : null;
}

function getArray<T = unknown>(obj: unknown, key: string): T[] {
  const v = get(obj, key);
  return Array.isArray(v) ? (v as T[]) : [];
}

// Normalize the legacy 5-cell `quadrant` label to the canonical form used by
// the route segments in src/lib/slugify.ts. Drops the "Site" middle word and
// collapses "Hybrid / Independent" → "Hybrid". The 7-cell label
// (quadrant7Cell) is already consistent and does not need normalization.
function normalizeLegacyQuadrant(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.startsWith("scattered site")) {
    // "Scattered Site / Independent" → "Scattered / Independent"
    return raw.replace(/scattered site/i, "Scattered");
  }
  if (lower.startsWith("hybrid")) return "Hybrid";
  return raw;
}

function asStar(v: unknown): StarLevel {
  const s = asString(v).toLowerCase();
  if (s === "gold") return "gold";
  if (s === "silver") return "silver";
  return null;
}

function asCohortLevel(v: unknown): CohortLevel | undefined {
  const s = asString(v).toLowerCase();
  if (s === "primary" || s === "fallback" || s === "msa") return s;
  return undefined;
}

// Parse a single MultiLevelPercentile from the input shape, where each metric
// in v0.6.2 carries a nested {primary, primaryCohortN, fallback, fallbackCohortN,
// msa, msaCohortN} object. Returns undefined if no nested object is present
// (v0.6.1-shaped input where percentiles.<m> is just a flat number).
function parseMultiLevelPercentile(
  v: unknown
): MultiLevelPercentile | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as AnyRecord;
  // Only treat as multi-level if at least one of the nested keys is present.
  if (
    !(
      "primary" in o ||
      "fallback" in o ||
      "msa" in o ||
      "primaryCohortN" in o ||
      "fallbackCohortN" in o ||
      "msaCohortN" in o
    )
  ) {
    return undefined;
  }
  return {
    primary: asNumber(o.primary),
    primaryCohortN: asInt(o.primaryCohortN),
    fallback: asNumber(o.fallback),
    fallbackCohortN: asInt(o.fallbackCohortN),
    msa: asNumber(o.msa),
    msaCohortN: asInt(o.msaCohortN),
  };
}

// Collapse a multi-level percentile object down to a single number for the
// v0.6.1-shape flat `percentiles.<m>` field. We prefer the MSA-level value
// because it's the most-populated and matches what v0.6.1 already exposed.
function flatPercentileFromMultiOrNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const multi = parseMultiLevelPercentile(v);
  if (multi) return multi.msa ?? multi.fallback ?? multi.primary;
  return null;
}

// Map v0.6.1+/v0.6.2 communityVisibility input to canonical block. Returns
// null when the section should be suppressed (omitted from the PM record or
// missing the qualifying ratio).
function normalizeCommunityVisibility(
  pm: AnyRecord
): CommunityVisibilityBlock | null {
  const cv = getObj(pm, "communityVisibility");
  if (!cv) return null;

  const qualifies = cv.qualifies !== false;
  if (!qualifies) return null;

  const ratio = asNumber(cv.ratio);
  if (ratio === null) return null;

  let stateRaw = asString(cv.state).toLowerCase().trim();
  let stateLabel = asString(cv.stateLabel);
  if (!stateLabel && stateRaw.includes(" ")) {
    stateLabel = asString(cv.state);
    stateRaw = "";
  }

  let state: CommunityVisibilityBlock["state"];
  if (stateRaw.includes("comprehensive")) state = "comprehensive";
  else if (stateRaw.includes("likely")) state = "likely-partial";
  else if (stateRaw.includes("partial")) state = "partial";
  else if (ratio >= 0.8) state = "comprehensive";
  else if (ratio >= 0.5) state = "likely-partial";
  else state = "partial";

  if (!stateLabel) {
    stateLabel =
      state === "comprehensive"
        ? "Comprehensive visibility"
        : state === "likely-partial"
          ? "Likely partial visibility"
          : "Partial visibility";
  }

  const chipClass: CommunityVisibilityBlock["chipClass"] =
    state === "comprehensive" ? "dq-chip" : "dq-chip-orange";

  // perCommunity / communityBreakdown / communityDetails — three keys across
  // markets; field names also vary. Normalize to camelCase canonical shape.
  const list =
    getArray<AnyRecord>(cv, "perCommunity").length > 0
      ? getArray<AnyRecord>(cv, "perCommunity")
      : getArray<AnyRecord>(cv, "communityBreakdown").length > 0
        ? getArray<AnyRecord>(cv, "communityBreakdown")
        : getArray<AnyRecord>(cv, "communityDetails");

  const perCommunity = list.map((row) => ({
    communityId:
      (get(row, "communityId") as number | string | undefined) ??
      (get(row, "community_id") as number | string | undefined) ??
      "",
    knownSize:
      asInt(get(row, "knownSize")) ?? asInt(get(row, "known_size")) ?? 0,
    expectedListings:
      asNumber(get(row, "expectedListings")) ??
      asNumber(get(row, "expected_t12")) ??
      0,
    actualListings:
      asInt(get(row, "actualListings")) ??
      asInt(get(row, "actual_t12")) ??
      0,
  }));

  return {
    qualifies: true,
    ratio,
    state,
    stateLabel,
    chipClass,
    expectedTurnoverRate:
      asNumber(cv.expectedTurnoverRate) ?? 0.2 /* v0.6.1 default */,
    perCommunity,
    percentileRank: asNumber(cv.percentileRank) ?? 0,
    star: asStar(cv.star),
    cohortUsedForStar: asCohortLevel(cv.cohortUsedForStar),
    cohortName: asString(cv.cohortName) || undefined,
  };
}

function normalizeRentPerformance(
  pm: AnyRecord
): ScorecardData["rentPerformance"] {
  const rp = getObj(pm, "rentPerformance");
  if (!rp) return null;
  const pmYoy = asNumber(rp.pmYoyChange);
  if (pmYoy === null) return null;

  const stateRaw = asString(rp.state).toLowerCase();
  const state: NonNullable<ScorecardData["rentPerformance"]>["state"] =
    stateRaw === "positive"
      ? "positive"
      : stateRaw === "negative"
        ? "negative"
        : "neutral";

  // Accept either name for the cohort median (per the Phase A summary doc).
  const cohortMedian =
    asNumber(rp.cohortMedianYoyChange) ??
    asNumber(rp.cohortMedianYoyRentChange);

  return {
    pmYoyChange: pmYoy,
    cohortMedianYoyChange: cohortMedian,
    delta: asNumber(rp.delta) ?? 0,
    percentileRank: asNumber(rp.percentileRank) ?? 0,
    state,
    star: asStar(rp.star),
    cohortUsedForStar: asCohortLevel(rp.cohortUsedForStar),
    cohortName: asString(rp.cohortName) || undefined,
  };
}

function normalizeTenancyAsset(
  obj: AnyRecord | null,
  fallback: { p25: number | null; p50: number | null; p75: number | null; cohortN: number }
): TenancyAssetBlock {
  const gap = obj ? asNumber(obj.gap) : null;
  const n = obj ? (asInt(obj.n) ?? 0) : 0;
  return {
    gap,
    n,
    cohortP25: obj ? (asNumber(obj.cohortP25) ?? fallback.p25) : fallback.p25,
    cohortP50: obj ? (asNumber(obj.cohortP50) ?? fallback.p50) : fallback.p50,
    cohortP75: obj ? (asNumber(obj.cohortP75) ?? fallback.p75) : fallback.p75,
    cohortN: obj ? (asInt(obj.cohortN) ?? fallback.cohortN) : fallback.cohortN,
  };
}

function normalizeRentTrajectory(
  pm: AnyRecord
): ScorecardData["rentTrajectory"] {
  return getArray<AnyRecord>(pm, "rentTrajectory")
    .map((r) => ({
      quarter: asString(r.quarter),
      mixAdjMedian: asNumber(r.mixAdjMedian) ?? 0,
      n: asInt(r.n) ?? 0,
    }))
    .filter((r) => r.quarter);
}

// Pass-through for v0.6.2 lendingSignals. The seed-time pipeline only
// computes rentStability and geographicConcentration; v1.0 design renders
// three more derived signals (vacancySignal, operatorStability, pricingTier)
// at runtime.
function normalizeLendingSignals(
  pm: AnyRecord
): ScorecardData["lendingSignals"] | undefined {
  const ls = getObj(pm, "lendingSignals");
  if (!ls) return undefined;
  const out: NonNullable<ScorecardData["lendingSignals"]> = {};

  const rs = getObj(ls, "rentStability");
  if (rs) {
    out.rentStability = {
      volatilityPP: asNumber(rs.volatilityPP),
      yearsOfHistory: asNumber(rs.yearsOfHistory) ?? 0,
      cohortMedianVolatility:
        asNumber(rs.cohortMedianVolatility) ?? undefined,
      suppressed: Boolean(rs.suppressed),
      reason: asString(rs.reason) || undefined,
      star: asStar(rs.star),
    };
  }

  const gc = getObj(ls, "geographicConcentration");
  if (gc) {
    const indicator = asString(gc.linearPositionIndicator);
    out.geographicConcentration = {
      top3CityShare: asNumber(gc.top3CityShare) ?? 0,
      cohortMedianTop3: asNumber(gc.cohortMedianTop3) ?? 0,
      cohortLevel: asCohortLevel(gc.cohortLevel) ?? "msa",
      linearPositionIndicator:
        indicator === "more_dispersed" || indicator === "near_cohort"
          ? indicator
          : "more_concentrated",
    };
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

// Pass-through for v0.6.2 generatedText. Dignity validation already
// performed at seed-pipeline time (Patch 8); we trust the input here.
function normalizeGeneratedText(
  pm: AnyRecord
): ScorecardData["generatedText"] | undefined {
  const gt = getObj(pm, "generatedText");
  if (!gt) return undefined;
  const exec = asString(gt.executiveSummary);
  const bullets = getArray<string>(gt, "distinguishingCharacteristics");
  const mapNarr = asString(gt.mapNarrativeAnnotation);
  if (!exec && bullets.length === 0 && !mapNarr) return undefined;
  return {
    executiveSummary: exec,
    distinguishingCharacteristics: bullets.filter(
      (b): b is string => typeof b === "string" && b.length > 0
    ),
    mapNarrativeAnnotation: mapNarr,
    generatedAt: asString(gt.generatedAt) || undefined,
    generatedFromMethodologyVersion:
      asString(gt.generatedFromMethodologyVersion) || undefined,
    generatedFromDesignVersion:
      asString(gt.generatedFromDesignVersion) || undefined,
  };
}

// Canonicalize the per-market mapBounds to the {north, south, east, west}
// shape that CoverageMapClient consumes. Handles all three v0.6.2 input
// variants (see InputMarket.mapBounds comment).
function normalizeMapBounds(
  raw: InputMarket["mapBounds"],
  backdropPoints?: Array<{ lat: number; lon: number }>
): { north: number; south: number; east: number; west: number } | undefined {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (
      typeof r.north === "number" &&
      typeof r.south === "number" &&
      typeof r.east === "number" &&
      typeof r.west === "number"
    ) {
      return {
        north: r.north as number,
        south: r.south as number,
        east: r.east as number,
        west: r.west as number,
      };
    }
    if (
      typeof r.maxLat === "number" &&
      typeof r.minLat === "number" &&
      typeof r.maxLon === "number" &&
      typeof r.minLon === "number"
    ) {
      return {
        north: r.maxLat as number,
        south: r.minLat as number,
        east: r.maxLon as number,
        west: r.minLon as number,
      };
    }
  }
  // Derive from msaBackdropPoints (the ~1,500 grey reference dots covering
  // the MSA) so 5 markets that omit explicit bounds still render real maps.
  if (Array.isArray(backdropPoints) && backdropPoints.length > 0) {
    let north = -Infinity;
    let south = Infinity;
    let east = -Infinity;
    let west = Infinity;
    for (const p of backdropPoints) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
      if (p.lat > north) north = p.lat;
      if (p.lat < south) south = p.lat;
      if (p.lon > east) east = p.lon;
      if (p.lon < west) west = p.lon;
    }
    if (Number.isFinite(north) && Number.isFinite(south)) {
      return { north, south, east, west };
    }
  }
  return undefined;
}

function buildScorecard(pm: AnyRecord, market: InputMarket): ScorecardData {
  const rank = getObj(pm, "rank") ?? {};
  const coverage = getObj(pm, "coverage") ?? {};
  const performance = getObj(pm, "performance") ?? {};
  const marketing = getObj(pm, "marketing") ?? {};
  const tenancy = getObj(pm, "tenancy") ?? {};
  const geo = getObj(pm, "geographicCoverage") ?? {};
  const legacyQuadrant = normalizeLegacyQuadrant(asString(pm.quadrant));
  // Some v0.6.2 markets (Memphis/Knoxville/Clarksville/Phoenix) omit the
  // legacy 5-cell quadrantSummary block; only quadrant7CellSummary is
  // present. Default to an empty record so peer-DOM lookups degrade to null.
  const quadrantPeer = (market.quadrantSummary ?? {})[legacyQuadrant];

  // v0.6.2 percentile shape is nested; collapse to a flat number for the
  // v0.6.1-compat `percentiles.<m>` block, and stash the full nested shape
  // under `percentilesMulti` for the v1.0 components that need it.
  const percentilesObj = getObj(rank, "percentiles");
  const flatPct = {
    dom:
      flatPercentileFromMultiOrNumber(get(percentilesObj, "dom")) ??
      asNumber(get(performance, "domPercentile")) ??
      null,
    tenancy:
      flatPercentileFromMultiOrNumber(get(percentilesObj, "tenancy")) ??
      asNumber(get(tenancy, "tenancyPercentile")) ??
      null,
    rentPerformance:
      flatPercentileFromMultiOrNumber(
        get(percentilesObj, "rentPerformance")
      ) ??
      asNumber(get(getObj(pm, "rentPerformance"), "percentileRank")) ??
      null,
    marketing:
      flatPercentileFromMultiOrNumber(get(percentilesObj, "marketing")) ??
      asNumber(get(marketing, "percentileRank")) ??
      null,
    communityVisibility:
      flatPercentileFromMultiOrNumber(
        get(percentilesObj, "communityVisibility")
      ) ??
      asNumber(get(getObj(pm, "communityVisibility"), "percentileRank")) ??
      null,
  };

  const multiPct: NonNullable<ScorecardData["rank"]["percentilesMulti"]> = {};
  if (percentilesObj) {
    const dom = parseMultiLevelPercentile(percentilesObj.dom);
    if (dom) multiPct.dom = dom;
    const ten = parseMultiLevelPercentile(percentilesObj.tenancy);
    if (ten) multiPct.tenancy = ten;
    const rp = parseMultiLevelPercentile(percentilesObj.rentPerformance);
    if (rp) multiPct.rentPerformance = rp;
    const mk = parseMultiLevelPercentile(percentilesObj.marketing);
    if (mk) multiPct.marketing = mk;
    const cv = parseMultiLevelPercentile(percentilesObj.communityVisibility);
    if (cv) multiPct.communityVisibility = cv;
    const comp = parseMultiLevelPercentile(percentilesObj.composite);
    if (comp) multiPct.composite = comp;
  }

  const weightingScheme: "with_cv" | "without_cv" =
    asString(get(rank, "weightingScheme")) === "with_cv"
      ? "with_cv"
      : asString(get(rank, "weightingScheme")) === "without_cv"
        ? "without_cv"
        : flatPct.communityVisibility !== null
          ? "with_cv"
          : "without_cv";

  const communityVisibility = normalizeCommunityVisibility(pm);
  const rentPerformance = normalizeRentPerformance(pm);
  const lendingSignals = normalizeLendingSignals(pm);
  const generatedText = normalizeGeneratedText(pm);

  return {
    methodologyVersion: data.methodologyVersion,
    designVersion: data.designVersion,
    dataAsOf: data.dataAsOf,
    pm: {
      slug: asString(pm.slug),
      name: asString(pm.name),
      quadrant: legacyQuadrant,
      quadrant7Cell: asString(pm.quadrant7Cell) || undefined,
      hybrid: Boolean(pm.hybrid),
      institutional: Boolean(pm.institutional),
      accentColor: pm.accentColor as string | undefined,
      primaryCity: asString(pm.primaryCity) || undefined,
    },
    market: {
      id: market.id,
      name: market.city,
      state: market.state,
      fullName: market.fullName,
    },
    rank: {
      overall: asInt(rank.overall) ?? 0,
      overallTotal: asInt(rank.overallTotal) ?? 0,
      quadrant: asInt(rank.quadrant),
      quadrantTotal: asInt(rank.quadrantTotal) ?? 0,
      quadrantMedianDomT12:
        asNumber(rank.quadrantMedianDomT12) ??
        quadrantPeer?.medianDomT12 ??
        null,
      composite: asNumber(rank.composite),
      percentiles: flatPct,
      percentilesMulti:
        Object.keys(multiPct).length > 0 ? multiPct : undefined,
      weightingScheme,
      compositeStar: asStar(rank.compositeStar),
      compositeCohortUsedForStar: asCohortLevel(rank.compositeCohortUsedForStar),
      compositeCohortName: asString(rank.compositeCohortName) || undefined,
    },
    coverage: {
      firstListing: asString(coverage.firstListing),
      monthsOnPlatform: asInt(coverage.monthsOnPlatform) ?? 0,
      lifetimeListings: asInt(coverage.lifetimeListings) ?? 0,
      t6Listings: asInt(coverage.t6Listings),
      t12Listings: asInt(coverage.t12Listings) ?? 0,
      urusLifetime: asInt(coverage.urusLifetime) ?? 0,
      urusT12: asInt(coverage.urusT12) ?? 0,
      activeListings: asInt(coverage.activeListings) ?? 0,
      totalObservedUnits: asInt(coverage.totalObservedUnits) ?? 0,
      nationalObservedUnitsT12:
        asInt(coverage.nationalObservedUnitsT12) ??
        asInt(coverage.nationalUrusT12),
      citiesObserved: asInt(coverage.citiesObserved) ?? 1,
      dataTier:
        asString(coverage.dataTier) === "Limited" ? "Limited" : "Full ranking",
      concentratedShare: asNumber(coverage.concentratedShare),
      observedCommunities: asInt(coverage.observedCommunities) ?? undefined,
      observedCommunityTotalUnits:
        asInt(coverage.observedCommunityTotalUnits) ?? undefined,
      yearsVisible: asNumber(coverage.yearsVisible) ?? undefined,
    },
    performance: {
      domT12: asNumber(performance.domT12) ?? 0,
      domT12N: asInt(performance.domT12N) ?? 0,
      domLifetime: asNumber(performance.domLifetime) ?? 0,
      houseDomT12: asNumber(performance.houseDomT12),
      houseUrusT12: asInt(performance.houseUrusT12) ?? 0,
      houseEligible: Boolean(performance.houseEligible),
      aptDomT12: asNumber(performance.aptDomT12),
      aptUrusT12: asInt(performance.aptUrusT12) ?? 0,
      aptEligible: Boolean(performance.aptEligible),
      peerQuadrantDomT12: quadrantPeer?.medianDomT12 ?? null,
      peerQuadrantDomLifetime: quadrantPeer?.medianDomLifetime ?? null,
      marketDomT12: market.medianDomT12,
      marketDomLifetime: market.medianDomLifetime ?? market.medianDomT12,
      domStar: asStar(performance.domStar),
      domCohortUsedForStar: asCohortLevel(performance.domCohortUsedForStar),
      domCohortName: asString(performance.domCohortName) || undefined,
    },
    rentTrajectory: normalizeRentTrajectory(pm),
    rentPerformance,
    marketing: {
      completeness: asNumber(marketing.completeness) ?? 0,
      amenitiesMentioned: asNumber(marketing.amenitiesMentioned) ?? 0,
      descLen: asInt(marketing.descLen) ?? 0,
      completenessScore: asNumber(marketing.completenessScore) ?? 0,
      amenitiesScore: asNumber(marketing.amenitiesScore) ?? 0,
      descScore: asNumber(marketing.descScore) ?? 0,
      medianPhotosT12: asInt(marketing.medianPhotosT12),
      zeroPhotoT12: asNumber(marketing.zeroPhotoT12),
      compositeScore: asNumber(marketing.compositeScore) ?? 0,
      star: asStar(marketing.star),
      cohortUsedForStar: asCohortLevel(marketing.cohortUsedForStar),
      cohortName: asString(marketing.cohortName) || undefined,
    },
    tenancy: {
      totalUnits: asInt(tenancy.totalUnits) ?? 0,
      multiEpisodeUnits: asInt(tenancy.multiEpisodeUnits) ?? 0,
      multiEpisodePct: asInt(tenancy.multiEpisodePct) ?? 0,
      overallGap: asNumber(tenancy.overallGap),
      tenancyPercentile: asNumber(tenancy.tenancyPercentile),
      apartment: normalizeTenancyAsset(getObj(tenancy, "apartment"), {
        p25: null,
        p50: null,
        p75: null,
        cohortN: 0,
      }),
      house: normalizeTenancyAsset(getObj(tenancy, "house"), {
        p25: null,
        p50: null,
        p75: null,
        cohortN: 0,
      }),
      shortHistoryFlag:
        typeof tenancy.shortHistoryFlag === "boolean"
          ? tenancy.shortHistoryFlag
          : undefined,
      yearsVisible: asNumber(tenancy.yearsVisible) ?? undefined,
      star: asStar(tenancy.star),
      cohortUsedForStar: asCohortLevel(tenancy.cohortUsedForStar),
      cohortName: asString(tenancy.cohortName) || undefined,
    },
    geographicCoverage: {
      citiesText: asString(geo.citiesText),
      topCities: getArray<{ name: string; pct: number }>(geo, "topCities"),
      coverageMapPoints: getArray<{
        lat: number;
        lon: number;
        n: number;
        city?: string;
        type?: string;
      }>(geo, "coverageMapPoints"),
      mapCenter: market.mapCenter,
      mapBounds: normalizeMapBounds(market.mapBounds, market.msaBackdropPoints),
      msaBackdropPoints: market.msaBackdropPoints,
    },
    communityVisibility,
    classificationRationale: asString(pm.classificationRationale),
    lendingSignals,
    generatedText,
  };
}

async function main() {
  console.log(
    `Seeding from methodology ${data.methodologyVersion}` +
      (data.designVersion ? `, design ${data.designVersion}` : "") +
      `, dataAsOf ${data.dataAsOf}`
  );

  // Pre-pass: for the 4 markets that omit both mapBounds AND
  // msaBackdropPoints (Memphis/Knoxville/Clarksville/Phoenix in v0.6.2),
  // derive market-level bounds from the union of all PM coverageMapPoints
  // in that market. Mutates each InputMarket in-place so buildScorecard's
  // existing normalizeMapBounds() picks them up via the canonical shape.
  for (const m of data.markets) {
    const hasUsableBounds = normalizeMapBounds(m.mapBounds) !== undefined;
    const hasBackdrop = (m.msaBackdropPoints?.length ?? 0) > 0;
    if (hasUsableBounds || hasBackdrop) continue;

    let north = -Infinity;
    let south = Infinity;
    let east = -Infinity;
    let west = Infinity;
    for (const pm of data.pms) {
      if (asString(pm.marketId) !== m.id) continue;
      const points = getArray<{ lat?: number; lon?: number }>(
        getObj(pm, "geographicCoverage"),
        "coverageMapPoints"
      );
      for (const p of points) {
        if (typeof p.lat !== "number" || typeof p.lon !== "number") continue;
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
        if (p.lat > north) north = p.lat;
        if (p.lat < south) south = p.lat;
        if (p.lon > east) east = p.lon;
        if (p.lon < west) west = p.lon;
      }
    }
    if (Number.isFinite(north) && Number.isFinite(south)) {
      // Pad the derived envelope ~5% so points near the edge don't sit on
      // the map frame. Latitude band gets the bigger pad because the bounds
      // are typically tight on operator footprints.
      const latPad = (north - south) * 0.05 || 0.05;
      const lonPad = (east - west) * 0.05 || 0.05;
      m.mapBounds = {
        north: north + latPad,
        south: south - latPad,
        east: east + lonPad,
        west: west - lonPad,
      };
      console.log(
        `  ↳ derived mapBounds for ${m.id} from PM coverage points`
      );
    }
  }

  // Idempotent: clear PMs first (FK to Market), then Markets.
  await prisma.pM.deleteMany();
  await prisma.market.deleteMany();

  for (const m of data.markets) {
    await prisma.market.create({
      data: {
        id: m.id,
        msaCode: m.msaCode,
        city: m.city,
        state: m.state,
        fullName: m.fullName,
        operatorCountTotal: m.operatorCountTotal,
        operatorCountEligible: m.operatorCountEligible,
        medianDomT12: m.medianDomT12,
        medianDomLifetime: m.medianDomLifetime ?? m.medianDomT12,
        // Memphis/Knoxville/Clarksville/Phoenix omit the legacy 5-cell summary
        // (carry only quadrant7CellSummary). Default to {} so peer-DOM lookups
        // degrade gracefully (return null) rather than throwing. Schema
        // normalization to come in v0.7 per the v0.6.2 summary doc.
        quadrantSummary: JSON.stringify(m.quadrantSummary ?? {}),
        quadrant7CellSummary: m.quadrant7CellSummary
          ? JSON.stringify(m.quadrant7CellSummary)
          : null,
      },
    });
    console.log(`  ✓ market: ${m.id} (${m.fullName})`);
  }

  // Track slugs we've already seeded so duplicates in the input JSON are
  // skipped rather than crashing the seed. The v0.6.2 input has two known
  // upstream slug collisions in Knoxville + Memphis where an operator appears
  // under two name variants ("X Inc" / "X, Inc.") that both slugify to the
  // same key. Upstream dedup is a v0.7 concern; for v0.6.2 we keep the first
  // occurrence (typically the canonical / higher-urus record).
  const seenSlugs = new Set<string>();
  let pmCount = 0;
  let skippedDupes = 0;

  for (const pm of data.pms) {
    const slug = asString(pm.slug);
    if (seenSlugs.has(slug)) {
      skippedDupes += 1;
      console.warn(
        `  ⚠ skipped duplicate slug: ${slug} (name="${asString(pm.name)}")`
      );
      continue;
    }
    seenSlugs.add(slug);

    const marketId = asString(pm.marketId);
    const market = data.markets.find((m) => m.id === marketId);
    if (!market) {
      throw new Error(
        `PM ${slug} references unknown market ${marketId}`
      );
    }

    const rank = getObj(pm, "rank") ?? {};
    const scorecard = buildScorecard(pm, market);
    const legacyQuadrant = scorecard.pm.quadrant;
    const quadrant7Cell = asString(pm.quadrant7Cell) || null;

    await prisma.pM.create({
      data: {
        slug,
        name: asString(pm.name),
        marketId,
        quadrant: legacyQuadrant,
        quadrant7Cell,
        hybrid: Boolean(pm.hybrid),
        rankOverall: asInt(rank.overall),
        rankOverallTotal: asInt(rank.overallTotal),
        rankQuadrant: asInt(rank.quadrant),
        rankQuadrantTotal: asInt(rank.quadrantTotal),
        claimed: Boolean(pm.claimed),
        scorecardData: JSON.stringify(scorecard),
        methodologyVersion: data.methodologyVersion,
        dataAsOf: new Date(data.dataAsOf),
      },
    });
    pmCount += 1;
  }

  const marketCount = await prisma.market.count();
  const dbPmCount = await prisma.pM.count();
  const dupeSuffix = skippedDupes > 0 ? `, ${skippedDupes} duplicate slug(s) skipped` : "";
  console.log(
    `\nSeed complete: ${marketCount} market(s), ${dbPmCount} PM(s) (processed ${pmCount}${dupeSuffix}).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
