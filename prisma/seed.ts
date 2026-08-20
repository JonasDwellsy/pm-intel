// Seed is a deliberate production data-release command. It must never run as
// part of vercel-build. The replacement rows are prepared in memory, inserted
// in batches, and committed in one transaction through the unpooled connection,
// so readers see either the old complete dataset or the new complete dataset.
// isDataCurrent() still skips work when the DB matches the committed JSON.
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
// Authorized production-release examples (after creating a recovery point):
//   npx prisma db seed                       # skip if current
//   FORCE_SEED=true npx prisma db seed       # always re-seed

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
// The seed blob is READ AT RUNTIME, not imported.
//
// `import seedData from "…/scorecard_data.json"` made TypeScript infer the
// full literal type of a 42 MB JSON document on every type-check — enough to
// exhaust the default heap, which is why CI carries
// NODE_OPTIONS=--max-old-space-size=8192. Nothing downstream benefited: the
// value is immediately cast (`as unknown as InputFile`), so the inferred type
// was computed and thrown away.
//
// Reading it here costs one file read at seed time and returns the heap.
// v0.24 — operator website enrichment (companyId → {website,phone,name}),
// scraped from Dwellsy company pages by scripts/data-pipeline/enrich_company_websites.py.
// Keyed by the same companyId the scorecard blob carries; missing/empty websites
// leave scorecard.pm.website undefined so the header link stays hidden.
import companyEnrichment from "../src/data/company_enrichment.json";
// v0.26 — cached website-content verdicts (companyId → WebsiteVerdict) for the
// management-model resolver. Produced by
// scripts/data-pipeline/classify_management_website.py; empty ({}) until that
// scrape has run, in which case resolveManagementModel falls back to the
// listing-only signal for every operator.
import managementModelWebsite from "../src/data/management_model_website.json";
import type {
  CohortLevel,
  CommunityVisibilityBlock,
  MultiLevelPercentile,
  ScorecardData,
  StarLevel,
  TenancyAssetBlock,
} from "../src/lib/types";
import {
  estimatedManagedUnits,
  estimatedManagedUnitsBand,
  DEFAULT_MULTIPLIERS,
  type PortfolioMultipliers,
} from "../src/lib/operator-size";
import { applyCorrectionsToSeedData } from "../src/lib/operators/name-correction";
import { LEGACY_OWNER_ID } from "../src/lib/watch-list/store";
import {
  resolveManagementModel,
  type WebsiteVerdict,
} from "@/lib/management-model/resolve";

const seedDatasourceUrl =
  process.env.DATABASE_URL_UNPOOLED?.trim() ||
  process.env.DATABASE_URL?.trim();
const prisma = seedDatasourceUrl
  ? new PrismaClient({ datasourceUrl: seedDatasourceUrl })
  : new PrismaClient();

export type SeedFailurePoint = "after-delete" | "before-fingerprint";

export type SeedRunOptions = {
  force?: boolean;
  failAt?: SeedFailurePoint;
};

const PM_CREATE_BATCH_SIZE = 250;
const SEED_TRANSACTION_TIMEOUT_MS = 120_000;

function inBatches<T>(rows: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size));
  }
  return batches;
}

function injectFailure(
  actual: SeedFailurePoint | undefined,
  point: SeedFailurePoint
) {
  if (actual === point) {
    throw new Error(`[seed-test] injected failure at ${point}`);
  }
}

// v0.8 — portfolio-size multipliers (k_house, k_apt), read once at the start of
// the seed run from the admin-tunable AppSetting rows. buildScorecard() reads
// this when computing portfolioEstimate, so a change to the admin knobs takes
// effect on the next deliberate seed, not live.
let SEED_MULTIPLIERS: PortfolioMultipliers = DEFAULT_MULTIPLIERS;

