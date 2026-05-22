// Seed runs as part of vercel-build on every deploy. Re-seeding 575
// PMs row-by-row against Neon was tripping P1017 ("Server has closed
// the connection") on connection-pool starvation roughly once per
// week, which aborts the deploy. Most deploys are code-only and don't
// change data, so we now skip the seed when the DB already matches
// the JSON (isDataCurrent() check at the top of main()).
//
// FORCE_SEED=true bypasses the skip and runs the full seed regardless.
// Use it when:
//   - the seed JSON changes shape in a way the spot-check doesn't
//     catch (rare — concessionListingCount + concessionSamples length
//     together fingerprint the v0.6.4 Patch 2 data cleanly)
//   - you've deliberately mutated DB state and want to reset
//   - you just want belt-and-braces confidence during a methodology
//     release
//
// Local-dev examples:
//   npx prisma db seed                       # skip if current
//   FORCE_SEED=true npx prisma db seed       # always re-seed

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
  // v0.6.3 — Patches 1 + 3. All seven markets in the v0.6.3 merged JSON
  // carry these; the typing is nullable for back-compat with pre-v0.6.3
  // seed files (the seed code path tolerates missing fields).
  activeOperatorCount?: number | null;
  activeOperatorCountBySubmarket?: Record<string, number> | null;
  marketRentGrowthT12?: number | null;
  nationalRentGrowthT12?: number | null;
  marketRentGrowthDeltaVsNationalPp?: number | null;
  // v0.6.3 — Patch 2 label fix; "T12" everywhere in production, but the
  // seed input is the source of truth so we read it through rather than
  // hard-coding.
  eligibilityWindow?: string;
  // v0.6.4 Patch 2 — count of ranked operators in this market with at
  // least one concession-mentioning T12 listing. Drives the Layer 5
  // cohort comparison line on the scorecard concession section.
  operatorsWithConcessions?: number | null;
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

type InputCanonicalOperator = {
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
};

type InputFile = {
  methodologyVersion: string;
  designVersion?: string;
  dataAsOf: string;
  markets: InputMarket[];
  pms: AnyRecord[];
  // v0.6.4 Patch 1 — top-level map of canonical operator entities with
  // marketCount ≥ 2. Keyed by canonicalSlug. Single-market PMs don't
  // have an entry here (the PM's canonicalOperatorId equals its slug).
  canonicalOperators?: Record<string, InputCanonicalOperator>;
};

const data = seedData as unknown as InputFile;

// ─── Canonical-operator manual overrides ────────────────────────────
//
// The Python pipeline in Product Support/ produces the canonical map
// inside scorecard_data.json algorithmically (string-normalizes PM
// names and groups identical-name PMs across markets). Most multi-
// market brands flow through cleanly that way — see "first-keys-homes"
// and "mynd-property-management" in the merged JSON.
//
// A handful of brands need to be pinned by hand: the same legal
// entity registers under cosmetically different names in different
// markets ("Pure Property Management Of Tennessee" vs "Pure Property
// Management Of Arizona"), or the algorithmic detection initially
// missed the grouping in a prior data refresh. This array is the
// in-repo source of truth for those overrides — listed here so the
// canonical mapping is checked into git rather than only living in
// the Python pipeline's output.
//
// Each entry pins a single PM-slug → canonical-slug + canonical-name.
// applyCanonicalOverrides() walks the array on seed and:
//   1. Overwrites the matching pm's canonicalOperatorId/Name on the
//      in-memory PM record (downstream readers — the PM-table create
//      call AND the scorecardData blob builder — both pick this up).
//   2. Ensures the canonical entity exists in data.canonicalOperators
//      with the right marketIds + pmSlugs. If the algorithmic pass
//      already produced the entity (as it currently does for Ark),
//      we extend rather than overwrite — preserving the aggregate
//      stats the pipeline pre-computed.
//
// Add new overrides by extending the array; no other change required.

interface CanonicalOverride {
  pmSlug: string;
  canonicalSlug: string;
  canonicalName: string;
}

