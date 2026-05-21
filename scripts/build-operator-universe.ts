// One-shot data prep — extracts the operator universe (Tier 2) from the
// seven per-market source JSONs in Product Support and merges with the
// existing ranked-PM list (Tier 1, from src/data/scorecard_data.json) to
// emit a slim src/data/search_index.json the client-side PM search layer
// (Fuse.js) consumes at build time.
//
// Run: npx tsx scripts/build-operator-universe.ts
//
// The merged scorecard_data.json drops allOperatorsT12BySubmarket during
// its own merge; this script reads each per-market source JSON directly
// to recover the universe. The full scorecard_data.json is 8.3MB — too
// heavy to bundle into client JS for instant search — so this index keeps
// only the fields the search needs (name + slug + market + star counts
// + listing count), netting ~150KB total. Re-run whenever the per-market
// source JSONs are refreshed.

import fs from "node:fs";
import path from "node:path";

// Per-market source operator entry from allOperatorsT12BySubmarket.
interface RawUniverseOp {
  name: string;
  t12Listings: number;
  t12ListingsBySubmarket?: Record<string, number>;
}

// ScorecardData-shaped PM entry from the merged seed (only the fields the
// search index needs; everything else is dropped).
interface RawRankedPm {
  slug: string;
  name: string;
  marketId: string;
  performance?: { domStar?: string | null };
  rentPerformance?: { star?: string | null };
  marketing?: { star?: string | null };
  tenancy?: { star?: string | null };
  communityVisibility?: { star?: string | null };
  rank?: { compositeStar?: string | null };
  coverage?: { t12Listings?: number };
  // v0.6.4 Patch 1 — canonical operator identity for the cross-market
  // grouping. Single-market PMs have canonicalOperatorId equal to their
  // slug and don't appear in canonicalOperators below.
  canonicalOperatorId?: string;
  canonicalOperatorName?: string;
}

interface RawCanonicalOperator {
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

interface OutputRankedEntry {
  tier: "ranked";
  name: string;
  slug: string;
  marketId: string;
  marketCity: string;
  stateCode: string;
  stateSlug: string;
  citySlug: string;
  goldCount: number;
  silverCount: number;
  t12Listings: number;
}

// v0.6.4 Patch 1 — search index entry for a multi-market canonical
// operator. Replaces the per-market ranked entries for grouped PMs.
// Click routes to /operators/<canonicalSlug>; the scorecard page resolves
// the per-market scorecards from the CanonicalOperator pmSlugs array.
interface OutputCanonicalEntry {
  tier: "canonical";
  name: string;
  canonicalSlug: string;
  marketCount: number;
  // List of { marketCity, stateCode } for each market the operator
  // operates in. Drives the "Operates in Phoenix, Memphis, Nashville,
  // Jacksonville" subtitle on the search result row.
  markets: Array<{ marketCity: string; stateCode: string }>;
  // Aggregated star counts across the operator's market-instances.
  // Sum is the simplest summary — surfaces multi-market consolidated
  // strength at a glance. Alternative would be a per-market max but
  // sum reads more honestly as "this operator has earned recognition
  // on N axes across their footprint".
  goldCount: number;
  silverCount: number;
  // From canonicalOperators.aggregateStats — pre-computed at seed time.
  totalT12Listings: number;
  totalT24T12Listings: number;
  totalUrusT12: number;
}

interface OutputTrackedEntry {
  tier: "tracked";
  name: string;
  marketId: string;
  marketCity: string;
  stateCode: string;
  stateSlug: string;
  citySlug: string;
  t12Listings: number;
  // Top 3 submarkets by listing count (descending) for the "highlight"
  // banner on the market landing page. Slugs match the submarket-filter
  // slug shape (lowercase, hyphenated). Display name derives by title-
  // casing the slug at render time.
  topSubmarkets: Array<{ slug: string; count: number }>;
}

type SearchIndex = {
  ranked: OutputRankedEntry[];
  tracked: OutputTrackedEntry[];
  // v0.6.4 Patch 1 — one entry per multi-market canonical entity. The
  // per-market ranked entries that compose this canonical group are
  // OMITTED from `ranked` so search returns one row per operator
  // regardless of footprint. Single-market PMs stay in `ranked`.
  canonical: OutputCanonicalEntry[];
};

const SOURCE_DIR = "/Users/jonasbordo/Documents/Claude/Projects/Product Support";
const MARKETS: Array<{
  slug: string;
  id: string;
  city: string;
  state: string;
  stateSlug: string;
  citySlug: string;
}> = [
  { slug: "chattanooga", id: "chattanooga-tn", city: "Chattanooga", state: "TN", stateSlug: "tennessee", citySlug: "chattanooga" },
  { slug: "jacksonville", id: "jacksonville-fl", city: "Jacksonville", state: "FL", stateSlug: "florida", citySlug: "jacksonville" },
  { slug: "nashville", id: "nashville-davidson-murfreesboro-franklin-tn", city: "Nashville", state: "TN", stateSlug: "tennessee", citySlug: "nashville" },
  { slug: "memphis", id: "memphis-tn-ms-ar", city: "Memphis", state: "TN", stateSlug: "tennessee", citySlug: "memphis" },
  { slug: "knoxville", id: "knoxville-tn", city: "Knoxville", state: "TN", stateSlug: "tennessee", citySlug: "knoxville" },
  { slug: "clarksville", id: "clarksville-tn-ky", city: "Clarksville", state: "TN", stateSlug: "tennessee", citySlug: "clarksville" },
  { slug: "phoenix", id: "phoenix-az", city: "Phoenix", state: "AZ", stateSlug: "arizona", citySlug: "phoenix" },
  // Alabama expansion (v0.6.4 10-market refresh). The tracked-tier
  // (Tier 2) per-market source JSONs may not yet exist in Product
  // Support for these three; if missing, the script logs a skip and
  // their tracked entries simply won't appear in the index. Ranked +
  // canonical tiers still surface because they read from the merged
  // seed which already has these markets.
  { slug: "birmingham", id: "birmingham-al", city: "Birmingham", state: "AL", stateSlug: "alabama", citySlug: "birmingham" },
  { slug: "huntsville", id: "huntsville-al", city: "Huntsville", state: "AL", stateSlug: "alabama", citySlug: "huntsville" },
  { slug: "montgomery", id: "montgomery-al", city: "Montgomery", state: "AL", stateSlug: "alabama", citySlug: "montgomery" },
];
const MIN_T12 = 3;

// --- Tier 1 — ranked PMs from the merged seed JSON ---
//
// Star counts mirror the runtime derivation in slugify.ts toPmListItem:
// walk the 5 per-metric stars on each PM, count golds + silvers.
function countStars(
  pm: RawRankedPm,
  tone: "gold" | "silver"
): number {
  const stars = [
    pm.performance?.domStar,
    pm.rentPerformance?.star,
    pm.marketing?.star,
    pm.tenancy?.star,
    pm.communityVisibility?.star,
  ];
  return stars.filter((s) => s === tone).length;
}

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../src/data/scorecard_data.json"),
    "utf8"
  )
) as {
  pms: RawRankedPm[];
  canonicalOperators?: Record<string, RawCanonicalOperator>;
};