async function loadSeedMultipliers(client: PrismaClient): Promise<void> {
  try {
    const rows = await client.appSetting.findMany({
      where: { key: { in: ["portfolio_k_house", "portfolio_k_apt"] } },
    });
    const byKey = new Map(rows.map((r) => [r.key, Number(r.value)]));
    const kHouse = byKey.get("portfolio_k_house");
    const kApt = byKey.get("portfolio_k_apt");
    SEED_MULTIPLIERS = {
      kHouse: kHouse != null && Number.isFinite(kHouse) && kHouse > 0 ? kHouse : DEFAULT_MULTIPLIERS.kHouse,
      kApt: kApt != null && Number.isFinite(kApt) && kApt > 0 ? kApt : DEFAULT_MULTIPLIERS.kApt,
    };
  } catch {
    SEED_MULTIPLIERS = DEFAULT_MULTIPLIERS;
  }
}

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
  // Per-market data cutoff (each market refreshes on its own cadence).
  // Populated by merge.py from the per-market source blob. Optional for
  // back-compat with pre-fix seed JSONs; falls back to the global dataAsOf.
  dataAsOf?: string;
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

const data = JSON.parse(
  readFileSync(path.join(__dirname, "../src/data/scorecard_data.json"), "utf8")
) as InputFile;

// companyId → operator website, from the enrichment scrape. Normalized to an
// absolute https URL so the scorecard header can use it as an href directly.
const enrichmentByCompanyId = companyEnrichment as Record<
  string,
  { website?: string | null; phone?: string | null; name?: string | null; error?: string }
>;
function websiteForCompany(companyId: string | undefined): string | undefined {
  if (!companyId) return undefined;
  const raw = enrichmentByCompanyId[companyId]?.website?.trim();
  if (!raw) return undefined;
  // Enrichment values are mostly absolute (http/https); coerce the rare bare
  // domain to https and reject anything that isn't a plausible URL.
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url) ? url : undefined;
}

// companyId → website-content verdict for the management-model resolver.
// Empty ({}) until scripts/data-pipeline/classify_management_website.py has
// run; every lookup below then safely falls through to null (listing-only).
const websiteVerdictByCompanyId = managementModelWebsite as Record<
  string,
  WebsiteVerdict
>;

// Per-market data-cutoff lookup. The scorecard footer shows each operator's
// OWN market cutoff (markets refresh on different dates), not the global max
// across all markets — which is what data.dataAsOf holds. Falls back to the
// global value for any market missing a per-market date.
const marketDataAsOf = new Map<string, string>(
  data.markets
    .filter((m) => typeof m.dataAsOf === "string")
    .map((m) => [m.id, m.dataAsOf as string])
);

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
// computes geographicConcentration; v1.0 design renders three more derived
// signals (vacancySignal, operatorStability, pricingTier) at runtime.
function normalizeLendingSignals(
  pm: AnyRecord
): ScorecardData["lendingSignals"] | undefined {
  const ls = getObj(pm, "lendingSignals");
  if (!ls) return undefined;
  const out: NonNullable<ScorecardData["lendingSignals"]> = {};

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
  message?: string;
  methodologyVersion?: string;
}

// v0.8 — portfolio size = houseUrusT12 × k_house + aptUrusT12 × k_apt (see
// src/lib/operator-size.ts). Single source: computed here at seed time so every
// reader (scorecard, market pages, operator page, watch-lists, AI, briefs, PDF,
// home, sparkline) sees one consistent value via scorecard.portfolioEstimate.
// Kept in sync with the src/lib/operators/portfolio-estimate.ts copy the
// trajectory backfill uses; both delegate the arithmetic to estimatedManagedUnits.
//
// Bumped whenever the size methodology changes. isDataCurrent() compares the
// DB's stored portfolioEstimate.methodologyVersion to this, so a code-only
// methodology change makes the next deliberate seed run without FORCE_SEED.
const SIZE_METHODOLOGY_VERSION = "v0.8.1-house-apt-turnover-band";