const MANUAL_CANONICAL_OVERRIDES: ReadonlyArray<CanonicalOverride> = [
  // Ark Homes For Rent — unified across Birmingham (AL), Huntsville
  // (AL), Jacksonville (FL), and Knoxville (TN). Surfaced via the
  // watch-list top-10 preview which showed the brand split across all
  // four markets when the production DB was last seeded before the
  // 10-market data refresh. Pinning here so any future regenerate
  // of the data JSON that drops the algorithmic match still ends up
  // with the correct cross-market roll-up after the seed runs.
  { pmSlug: "ark-homes-for-rent-birmingham-al", canonicalSlug: "ark-homes-for-rent", canonicalName: "Ark Homes For Rent" },
  { pmSlug: "ark-homes-for-rent-huntsville-al", canonicalSlug: "ark-homes-for-rent", canonicalName: "Ark Homes For Rent" },
  { pmSlug: "ark-homes-for-rent-jacksonville-fl", canonicalSlug: "ark-homes-for-rent", canonicalName: "Ark Homes For Rent" },
  { pmSlug: "ark-homes-for-rent-knoxville-tn", canonicalSlug: "ark-homes-for-rent", canonicalName: "Ark Homes For Rent" },
];

function applyCanonicalOverrides(input: InputFile): void {
  if (MANUAL_CANONICAL_OVERRIDES.length === 0) return;

  // Index PMs by slug for O(1) lookups instead of an N×M scan when
  // many overrides land at once.
  const pmBySlug = new Map<string, AnyRecord>();
  for (const pm of input.pms) {
    const slug = typeof pm.slug === "string" ? pm.slug : "";
    if (slug) pmBySlug.set(slug, pm);
  }

  // 1. Stamp the canonical fields on each member PM. We update the
  //    top-level fields directly — the existing seed loop builds the
  //    scorecardData blob from these same fields downstream, so the
  //    override propagates everywhere without us touching the blob.
  const overridesByCanonical = new Map<string, CanonicalOverride[]>();
  let overridden = 0;
  for (const o of MANUAL_CANONICAL_OVERRIDES) {
    const pm = pmBySlug.get(o.pmSlug);
    if (!pm) {
      console.warn(
        `[seed] Manual canonical override references unknown pm slug "${o.pmSlug}" — skipping.`
      );
      continue;
    }
    pm.canonicalOperatorId = o.canonicalSlug;
    pm.canonicalOperatorName = o.canonicalName;
    const grouped = overridesByCanonical.get(o.canonicalSlug) ?? [];
    grouped.push(o);
    overridesByCanonical.set(o.canonicalSlug, grouped);
    overridden += 1;
  }

  // 2. Ensure each override-targeted canonical exists in the top-level
  //    canonicalOperators map with the right marketIds + pmSlugs.
  //    Algorithmic detection populated entries for currently-detected
  //    matches; we extend (don't overwrite) so any aggregateStats the
  //    pipeline pre-computed survive.
  if (!input.canonicalOperators) input.canonicalOperators = {};
  let createdEntities = 0;
  let extendedEntities = 0;
  for (const [canonicalSlug, group] of overridesByCanonical.entries()) {
    const memberSlugs = group.map((o) => o.pmSlug);
    const memberMarkets = memberSlugs
      .map((s) => {
        const pm = pmBySlug.get(s);
        return typeof pm?.marketId === "string" ? pm.marketId : "";
      })
      .filter((m): m is string => m.length > 0);

    const existing = input.canonicalOperators[canonicalSlug];
    if (!existing) {
      input.canonicalOperators[canonicalSlug] = {
        canonicalSlug,
        canonicalName: group[0].canonicalName,
        marketIds: Array.from(new Set(memberMarkets)).sort(),
        pmSlugs: Array.from(new Set(memberSlugs)).sort(),
        marketCount: new Set(memberMarkets).size,
        aggregateStats: {},
      };
      createdEntities += 1;
      continue;
    }

    // Merge member slugs + markets in case the override widens the
    // entity beyond what the pipeline detected.
    const mergedSlugs = Array.from(
      new Set([...(existing.pmSlugs ?? []), ...memberSlugs])
    ).sort();
    const mergedMarkets = Array.from(
      new Set([...(existing.marketIds ?? []), ...memberMarkets])
    ).sort();
    const widened =
      mergedSlugs.length !== (existing.pmSlugs ?? []).length ||
      mergedMarkets.length !== (existing.marketIds ?? []).length;
    if (widened) {
      existing.pmSlugs = mergedSlugs;
      existing.marketIds = mergedMarkets;
      existing.marketCount = mergedMarkets.length;
      existing.canonicalName = group[0].canonicalName; // keep override label
      extendedEntities += 1;
    }
  }

  console.log(
    `[seed] Applied ${overridden} manual canonical override${overridden === 1 ? "" : "s"} ` +
      `(${createdEntities} new entit${createdEntities === 1 ? "y" : "ies"}, ` +
      `${extendedEntities} extended).`
  );
}