const marketIndex = new Map<string, (typeof MARKETS)[number]>();
for (const m of MARKETS) marketIndex.set(m.id, m);

// v0.6.4 Patch 1 — canonical entities (multi-market, marketCount ≥ 2).
// Slug-keyed map; we'll look up by canonicalOperatorId per PM to decide
// whether a PM contributes to a canonical group or stays as a stand-
// alone ranked entry.
const canonicalMap = seed.canonicalOperators ?? {};

// First pass: build the per-PM ranked candidates AND collect star
// counts grouped by canonicalSlug so the canonical entries can
// aggregate star counts across their member PMs.
const allRankedCandidates: Array<{
  pm: RawRankedPm;
  m: (typeof MARKETS)[number];
  gold: number;
  silver: number;
}> = [];
const starsByCanonicalSlug = new Map<string, { gold: number; silver: number }>();
const rankedNamesByMarket = new Map<string, Set<string>>();

for (const pm of seed.pms) {
  const m = marketIndex.get(pm.marketId);
  if (!m) continue;
  const norm = pm.name.toLowerCase().trim();
  const set = rankedNamesByMarket.get(pm.marketId) ?? new Set<string>();
  set.add(norm);
  rankedNamesByMarket.set(pm.marketId, set);
  const gold = countStars(pm, "gold");
  const silver = countStars(pm, "silver");
  allRankedCandidates.push({ pm, m, gold, silver });
  const canonSlug = pm.canonicalOperatorId ?? "";
  if (canonSlug && canonicalMap[canonSlug]) {
    const agg = starsByCanonicalSlug.get(canonSlug) ?? { gold: 0, silver: 0 };
    agg.gold += gold;
    agg.silver += silver;
    starsByCanonicalSlug.set(canonSlug, agg);
  }
}