// Content fingerprint of the committed seed inputs (scorecard_data.json +
// company_enrichment.json). isDataCurrent() compares this to the value stored
// in AppSetting after the last successful seed; ANY change to either file
// yields a new hash, so the next deliberate seed does not need FORCE_SEED.
// This is the general guard the narrow spot-checks (concession fields,
// size version, PM count, market cities) missed — a reclassification, marketing
// rescale, or recovered-website change trips it where those don't. Stable for
// unchanged content (parse order is deterministic per file); reformatting the
// JSON without a content change keeps the same hash.
const SEED_CONTENT_VERSION_KEY = "seed_content_version";
// Salt for the content fingerprint. Bump this string whenever buildScorecard's
// EMITTED SHAPE changes without the input JSON changing — e.g. wiring a new
// pipeline field through the seed normalizer. Folding it into the hash forces a
// one-time re-seed on the next deliberate run even though scorecard_data.json
// is byte-identical, so the new column shape actually lands. (v1 = propertyDetail
// passthrough — the JSON already carried it from the #260 reseed, but
// buildScorecard was dropping it, so the fingerprint alone wouldn't re-trigger.
// v2 = managementModel, computed+baked at seed time from the listing shape +
// management_model_website.json — no pipeline re-run needed to pick it up.)
const SEED_SHAPE_VERSION = "v2-managementModel";
export const SEED_CONTENT_VERSION = crypto
  .createHash("sha256")
  .update(SEED_SHAPE_VERSION)
  .update(JSON.stringify(data))
  .update(JSON.stringify(companyEnrichment))
  .update(JSON.stringify(managementModelWebsite))
  .digest("hex")
  .slice(0, 16);

function estimatePortfolioSize(
  coverage: AnyRecord,
  performance: AnyRecord,
  multipliers: PortfolioMultipliers = SEED_MULTIPLIERS
): PortfolioEstimate {
  const urusT12 = asInt(coverage.urusT12) ?? 0;
  const months = asInt(coverage.monthsOnPlatform) ?? 0;

  if (urusT12 === 0) return { status: "no_listings" };
  if (months < 3) return { status: "insufficient_history" };

  const point = estimatedManagedUnits(
    {
      houseUrusT12: asInt(performance.houseUrusT12),
      aptUrusT12: asInt(performance.aptUrusT12),
    },
    multipliers
  );

  if (point == null || point <= 0) {
    return {
      status: "insufficient_data",
      message: "No observed units to estimate portfolio size.",
      methodologyVersion: SIZE_METHODOLOGY_VERSION,
    };
  }

  // v0.8.1 — seed the low/high turnover band alongside the point so every
  // seed-blob reader (watch-list range filter, CSV, canonical-operator
  // aggregate) sees the same range the scorecard computes read-time. Clamp so
  // the point always sits inside [low, high] even if admin-tuned multipliers
  // fall outside the band.
  const band = estimatedManagedUnitsBand({
    houseUrusT12: asInt(performance.houseUrusT12),
    aptUrusT12: asInt(performance.aptUrusT12),
  });
  return {
    status: "estimated",
    point,
    low: band ? Math.min(band.low, point) : point,
    high: band ? Math.max(band.high, point) : point,
    cohort: "house/apt turnover",
    methodologyVersion: SIZE_METHODOLOGY_VERSION,
  };
}