// Apply once, at module load, so isDataCurrent() spot-checks and the
// main seed loop both observe the override-applied shape.
applyCanonicalOverrides(data);

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
  // The v0.6.2 source JSON emits rentTrajectory in THREE distinct shapes
  // across markets (carry-forward from per-market seed runs):
  //   - Chattanooga + Jacksonville (166 PMs):
  //       { quarter: "2025Q1", mixAdjMedian: 1544.37, n: 41 }
  //   - Clarksville + Knoxville + Memphis + Phoenix (310 PMs):
  //       { quarter: "2025Q1", mixAdjustedMedian: 1234.0, n: 12 }
  //   - Nashville (98 PMs):
  //       { year: 2021, mixAdjustedMedian: 772.0, n: 6 }
  //
  // Canonical output: { quarter: "YYYYQn" or "YYYY", mixAdjMedian, n }.
  // Year-only rows convert to a 4-char "YYYY" quarter string which sorts
  // correctly against quarterly strings via localeCompare.
  return getArray<AnyRecord>(pm, "rentTrajectory")
    .map((r) => {
      const rawQuarter = asString(r.quarter);
      const yearNum = asInt(r.year);
      const quarter = rawQuarter || (yearNum !== null ? String(yearNum) : "");
      const value =
        asNumber(r.mixAdjMedian) ?? asNumber(r.mixAdjustedMedian) ?? 0;
      return {
        quarter,
        mixAdjMedian: value,
        n: asInt(r.n) ?? 0,
      };
    })
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

// v0.7 — portfolio size estimator.
//
// Size-banded model from the calibration analysis at
// Product Support/Dwellsy_IQ_Portfolio_Estimator_Calibration.xlsx
// (sheet: "Size-Banded Model"). Multipliers are URU-to-total-units
// ratios median'd within each (7-cell × URU band) cohort. n is the
// number of operator-market pairs the median was computed across;
// confidence labels follow the calibration sheet's sample-size bins.
//
// Algorithm: cohort lookup keyed on Dwellsy 7-cell × URU activity
// band, multiply annualized URUs by the cohort's median multiplier
// for the point estimate (P25 / P75 for the confidence band).
//
// Annualization adjusts for partial-year platform history: PMs with
// fewer than 12 months of observed listings get their T12 URUs
// upweighted by 12/months so the point estimate projects a full
// year of activity. PMs at ≥ 12 months pass through at 1.0× — they
// already represent a full year. Safe-by-construction: the function
// returns insufficient_history when months < 3, so the smallest
// possible denominator is 3 (max upweight 4×).
//
// Note (history): the v0.7 initial-release spec specified
// `12 / Math.max(months, 12)` which always evaluated to 1.0
// (Math.max bottoms the denominator at 12). Corrected to
// `12 / months` in this fix so newer PMs — primarily the Alabama
// v0.6.4 expansion cohort — actually get the annualization
// upweight the model intends.
export type PortfolioEstimateStatus =
  | "estimated"
  | "insufficient_data"
  | "insufficient_history"
  | "no_listings";

export interface PortfolioEstimate {
  status: PortfolioEstimateStatus;
  point?: number;
  low?: number;
  high?: number;
  cohort?: string;
  cohortN?: number;
  confidence?: "Low" | "Medium" | "High";
  multiplierMedian?: number;
  message?: string;
  methodologyVersion?: string;
}

