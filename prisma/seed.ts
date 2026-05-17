import { PrismaClient } from "@prisma/client";
import seedData from "../src/data/scorecard_data.json";
import type {
  CommunityVisibilityBlock,
  ScorecardData,
  TenancyAssetBlock,
} from "../src/lib/types";

const prisma = new PrismaClient();

// ---- v0.6.1 input shape ----
//
// The merged v0.6.1 input has per-market schema drift — Chattanooga uses one
// shape (composite + percentiles + perCommunity), Jacksonville another
// (quadrantMedianDomT12 + communityBreakdown), Nashville a third
// (institutionalUnits/sfrCount-style coverage + communityDetails). The seed
// normalizes all three into the canonical ScorecardData defined in lib/types.

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
  cohortMedianYoyRentChange?: number | null;
  mapBounds?: { north: number; south: number; east: number; west: number };
  mapCenter?: { lat: number; lon: number };
  msaBackdropPoints?: Array<{ lat: number; lon: number }>;
  msaIndexUrus?: number;
  msaTotalListings?: number;
};

type InputFile = {
  methodologyVersion: string;
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

// Map v0.6.1 communityVisibility input (variant by market) → canonical block.
// Returns null when the section should be suppressed.
function normalizeCommunityVisibility(
  pm: AnyRecord
): CommunityVisibilityBlock | null {
  const cv = getObj(pm, "communityVisibility");
  if (!cv) return null;

  const ratio = asNumber(cv.ratio);
  if (ratio === null) return null;

  // State + label can arrive in three shapes:
  //  - { state: "comprehensive", stateLabel: "Comprehensive visibility" }  (Chatt)
  //  - { state: "Comprehensive visibility" } (label-only)                    (Jax/Nash)
  // We canonicalize state → enum, label → human-readable string.
  let stateRaw = asString(cv.state).toLowerCase().trim();
  let stateLabel = asString(cv.stateLabel);
  if (!stateLabel && stateRaw.includes(" ")) {
    stateLabel = asString(cv.state);
    stateRaw = "";
  }

  // Derive canonical state from ratio bands if state is missing/ambiguous.
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

  // perCommunity / communityBreakdown / communityDetails — all three keys
  // exist across the three markets; field names also differ within each
  // entry. Normalize to camelCase canonical shape.
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
  };
}

// rentPerformance — shape is consistent across markets but null-coerce.
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

  return {
    pmYoyChange: pmYoy,
    cohortMedianYoyChange: asNumber(rp.cohortMedianYoyChange),
    delta: asNumber(rp.delta) ?? 0,
    percentileRank: asNumber(rp.percentileRank) ?? 0,
    state,
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

function buildScorecard(pm: AnyRecord, market: InputMarket): ScorecardData {
  const rank = getObj(pm, "rank") ?? {};
  const coverage = getObj(pm, "coverage") ?? {};
  const performance = getObj(pm, "performance") ?? {};
  const marketing = getObj(pm, "marketing") ?? {};
  const tenancy = getObj(pm, "tenancy") ?? {};
  const geo = getObj(pm, "geographicCoverage") ?? {};
  const quadrantPeer = market.quadrantSummary[asString(pm.quadrant)];

  // Percentiles vary: Chattanooga has rank.percentiles; Jax/Nash have a flat
  // percentile in performance.domPercentile and tenancy.tenancyPercentile.
  const percentilesObj = getObj(rank, "percentiles");
  const percentiles = {
    dom:
      asNumber(get(percentilesObj, "dom")) ??
      asNumber(get(performance, "domPercentile")) ??
      null,
    tenancy:
      asNumber(get(percentilesObj, "tenancy")) ??
      asNumber(get(tenancy, "tenancyPercentile")) ??
      null,
    rentPerformance:
      asNumber(get(percentilesObj, "rentPerformance")) ??
      asNumber(get(getObj(pm, "rentPerformance"), "percentileRank")) ??
      null,
    marketing:
      asNumber(get(percentilesObj, "marketing")) ??
      asNumber(get(marketing, "percentileRank")) ??
      null,
    communityVisibility:
      asNumber(get(percentilesObj, "communityVisibility")) ??
      asNumber(get(getObj(pm, "communityVisibility"), "percentileRank")) ??
      null,
  };

  const weightingScheme: "with_cv" | "without_cv" =
    asString(get(rank, "weightingScheme")) === "with_cv"
      ? "with_cv"
      : percentiles.communityVisibility !== null
        ? "with_cv"
        : "without_cv";

  const communityVisibility = normalizeCommunityVisibility(pm);
  const rentPerformance = normalizeRentPerformance(pm);

  return {
    methodologyVersion: data.methodologyVersion,
    dataAsOf: data.dataAsOf,
    pm: {
      slug: asString(pm.slug),
      name: asString(pm.name),
      quadrant: asString(pm.quadrant),
      hybrid: Boolean(pm.hybrid),
      accentColor: pm.accentColor as string | undefined,
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
      percentiles,
      weightingScheme,
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
      mapBounds: market.mapBounds,
      msaBackdropPoints: market.msaBackdropPoints,
    },
    communityVisibility,
    classificationRationale: asString(pm.classificationRationale),
  };
}

async function main() {
  console.log(
    `Seeding from methodology ${data.methodologyVersion}, dataAsOf ${data.dataAsOf}`
  );

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
        quadrantSummary: JSON.stringify(m.quadrantSummary),
      },
    });
    console.log(`  ✓ market: ${m.id} (${m.fullName})`);
  }

  let pmCount = 0;
  for (const pm of data.pms) {
    const marketId = asString(pm.marketId);
    const market = data.markets.find((m) => m.id === marketId);
    if (!market) {
      throw new Error(
        `PM ${asString(pm.slug)} references unknown market ${marketId}`
      );
    }

    const rank = getObj(pm, "rank") ?? {};

    const scorecard = buildScorecard(pm, market);

    await prisma.pM.create({
      data: {
        slug: asString(pm.slug),
        name: asString(pm.name),
        marketId,
        quadrant: asString(pm.quadrant),
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
  console.log(
    `\nSeed complete: ${marketCount} market(s), ${dbPmCount} PM(s) (processed ${pmCount}).`
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