// Second pass: split candidates into ranked (single-market) vs members
// of a canonical group. Membership decided by whether the PM's
// canonicalOperatorId resolves to a multi-market entity in canonicalMap.
const ranked: OutputRankedEntry[] = [];
for (const { pm, m, gold, silver } of allRankedCandidates) {
  const canonSlug = pm.canonicalOperatorId ?? "";
  if (canonSlug && canonicalMap[canonSlug]) {
    // Skip — this PM rolls up into the canonical entry built below.
    continue;
  }
  ranked.push({
    tier: "ranked",
    name: pm.name,
    slug: pm.slug,
    marketId: pm.marketId,
    marketCity: m.city,
    stateCode: m.state,
    stateSlug: m.stateSlug,
    citySlug: m.citySlug,
    goldCount: gold,
    silverCount: silver,
    t12Listings: pm.coverage?.t12Listings ?? 0,
  });
}
console.log(`Tier 1 ranked PMs (single-market only): ${ranked.length}`);

// Third pass: build canonical entries.
const canonical: OutputCanonicalEntry[] = [];
for (const entity of Object.values(canonicalMap)) {
  if (!entity.canonicalSlug || entity.marketCount < 2) continue;
  const markets = entity.marketIds
    .map((id) => marketIndex.get(id))
    .filter((m): m is (typeof MARKETS)[number] => !!m)
    .map((m) => ({ marketCity: m.city, stateCode: m.state }));
  const stars = starsByCanonicalSlug.get(entity.canonicalSlug) ?? {
    gold: 0,
    silver: 0,
  };
  canonical.push({
    tier: "canonical",
    name: entity.canonicalName,
    canonicalSlug: entity.canonicalSlug,
    marketCount: entity.marketCount,
    markets,
    goldCount: stars.gold,
    silverCount: stars.silver,
    totalT12Listings: entity.aggregateStats.totalT12Listings ?? 0,
    totalT24T12Listings: entity.aggregateStats.totalT24T12Listings ?? 0,
    totalUrusT12: entity.aggregateStats.totalUrusT12 ?? 0,
  });
}
console.log(`Canonical multi-market operators: ${canonical.length}`);

// --- Tier 2 — universe operators per market source JSON ---
//
// Dedup against Tier 1 by case-insensitive name within each market so an
// operator with a scorecard doesn't show up twice. Universe names from
// the data builder are normalized lower-case keys (e.g. "pmi scenic
// city") but the displayed `name` field is title-case ("Pmi Scenic
// City"); match on lower-case for the dedup.

const tracked: OutputTrackedEntry[] = [];
let totalDropped = 0;
for (const m of MARKETS) {
  const filePath = path.join(SOURCE_DIR, `Scorecard_Data_v0.6.3_${m.slug}.json`);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ! missing source file for ${m.slug}: ${filePath}`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    allOperatorsT12BySubmarket?: Record<string, RawUniverseOp>;
  };
  const all = data.allOperatorsT12BySubmarket ?? {};
  const rankedNames = rankedNamesByMarket.get(m.id) ?? new Set<string>();
  let keptForMarket = 0;
  for (const op of Object.values(all)) {
    if (typeof op.name !== "string" || op.name.length === 0) continue;
    if (typeof op.t12Listings !== "number") continue;
    if (op.t12Listings < MIN_T12) {
      totalDropped++;
      continue;
    }
    // Skip Tier 2 entries whose name already appears in Tier 1 for this
    // market — operator has a scorecard; Tier 1 entry is the canonical
    // surface for them.
    if (rankedNames.has(op.name.toLowerCase().trim())) continue;
    // Extract top 3 submarkets by listing count for the banner context
    // line ("Active in Mesa, Scottsdale, Chandler"). Sort descending.
    const subEntries = Object.entries(op.t12ListingsBySubmarket ?? {})
      .map(([slug, count]) => ({ slug, count }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    tracked.push({
      tier: "tracked",
      name: op.name,
      marketId: m.id,
      marketCity: m.city,
      stateCode: m.state,
      stateSlug: m.stateSlug,
      citySlug: m.citySlug,
      t12Listings: op.t12Listings,
      topSubmarkets: subEntries,
    });
    keptForMarket++;
  }
  console.log(`  ✓ ${m.id}: ${keptForMarket} tracked operators`);
}

// Stable display order — t12 desc so the most-active operators surface
// when there's a tie in fuzzy-match score.
tracked.sort((a, b) => b.t12Listings - a.t12Listings);

const out: SearchIndex = { ranked, tracked, canonical };
const outPath = path.resolve(
  __dirname,
  "../src/data/search_index.json"
);
fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`\nWrote ${outPath}`);
console.log(`  Tier 1 (ranked, single-market): ${ranked.length}`);
console.log(`  Tier 1 (canonical, multi-market): ${canonical.length}`);
console.log(`  Tier 2 (tracked, ≥${MIN_T12} T12 after dedup): ${tracked.length}, dropped ${totalDropped} below threshold`);
console.log(`  size: ${(fs.statSync(outPath).size / 1024).toFixed(1)}KB`);