function estimatePortfolioSize(
  coverage: AnyRecord,
  quadrant7Cell: string | null
): PortfolioEstimate {
  const urusT12 = asInt(coverage.urusT12) ?? 0;
  const months = asInt(coverage.monthsOnPlatform) ?? 0;

  if (urusT12 === 0) return { status: "no_listings" };
  if (months < 3) return { status: "insufficient_history" };

  // Annualize partial-year observations so the point estimate projects
  // a full year of URU activity. Safe denominator: the insufficient_history
  // guard above filters out months < 3, so the smallest denominator we
  // reach here is 3 (max 4× upweight).
  const annualization = months < 12 ? 12 / months : 1.0;
  const annualizedUrus = urusT12 * annualization;

  let median = 0;
  let p25 = 0;
  let p75 = 0;
  let n = 0;
  let confidence: "Low" | "Medium" | "High" = "Low";
  let cohort = "";

  const cell = quadrant7Cell;

  if (cell === "SFR Independent") {
    if (annualizedUrus < 100) {
      [median, p25, p75, n, confidence] = [9.29, 5.69, 11.38, 12, "Low"];
      cohort = "SFR Independent, URUs <100";
    } else if (annualizedUrus < 300) {
      [median, p25, p75, n, confidence] = [3.88, 2.49, 4.74, 29, "Medium"];
      cohort = "SFR Independent, URUs 100-299";
    } else {
      [median, p25, p75, n, confidence] = [1.88, 1.68, 2.40, 6, "Low"];
      cohort = "SFR Independent, URUs 300+";
    }
  } else if (cell === "SFR Institutional") {
    [median, p25, p75, n, confidence] = [3.46, 2.40, 4.18, 4, "Low"];
    cohort = "SFR Institutional (all)";
  } else if (cell === "Hybrid") {
    [median, p25, p75, n, confidence] = [3.21, 1.35, 5.10, 4, "Low"];
    cohort = "Hybrid (all)";
  } else if (cell === "Small MF/BTR Independent") {
    [median, p25, p75, n, confidence] = [1.13, 1.01, 2.50, 3, "Low"];
    cohort = "Small MF/BTR Independent (all)";
  } else if (
    cell === "Large MF/BTR Independent" ||
    cell === "Large MF/BTR Institutional" ||
    cell === "Institutional MF" ||
    cell === "BTR Institutional"
  ) {
    return {
      status: "insufficient_data",
      message:
        "Verified self-report required for Large MF/BTR operators",
      methodologyVersion: "v0.7-portfolio-est-v0.1",
    };
  } else {
    [median, p25, p75, n, confidence] = [4.23, 2.53, 8.11, 59, "Medium"];
    cohort = "Overall fallback";
  }

  return {
    status: "estimated",
    point: Math.round(annualizedUrus * median),
    low: Math.round(annualizedUrus * p25),
    high: Math.round(annualizedUrus * p75),
    cohort,
    cohortN: n,
    confidence,
    multiplierMedian: median,
    methodologyVersion: "v0.7-portfolio-est-v0.1",
  };
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
      // Field-name drift across v0.6.2 markets: Chattanooga, Jacksonville,
      // and Nashville emit both `totalObservedUnits` and `urusT12`; the four
      // newer markets (Clarksville, Knoxville, Memphis, Phoenix) emit only
      // `urusT12`. They're the same number for every operator that carries
      // both, so falling back from totalObservedUnits → urusT12 keeps the
      // semantic ("observed units in this MSA, trailing 12 months") intact
      // and unblocks the market landing PM list rows + the Layer 5B unit
      // estimates that depend on this field. Same fallback pattern used for
      // nationalObservedUnitsT12 below.
      totalObservedUnits:
        asInt(coverage.totalObservedUnits) ?? asInt(coverage.urusT12) ?? 0,
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
      // The v0.6.2 source JSON uses two field-name conventions across
      // markets (carry-forward from per-market seed runs): Chattanooga
      // (37 PMs) uses `completenessScore` / `amenitiesScore` / `descScore`
      // / `compositeScore`; the other 6 markets (535 PMs) use the
      // `*Subscore` + `marketingQuality` form. Accept either shape so
      // canonical ScorecardData always has populated marketing scores.
      completenessScore:
        asNumber(marketing.completenessScore) ??
        asNumber(marketing.completenessSubscore) ??
        0,
      amenitiesScore:
        asNumber(marketing.amenitiesScore) ??
        asNumber(marketing.amenitiesSubscore) ??
        0,
      descScore:
        asNumber(marketing.descScore) ??
        asNumber(marketing.descSubscore) ??
        0,
      medianPhotosT12: asInt(marketing.medianPhotosT12),
      zeroPhotoT12: asNumber(marketing.zeroPhotoT12),
      compositeScore:
        asNumber(marketing.compositeScore) ??
        asNumber(marketing.marketingQuality) ??
        0,
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
    // v0.6.3 Patch 6 — carry the two listing-count fields straight through
    // to the stored ScorecardData blob so the runtime share-trajectory
    // computation can read them per PM without re-parsing the source JSON.
    // asInt returns null when missing; consumers null-guard before pooling.
    t12ListingsCount: asInt(pm.t12ListingsCount) ?? undefined,
    t24t12ListingsCount: asInt(pm.t24t12ListingsCount) ?? undefined,
    // v0.6.4 Patch 1 — canonical operator identity. Carried into the
    // stored scorecardData blob so the IdentityHero cross-market badge
    // + the operator profile page can look up the canonical entity
    // without an extra DB round-trip on every scorecard render.
    canonicalOperatorId: asString(pm.canonicalOperatorId) || undefined,
    canonicalOperatorName: asString(pm.canonicalOperatorName) || undefined,
    // v0.6.4 Patch 2 — concession classifier output. Carried into the
    // stored blob so the Layer 5 ConcessionActivity section renders
    // without re-querying the per-PM concession columns (msaPool
    // already deserializes scorecardData per PM, so the median
    // computation walks pool[].scorecard.concession* in-memory).
    concessionListingCount: asInt(pm.concessionListingCount) ?? undefined,
    concessionRate: asNumber(pm.concessionRate),
    concessionPatterns: Array.isArray(pm.concessionPatterns)
      ? (pm.concessionPatterns as string[])
      : undefined,
    concessionSampleText: asString(pm.concessionSampleText) || undefined,
    // v0.6.4 Patch 2 follow-up — array of up to 3 distinct samples.
    // Baked into the stored ScorecardData blob so the Layer 5 renderer
    // can iterate without parsing the per-PM column.
    concessionSamples: Array.isArray(pm.concessionSamples)
      ? (pm.concessionSamples as unknown[]).filter(
          (s): s is string => typeof s === "string"
        )
      : undefined,
    // v0.7 — portfolio size estimator. Pre-computed at seed time
    // against the size-banded model so the scorecard renderer + Ask
    // tools + brief generator all read a stable value without ever
    // hitting the algorithm. Status field discriminates between
    // estimated / insufficient_data / insufficient_history /
    // no_listings; the Layer 5 widget branches on it.
    portfolioEstimate: estimatePortfolioSize(coverage, asString(pm.quadrant7Cell) || null),
  };
}