export function buildScorecard(pm: AnyRecord, market: InputMarket): ScorecardData {
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

  // v0.26 — management-model resolution. quadrant7Cell and companyId are
  // top-level on the raw pm record (same accessors used for pm.quadrant7Cell
  // / pm.companyId below); propertyDetail comes via the existing getObj
  // helper, matching the passthrough already used for the field itself.
  // Computed here (once, ahead of the returned object) so both the
  // propertyDetail passthrough and managementModel reuse the same value
  // instead of reading pm.propertyDetail twice.
  const propertyDetailValue =
    (getObj(pm, "propertyDetail") as unknown as
      | ScorecardData["propertyDetail"]
      | null) ?? undefined;
  const companyIdValue = asString(pm.companyId) || undefined;
  const managementModel = resolveManagementModel(
    {
      quadrant7Cell: asString(pm.quadrant7Cell) || null,
      properties: propertyDetailValue?.properties ?? null,
    },
    companyIdValue ? (websiteVerdictByCompanyId[companyIdValue] ?? null) : null
  );

  return {
    methodologyVersion: data.methodologyVersion,
    designVersion: data.designVersion,
    // Per-market cutoff (this operator's market), not the global max.
    dataAsOf: marketDataAsOf.get(asString(pm.marketId)) ?? data.dataAsOf,
    pm: {
      slug: asString(pm.slug),
      name: asString(pm.name),
      quadrant: legacyQuadrant,
      quadrant7Cell: asString(pm.quadrant7Cell) || undefined,
      hybrid: Boolean(pm.hybrid),
      institutional: Boolean(pm.institutional),
      accentColor: pm.accentColor as string | undefined,
      primaryCity: asString(pm.primaryCity) || undefined,
      // v0.24 — Dwellsy company-page id (100% populated) drives the header's
      // "View listings on Dwellsy" link; website (from the enrichment scrape,
      // ~partial coverage) drives the "Operator website" link. Both optional;
      // the redesigned header null-guards each independently.
      companyId: asString(pm.companyId) || undefined,
      website: websiteForCompany(asString(pm.companyId) || undefined),
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
      // Survival-based tenancy retention (v0.6.4). Persist these into the
      // stored scorecardData blob — the view-model's tenancy branch reads
      // retention18Pct/retentionCurve/tenancySuppressed[Reason]; without them
      // every tenant-retention card renders as suppressed ("—"). (The prior
      // tenancy-metric work updated the pipeline + types + view-model but never
      // wired this seed normalizer, so the fields never reached the DB.)
      retention18Pct: asNumber(tenancy.retention18Pct) ?? null,
      retentionCurve: (() => {
        const c = getObj(tenancy, "retentionCurve");
        const m12 = asNumber(get(c, "m12"));
        const m18 = asNumber(get(c, "m18"));
        const m24 = asNumber(get(c, "m24"));
        return m12 != null && m18 != null && m24 != null
          ? { m12, m18, m24 }
          : undefined;
      })(),
      kmMedianMonths: asNumber(tenancy.kmMedianMonths) ?? null,
      atRisk18: asInt(tenancy.atRisk18) ?? undefined,
      turnoverEvents: asInt(tenancy.turnoverEvents) ?? undefined,
      tenancyQualified:
        typeof tenancy.tenancyQualified === "boolean"
          ? tenancy.tenancyQualified
          : undefined,
      tenancySuppressed:
        typeof tenancy.tenancySuppressed === "boolean"
          ? tenancy.tenancySuppressed
          : undefined,
      tenancySuppressedReason:
        asString(tenancy.tenancySuppressedReason) || undefined,
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
    portfolioEstimate: estimatePortfolioSize(coverage, performance),
    // Phase 1 property-level detail (property_detail.py → pipeline). The
    // pipeline already emits the PropertyDetailBlock shape the view-model +
    // export consume, so it passes straight through; undefined when absent
    // (operators with no listings). MUST be copied explicitly — buildScorecard
    // field-picks the blob, so an un-copied pipeline field is silently dropped
    // (the same trap that blanked the tenancy fields; see
    // seed-build-scorecard.test.ts). Without this the Properties section never
    // renders even after the pipeline populates the data.
    propertyDetail: propertyDetailValue,
    // v0.26 — inferred management model, baked in at seed time (see the
    // computation above buildScorecard's `return`). Same field-pick trap as
    // propertyDetail: an un-listed field here is silently dropped from the
    // stored blob even though managementModel itself is fully computed.
    managementModel,
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
// in the full seed. Worth it for faster no-op checks.
async function isDataCurrent(client: PrismaClient): Promise<boolean> {
  // Seed-content fingerprint — the comprehensive guard. If either committed
  // input file changed since the last successful seed, the hash differs and we
  // re-seed. Catches everything the field-level spot-checks below can't (7-cell
  // reclassification, marketing scores, recovered websites, etc.).
  const dbSeedVer = await client.appSetting.findUnique({
    where: { key: SEED_CONTENT_VERSION_KEY },
  });
  if (dbSeedVer?.value !== SEED_CONTENT_VERSION) {
    console.log(
      `[seed] Seed content drift: DB ${dbSeedVer?.value ?? "none"}, code ${SEED_CONTENT_VERSION}. Re-seeding.`
    );
    return false;
  }

  const pmCount = await client.pM.count();
  if (pmCount !== data.pms.length) {
    console.log(
      `[seed] PM count mismatch: DB has ${pmCount}, JSON has ${data.pms.length}. Re-seeding.`
    );
    return false;
  }

  const firstMarket = await client.market.findFirst();
  if (!firstMarket) {
    console.log("[seed] No market records found. Re-seeding.");
    return false;
  }

  // Spot-check PM. Picked at module-build time rather than randomized
  // so reseed decisions stay deterministic across invocations. If the
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
  const dbPm = await client.pM.findUnique({
    where: { slug: SPOT_SLUG },
    select: {
      concessionListingCount: true,
      concessionSamples: true,
      scorecardData: true,
    },
  });
  if (!dbPm) {
    console.log(
      `[seed] Spot-check operator "${SPOT_SLUG}" missing from DB. Re-seeding.`
    );
    return false;
  }

  // v0.8 — re-seed when the size methodology drifts. portfolioEstimate is
  // computed at seed time (not carried in the committed JSON), so a code-only
  // methodology change can't be caught by the field spot-checks below; compare
  // the stored version tag instead. Self-heals every future methodology bump.
  try {
    const dbEst = (JSON.parse(dbPm.scorecardData) as ScorecardData)
      .portfolioEstimate;
    if (dbEst?.methodologyVersion !== SIZE_METHODOLOGY_VERSION) {
      console.log(
        `[seed] Portfolio methodology drift for "${SPOT_SLUG}": DB ${dbEst?.methodologyVersion ?? "none"}, code ${SIZE_METHODOLOGY_VERSION}. Re-seeding.`
      );
      return false;
    }
  } catch {
    return false; // unparseable blob → re-seed
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

  // v0.6.4 Patch 5 hotfix — market.city drift check. PR #98 shipped DFW
  // with market.city="Dallas" (so the URL was /property-managers/texas/dallas,
  // not the /dallas-fort-worth we'd told users); fixing it requires the next
  // deliberate seed to run even though the PM count is unchanged. We
  // walk every JSON market and confirm the DB row carries a matching city.
  // Any mismatch — added market, renamed city, manual DB edit — flips us
  // back to a full re-seed, which is the safe default.
  for (const m of data.markets) {
    const dbMarket = await client.market.findUnique({
      where: { id: asString(m.id) },
      select: { city: true },
    });
    if (!dbMarket) {
      console.log(
        `[seed] Market "${asString(m.id)}" missing from DB. Re-seeding.`
      );
      return false;
    }
    if (dbMarket.city !== asString(m.city)) {
      console.log(
        `[seed] Market "${asString(m.id)}" city drift: DB "${dbMarket.city}", JSON "${asString(m.city)}". Re-seeding.`
      );
      return false;
    }
  }

  return true;
}

export async function runSeed(
  client: PrismaClient,
  options: SeedRunOptions = {}
): Promise<void> {
  console.log(
    `Seeding from methodology ${data.methodologyVersion}` +
      (data.designVersion ? `, design ${data.designVersion}` : "") +
      `, dataAsOf ${data.dataAsOf}`
  );

  // Load the admin-tunable portfolio-size multipliers before building any
  // scorecard (buildScorecard → estimatePortfolioSize reads SEED_MULTIPLIERS).
  await loadSeedMultipliers(client);
  console.log(
    `Portfolio multipliers: k_house=${SEED_MULTIPLIERS.kHouse} k_apt=${SEED_MULTIPLIERS.kApt}`
  );

  // Skip the full row-by-row seed when the DB already matches the JSON.
  // Avoids exhausting Neon's connection pool on unnecessary manual runs.
  // FORCE_SEED=true bypasses for controlled data refreshes or
  // when the spot-check might miss a shape change.
  if (options.force) {
    console.log(
      "[seed] FORCE_SEED=true — re-seeding regardless of current state."
    );
  } else if (await isDataCurrent(client)) {
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

  // Re-apply admin name corrections (durable applier). The corrections
  // table is never wiped by this seed, so read it now and stamp the
  // in-memory data before rows are (re)created — mirrors how
  // applyCanonicalOverrides stamps identity. Live edits made via
  // /admin/names are thus reproduced on every reseed.
  const corrections = await client.operatorNameCorrection.findMany({
    select: {
      targetKind: true,
      targetKey: true,
      correctedName: true,
      originalName: true,
    },
  });
  if (corrections.length > 0) {
    const { applied, stale, drifted } = applyCorrectionsToSeedData(
      data.pms as never,
      (data.canonicalOperators ?? {}) as never,
      corrections
    );
    console.log(`[seed] applied ${applied} operator name correction(s).`);
    if (stale.length > 0) {
      console.warn(
        `[seed] ${stale.length} name correction(s) had no matching operator (stale): ${stale.join(", ")}`
      );
    }
    if (drifted.length > 0) {
      console.warn(
        `[seed] ${drifted.length} name correction(s) had a source-name drift (recorded originalName no longer matches): ${drifted.join(", ")}`
      );
    }
  }

  const marketRows: Prisma.MarketCreateManyInput[] = [];
  for (const m of data.markets) {
    marketRows.push({
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
    });
  }
  console.log(`  ✓ prepared ${marketRows.length} market row(s)`);

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
  const pmRows: Prisma.PMCreateManyInput[] = [];

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

    pmRows.push({
        slug,
        name: asString(pm.name),
        marketId,
        quadrant: legacyQuadrant,
        quadrant7Cell,
        hybrid: Boolean(pm.hybrid),
        // v0.6.4 Patch 9 — company-type bucket. Defaults to "pm" when the
        // field is absent (markets seeded before the company-type columns
        // existed), so mixed-schema seeds behave correctly.
        operatorType: asString(pm.operatorType) === "broker" ? "broker" : "pm",
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
        // v0.24 — Dwellsy company-page id (see schema PM.companyId). Deep-links
        // the admin merge tool to dwellsy.com/company/<id>.
        companyId: asString(pm.companyId) || null,
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
    });
    pmCount += 1;
  }

  // v0.6.4 Patch 1 — seed the CanonicalOperator table from the seed's
  // canonicalOperators map (multi-market entities only — single-market
  // PMs are tracked solely via the PM table's canonicalOperatorId
  // column). marketIds + pmSlugs + aggregateStats stored as JSON
  // strings (SQLite has no native JSON type).
  let canonicalCount = 0;
  const canonicalRows: Prisma.CanonicalOperatorCreateManyInput[] = [];
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
    canonicalRows.push({
        canonicalSlug: entity.canonicalSlug,
        canonicalName: entity.canonicalName ?? entity.canonicalSlug,
        marketIds: JSON.stringify(entity.marketIds ?? []),
        pmSlugs: JSON.stringify(entity.pmSlugs ?? []),
        marketCount: entity.marketCount ?? (entity.marketIds?.length ?? 0),
        aggregateStats: JSON.stringify(aggregateWithEstimate),
    });
    canonicalCount += 1;
  }
  console.log(
    `  ✓ canonical operators: ${canonicalCount} multi-market entities seeded`
  );
  const snapshotRows = buildOperatorSnapshotRows(
    pmRows,
    data.dataAsOf,
    data.methodologyVersion
  );

  const transactionResult = await client.$transaction(
    async (tx) => {
      // Readers continue to see the old committed dataset until this entire
      // replacement commits. Any error rolls back the deletes and every write.
      await tx.marketBrief.deleteMany();
      await tx.pM.deleteMany();
      await tx.market.deleteMany();
      await tx.canonicalOperator.deleteMany();
      injectFailure(options.failAt, "after-delete");

      const insertedMarkets = await tx.market.createMany({ data: marketRows });
      let insertedPms = 0;
      for (const batch of inBatches(pmRows, PM_CREATE_BATCH_SIZE)) {
        insertedPms += (await tx.pM.createMany({ data: batch })).count;
      }
      const insertedCanonicals = await tx.canonicalOperator.createMany({
        data: canonicalRows,
      });

      // v0.13 (PR #50) — remove only the two obsolete pre-auth starter rows.
      // A customer may legitimately reuse either name, so ownership is part
      // of the deletion identity.
      await tx.watchList.deleteMany({
        where: {
          ownerId: LEGACY_OWNER_ID,
          name: {
            in: [
              "Evernest-Style SFR Density Build-Out",
              "Genstone-Style Integrated Services",
            ],
          },
        },
      });

      if (
        insertedMarkets.count !== marketRows.length ||
        insertedPms !== pmRows.length ||
        insertedCanonicals.count !== canonicalRows.length
      ) {
        throw new Error(
          `[seed] Insert count mismatch: markets ${insertedMarkets.count}/${marketRows.length}, ` +
            `PMs ${insertedPms}/${pmRows.length}, canonicals ${insertedCanonicals.count}/${canonicalRows.length}`
        );
      }

      const marketCount = await tx.market.count();
      const dbPmCount = await tx.pM.count();
      let snapshotCount = 0;
      for (const batch of inBatches(snapshotRows, PM_CREATE_BATCH_SIZE)) {
        snapshotCount += (
          await tx.operatorSnapshot.createMany({
            data: batch,
            skipDuplicates: true,
          })
        ).count;
      }

      injectFailure(options.failAt, "before-fingerprint");

      // Stamp the fingerprint last. It becomes visible only with the complete
      // replacement, so it can never describe a partial dataset.
      await tx.appSetting.upsert({
        where: { key: SEED_CONTENT_VERSION_KEY },
        create: {
          key: SEED_CONTENT_VERSION_KEY,
          value: SEED_CONTENT_VERSION,
          type: "string",
          description:
            "sha256 fingerprint of the committed Operator IQ seed inputs. Drives the isDataCurrent() guard.",
        },
        update: { value: SEED_CONTENT_VERSION },
      });

      return { marketCount, dbPmCount, snapshotCount };
    },
    {
      maxWait: 10_000,
      timeout: SEED_TRANSACTION_TIMEOUT_MS,
    }
  );

  const dupeSuffix =
    disambiguatedCount > 0
      ? `, ${disambiguatedCount} slug collision(s) disambiguated`
      : "";
  console.log(
    `\nSeed complete: ${transactionResult.marketCount} market(s), ` +
      `${transactionResult.dbPmCount} PM(s) (processed ${pmCount}${dupeSuffix}).`
  );
  console.log("  ✓ watch lists: obsolete pre-auth starter rows cleared");
  console.log(
    `  ✓ operator snapshots: ${transactionResult.snapshotCount} new row(s) written`
  );
  console.log(`[seed] ✓ Stamped ${SEED_CONTENT_VERSION_KEY}=${SEED_CONTENT_VERSION}`);
}

/**
 * Capture per-operator snapshots into OperatorSnapshot. One row per
 * PM, stamped with snapshotDate = dataAsOf (the data-cutoff date,
 * not the seed time). Safe to call on every seed run — the unique
 * constraint silently dedupes re-runs against the same data.
 */
function buildOperatorSnapshotRows(
  pms: Prisma.PMCreateManyInput[],
  dataAsOf: string,
  methodologyVersion: string
): Prisma.OperatorSnapshotCreateManyInput[] {
  const snapshotDate = new Date(dataAsOf);

  // Build canonical-operator → marketIds map so each PM snapshot
  // can carry the FULL canonical footprint as topMSAs. For
  // single-market operators (canonicalOperatorId === pmSlug, no
  // CanonicalOperator row), topMSAs is the operator's only market.
  // For cross-market entities (Invitation Homes across 4 markets),
  // every PM row in the snapshot batch carries the same 4-element
  // array — redundant, but it makes the diff trivial per-PM.
  const marketsByCanonical = new Map<string, Set<string>>();
  for (const pm of pms) {
    const canonicalId = pm.canonicalOperatorId ?? pm.slug;
    let set = marketsByCanonical.get(canonicalId);
    if (!set) {
      set = new Set<string>();
      marketsByCanonical.set(canonicalId, set);
    }
    set.add(pm.marketId);
  }

  const rows: Prisma.OperatorSnapshotCreateManyInput[] = [];

  for (const pm of pms) {
    type ScorecardShape = {
      performance?: { domStar?: string };
      tenancy?: { star?: string };
      rentPerformance?: { star?: string };
      marketing?: { star?: string };
      communityVisibility?: { star?: string };
      portfolioEstimate?: {
        status?: string;
        point?: number;
        low?: number;
        high?: number;
      };
      coverage?: { t12Listings?: number };
      quadrant7Cell?: string;
      pm?: { operatorStatus?: string; lastListingDate?: string };
    };
    let sc: ScorecardShape;
    try {
      sc = JSON.parse(pm.scorecardData) as ScorecardShape;
    } catch {
      // Malformed scorecard JSON — skip this row, don't fail the
      // whole snapshot capture. Real data drift will surface in the
      // next monthly refresh.
      continue;
    }

    const normaliseStar = (v: string | undefined) =>
      v === "gold" || v === "silver" ? v : null;
    const stars = {
      leaseUp: normaliseStar(sc.performance?.domStar),
      tenancy: normaliseStar(sc.tenancy?.star),
      rentPerformance: normaliseStar(sc.rentPerformance?.star),
      marketingDiscipline: normaliseStar(sc.marketing?.star),
      inventoryTransparency: normaliseStar(sc.communityVisibility?.star),
    };
    let gold = 0;
    let silver = 0;
    for (const s of Object.values(stars)) {
      if (s === "gold") gold++;
      else if (s === "silver") silver++;
    }

    // Portfolio band: low–high turnover range when estimated (the v0.8
    // confidence tier was retired), status string otherwise (so the diff
    // can detect estimated↔not transitions).
    let point: number | null = null;
    let band: string | null = null;
    const est = sc.portfolioEstimate;
    if (est?.status === "estimated" && typeof est.point === "number") {
      point = Math.round(est.point);
      band =
        typeof est.low === "number" && typeof est.high === "number"
          ? `${Math.round(est.low)}–${Math.round(est.high)}`
          : null;
    } else if (est) {
      band = est.status ?? null;
    }

    // Active submarkets: parse the JSON map column off the PM row,
    // keep slugs where listing count > 0.
    const activeSubmarkets: string[] = [];
    if (typeof pm.t12ListingsBySubmarket === "string") {
      try {
        const parsed = JSON.parse(pm.t12ListingsBySubmarket) as Record<
          string,
          unknown
        >;
        for (const [slug, value] of Object.entries(parsed)) {
          if (typeof value === "number" && value > 0) activeSubmarkets.push(slug);
        }
      } catch {
        // Bad JSON — treat as no active submarkets.
      }
    }
    activeSubmarkets.sort();

    const t12Listings = sc.coverage?.t12Listings ?? 0;
    const canonicalMarkets = Array.from(
      marketsByCanonical.get(pm.canonicalOperatorId ?? pm.slug) ?? []
    ).sort();

    rows.push({
      pmSlug: pm.slug,
      snapshotDate,
      methodologyVersion,
      starsPerMetric: JSON.stringify(stars),
      starGoldCount: gold,
      starSilverCount: silver,
      estimatedPortfolioPoint: point,
      estimatedPortfolioBand: band,
      topMSAs: JSON.stringify(canonicalMarkets),
      topSubmarkets: JSON.stringify(activeSubmarkets),
      concessionRate: pm.concessionRate ?? null,
      isEligibleForRanking: t12Listings >= 30,
      t12ListingsCount: t12Listings,
      quadrant7Cell: sc.quadrant7Cell ?? null,
      // v0.8 dormant tier (phase 3) — captured so the monthly digest can spot
      // the TRANSITION. A watch-listed operator going quiet used to produce
      // silence; two snapshots are what turn it into a signal.
      operatorStatus: sc.pm?.operatorStatus === "dormant" ? "dormant" : "active",
      lastListingDate: sc.pm?.lastListingDate ?? null,
    });
  }

  return rows;
}

// Only run the seeder when this file is executed directly — `prisma db seed`
// runs `tsx prisma/seed.ts`, so a `prisma/seed.<ext>` entry appears in argv.
// When the module is IMPORTED instead (e.g. build-scorecard.test.ts imports
// `buildScorecard`), no such argv entry exists and main() stays dormant, so a
// test can never trigger a real seed of the shared database. The top-level
// consts (data, marketDataAsOf, enrichmentByCompanyId) still initialize on
// import — they're pure and DB-free; only main() does database work.
const RUN_DIRECTLY = process.argv.some((a) =>
  /prisma[/\\]seed\.(ts|js|mjs|cjs)$/.test(a)
);
if (RUN_DIRECTLY) {
  runSeed(prisma, { force: process.env.FORCE_SEED === "true" })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