// Cheap fingerprint of the seed JSON against the live DB. Returns
// true when we're confident the DB already matches the JSON and we
// can skip the full re-seed. Returns false on:
//   - PM count mismatch (catches half-completed prior seeds and any
//     deletion/migration that changed the row count)
//   - absent market table (a fresh-DB scenario)
//   - spot-check drift on a known PM's concession fields — the v0.6.4
//     Patch 2 + follow-up baked concessionListingCount + a 0-3 sample
//     array per PM, and any seed-JSON revision would change at least
//     one of those for the spot-check operator (Invitation Homes
//     Phoenix, picked because it has high listing volume + 3 samples
//     so the fingerprint is unlikely to collide with stale data).
//
// Three cheap reads (count + findFirst + findUnique) vs 600+ writes
// in the full seed. Worth it for the deploy-time savings.
async function isDataCurrent(): Promise<boolean> {
  const pmCount = await prisma.pM.count();
  if (pmCount !== data.pms.length) {
    console.log(
      `[seed] PM count mismatch: DB has ${pmCount}, JSON has ${data.pms.length}. Re-seeding.`
    );
    return false;
  }

  const firstMarket = await prisma.market.findFirst();
  if (!firstMarket) {
    console.log("[seed] No market records found. Re-seeding.");
    return false;
  }

  // Spot-check PM. Picked at module-build time rather than randomized
  // so reseed decisions stay deterministic across deploys. If the
  // operator ever disappears from the seed we fall through to a
  // re-seed (the lookup returns null), which is the right behavior.
  const SPOT_SLUG = "invitation-homes-phoenix-az";
  const expectedPm = data.pms.find(
    (p) => asString(p.slug) === SPOT_SLUG
  );
  if (!expectedPm) {
    console.log(
      `[seed] Spot-check operator "${SPOT_SLUG}" missing from JSON — seed JSON shape changed. Re-seeding.`
    );
    return false;
  }
  const dbPm = await prisma.pM.findUnique({
    where: { slug: SPOT_SLUG },
    select: {
      concessionListingCount: true,
      concessionSamples: true,
    },
  });
  if (!dbPm) {
    console.log(
      `[seed] Spot-check operator "${SPOT_SLUG}" missing from DB. Re-seeding.`
    );
    return false;
  }

  const expectedCount = asInt(expectedPm.concessionListingCount) ?? 0;
  if (dbPm.concessionListingCount !== expectedCount) {
    console.log(
      `[seed] Data drift on concessionListingCount for "${SPOT_SLUG}": DB ${dbPm.concessionListingCount}, JSON ${expectedCount}. Re-seeding.`
    );
    return false;
  }

  // concessionSamples is stored as a JSON-encoded string column to
  // match the existing JSON-as-String convention; parse before
  // comparing array length to the JSON's raw array.
  const expectedSamples = Array.isArray(expectedPm.concessionSamples)
    ? (expectedPm.concessionSamples as unknown[]).filter(
        (s): s is string => typeof s === "string"
      ).length
    : 0;
  let dbSampleCount = 0;
  try {
    const parsed = JSON.parse(dbPm.concessionSamples) as unknown;
    dbSampleCount = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    dbSampleCount = 0;
  }
  if (dbSampleCount !== expectedSamples) {
    console.log(
      `[seed] Concession sample array length differs for "${SPOT_SLUG}": DB ${dbSampleCount}, JSON ${expectedSamples}. Re-seeding.`
    );
    return false;
  }

  return true;
}

async function main() {
  console.log(
    `Seeding from methodology ${data.methodologyVersion}` +
      (data.designVersion ? `, design ${data.designVersion}` : "") +
      `, dataAsOf ${data.dataAsOf}`
  );

  // Skip the full row-by-row seed when the DB already matches the JSON.
  // Avoids exhausting Neon's connection pool on code-only deploys (the
  // bulk of them). FORCE_SEED=true bypasses for manual refreshes or
  // when the spot-check might miss a shape change.
  if (process.env.FORCE_SEED === "true") {
    console.log(
      "[seed] FORCE_SEED=true — re-seeding regardless of current state."
    );
  } else if (await isDataCurrent()) {
    console.log("[seed] ✓ Data already current. Skipping seed.");
    return;
  }

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

  // Idempotent: clear PMs first (FK to Market), then Markets. Also
  // wipe the MarketBrief LLM cache — when a re-seed runs, the
  // underlying market data has changed (otherwise the isDataCurrent
  // skip-check above would have exited already), so cached brief
  // prose may reference stale numbers (e.g., the national benchmark
  // line shifted from +0.84% to +0.31% with the Alabama expansion).
  // The cache key on MarketBrief is (marketSlug, methodologyVersion,
  // dataAsOf), which would have caught a methodology-version bump
  // but not the within-version data drift this seed represents.
  // First visit per market after deploy will regenerate prose against
  // the fresh data.
  await prisma.marketBrief.deleteMany();
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
        // v0.6.3 — Patches 1 + 3. All v0.6.3 markets carry these; nullable
        // pass-through keeps the seed compatible with v0.6.2 input files
        // where the fields would be undefined.
        activeOperatorCount: asInt(m.activeOperatorCount) ?? null,
        activeOperatorCountBySubmarket: m.activeOperatorCountBySubmarket
          ? JSON.stringify(m.activeOperatorCountBySubmarket)
          : null,
        marketRentGrowthT12: asNumber(m.marketRentGrowthT12),
        nationalRentGrowthT12: asNumber(m.nationalRentGrowthT12),
        marketRentGrowthDeltaVsNationalPp: asNumber(
          m.marketRentGrowthDeltaVsNationalPp
        ),
        // v0.6.3 — Patch 2. Default to T12 (current methodology); pre-v0.6.3
        // inputs that emit "T6M" would still write "T6M" but downstream UI
        // reads only the value, so old data stays internally consistent.
        eligibilityWindow: asString(m.eligibilityWindow) || "T12",
        // v0.6.4 Patch 2 — concession participation count for the
        // cohort comparison line. asInt() returns null on missing/junk
        // input; we coerce to 0 so the DB default is consistent.
        operatorsWithConcessions: asInt(m.operatorsWithConcessions) ?? 0,
      },
    });
    console.log(`  ✓ market: ${m.id} (${m.fullName})`);
  }

  // v0.6.3 quick-wins — deterministic slug-collision disambiguation.
  // The upstream Python pipeline occasionally produces two PMs whose
  // names slugify to the same key (e.g. Knoxville's "Asset Realty
  // Management Inc" vs "Asset Realty Management, Inc." both → "asset-
  // realty-management-inc-knoxville-tn"). Previous behavior silently
  // skipped the second record, dropping the operator from the DB and
  // shifting downstream cohort medians (Knoxville share trajectory
  // was N=26 instead of the spec's N=27). New behavior:
  //
  //   1. Sort PMs by (marketId, slug, name) before iteration so the
  //      "first" record at each collision is stable across reseeds —
  //      it keeps the original slug.
  //   2. The "second" record (and any subsequent collisions) gets a
  //      "-2", "-3", ... suffix appended deterministically until the
  //      slug is unique within the run.
  //   3. Every collision produces a console warning naming both
  //      source records.
  //
  // Both records persist; cohort sizes match the spec pressure-test
  // values. Root-cause fix at the Python pipeline is on the v0.7
  // backlog; this is the defensive app-boundary fix.
  const seenSlugs = new Set<string>();
  const firstNameBySlug = new Map<string, string>();
  // v0.7 — per-pm portfolio-estimate cache. Populated during the PM
  // seeding loop (the scorecard build does the estimate work) so the
  // canonical-operator aggregation pass below can sum point/low/high
  // across each canonical entity's member PMs without re-running the
  // estimator. Keyed by the final disambiguated slug.
  const portfolioEstimateBySlug = new Map<
    string,
    NonNullable<ScorecardData["portfolioEstimate"]>
  >();
  let pmCount = 0;
  let disambiguatedCount = 0;

  // Stable sort: marketId (string) → original slug → name. Mutates a
  // shallow-copied array so we don't surprise downstream consumers of
  // data.pms (none today, but defensive).
  const sortedPms = [...data.pms].sort((a, b) => {
    const am = asString(a.marketId);
    const bm = asString(b.marketId);
    if (am !== bm) return am.localeCompare(bm);
    const aSlug = asString(a.slug);
    const bSlug = asString(b.slug);
    if (aSlug !== bSlug) return aSlug.localeCompare(bSlug);
    return asString(a.name).localeCompare(asString(b.name));
  });

  for (const pm of sortedPms) {
    const originalSlug = asString(pm.slug);
    let slug = originalSlug;
    // Disambiguator loop — append "-2", "-3", ... until unique. The
    // typical case is one collision per pipeline anomaly so the loop
    // body almost always runs once.
    if (seenSlugs.has(slug)) {
      let suffix = 2;
      while (seenSlugs.has(`${originalSlug}-${suffix}`)) suffix += 1;
      slug = `${originalSlug}-${suffix}`;
      const firstName = firstNameBySlug.get(originalSlug) ?? "(unknown)";
      console.warn(
        `  ⚠ slug collision on '${originalSlug}'. Renamed second record to '${slug}'. ` +
          `Source PM names: '${firstName}', '${asString(pm.name)}'.`
      );
      disambiguatedCount += 1;
    } else {
      firstNameBySlug.set(originalSlug, asString(pm.name));
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
    // v0.7 — cache the just-computed portfolio estimate so the
    // canonical-operator aggregation downstream doesn't have to
    // re-run estimatePortfolioSize for every member PM.
    if (scorecard.portfolioEstimate) {
      portfolioEstimateBySlug.set(slug, scorecard.portfolioEstimate);
    }

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
        // v0.6.3 — Patch 1 support. The per-PM submarket listing map drives
        // the filtered-state "Eligible with <submarket> footprint" tile in
        // MarketHero without reparsing scorecardData. Stored as JSON string
        // (SQLite — Json type is just a strongly typed string blob).
        t12ListingsBySubmarket:
          pm.t12ListingsBySubmarket &&
          typeof pm.t12ListingsBySubmarket === "object"
            ? JSON.stringify(pm.t12ListingsBySubmarket)
            : null,
        // v0.6.3 — Patch 2 flag. Spec says almost always false (37 of 575 in
        // the merged JSON; the remaining 537 are undefined which we coerce
        // to false here). One PM is explicitly true.
        newlyEligibleInV063: Boolean(pm.newlyEligibleInV063),
        // v0.6.4 Patch 1 — canonical operator identity. Set from seed
        // JSON; v0.6.4 inputs always populate these. Pre-v0.6.4 reseeds
        // would write null which the downstream renderers null-guard.
        canonicalOperatorId: asString(pm.canonicalOperatorId) || null,
        canonicalOperatorName: asString(pm.canonicalOperatorName) || null,
        // v0.6.4 Patch 2 — concession classifier output. Rate is null
        // when the operator was absent from the classifier CSV input
        // (no T12 description data to scan); 0 when present but no
        // patterns matched; otherwise the decimal fraction. patterns
        // is JSON-encoded (consistent with the other JSON-as-String
        // fields in the schema). sampleText is one representative
        // listing excerpt for the Layer 5 blockquote.
        concessionListingCount: asInt(pm.concessionListingCount) ?? 0,
        concessionRate: asNumber(pm.concessionRate),
        concessionPatterns: Array.isArray(pm.concessionPatterns)
          ? JSON.stringify(pm.concessionPatterns)
          : "[]",
        concessionSampleText: asString(pm.concessionSampleText) || null,
        // v0.6.4 Patch 2 follow-up — up to 3 distinct samples. Filter
        // out non-string entries defensively before stringifying so a
        // future shape drift can't slip null/undefined into the column.
        concessionSamples: Array.isArray(pm.concessionSamples)
          ? JSON.stringify(
              pm.concessionSamples.filter((s) => typeof s === "string")
            )
          : "[]",
      },
    });
    pmCount += 1;
  }

  // v0.6.4 Patch 1 — seed the CanonicalOperator table from the seed's
  // canonicalOperators map (multi-market entities only — single-market
  // PMs are tracked solely via the PM table's canonicalOperatorId
  // column). marketIds + pmSlugs + aggregateStats stored as JSON
  // strings (SQLite has no native JSON type).
  await prisma.canonicalOperator.deleteMany();
  let canonicalCount = 0;
  for (const entity of Object.values(data.canonicalOperators ?? {})) {
    if (!entity || typeof entity !== "object") continue;
    if (!entity.canonicalSlug) continue;
    // v0.7 — roll up per-member portfolio estimates into a canonical
    // aggregate. Sum point/low/high across the entity's member PM
    // slugs; set anyInsufficient when at least one member came back
    // insufficient_data (Large MF/BTR cohort) so the cross-market
    // profile can footnote that the rollup is incomplete. Members
    // with no_listings / insufficient_history contribute 0 and
    // don't flip the flag — they just don't add to the sum.
    let portfolioPoint = 0;
    let portfolioLow = 0;
    let portfolioHigh = 0;
    let anyInsufficient = false;
    let estimatedMemberCount = 0;
    for (const memberSlug of entity.pmSlugs ?? []) {
      const est = portfolioEstimateBySlug.get(memberSlug);
      if (!est) continue;
      if (est.status === "insufficient_data") {
        anyInsufficient = true;
        continue;
      }
      if (est.status !== "estimated") continue;
      portfolioPoint += est.point ?? 0;
      portfolioLow += est.low ?? 0;
      portfolioHigh += est.high ?? 0;
      estimatedMemberCount += 1;
    }
    const sourceAggregate =
      (entity.aggregateStats as Record<string, unknown>) ?? {};
    const aggregateWithEstimate = {
      ...sourceAggregate,
      portfolioEstimate: {
        point: portfolioPoint,
        low: portfolioLow,
        high: portfolioHigh,
        anyInsufficient,
        estimatedMemberCount,
        totalMemberCount: entity.pmSlugs?.length ?? 0,
      },
    };
    await prisma.canonicalOperator.create({
      data: {
        canonicalSlug: entity.canonicalSlug,
        canonicalName: entity.canonicalName ?? entity.canonicalSlug,
        marketIds: JSON.stringify(entity.marketIds ?? []),
        pmSlugs: JSON.stringify(entity.pmSlugs ?? []),
        marketCount: entity.marketCount ?? (entity.marketIds?.length ?? 0),
        aggregateStats: JSON.stringify(aggregateWithEstimate),
      },
    });
    canonicalCount += 1;
  }
  console.log(
    `  ✓ canonical operators: ${canonicalCount} multi-market entities seeded`
  );

  // v0.13 (PR #50) — Per-user auth. Saved watch lists are now owned by
  // the authenticated Clerk user; the two org-shared starter rows
  // (Evernest-style SFR density + Genstone-style integrated services)
  // that previous seeds created had ownerId="shared" and would be
  // invisible to every real user under the new model. We delete them
  // on every reseed so they don't recreate themselves. Acquirers who
  // want those starting points use the editable templates in
  // src/lib/watch-list/templates.ts — clonable from /watch-lists/new.
  await prisma.watchList.deleteMany({
    where: { name: { in: [
      "Evernest-Style SFR Density Build-Out",
      "Genstone-Style Integrated Services",
    ] } },
  });
  console.log("  ✓ watch lists: pre-auth starter rows cleared (templates live in src/lib/watch-list/templates.ts)");

  const marketCount = await prisma.market.count();
  const dbPmCount = await prisma.pM.count();
  const dupeSuffix =
    disambiguatedCount > 0
      ? `, ${disambiguatedCount} slug collision(s) disambiguated`
      : "";
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
