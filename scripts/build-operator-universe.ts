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
import { applyNameCorrectionsToSearchIndex } from "../src/lib/operators/search-index-corrections";
import { dbaAlias, addAlias } from "../src/lib/operators/search-index-aliases";

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
  aliases?: string[];
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
  aliases?: string[];
}

// New search-index tier — one entry per market, so a market name/MSA
// full-name/state-name search surfaces a link to the market landing page
// alongside operator results.
interface OutputMarketEntry {
  tier: "market";
  name: string; // "Denver, CO"
  marketId: string;
  marketCity: string;
  stateCode: string;
  stateSlug: string;
  citySlug: string;
  operatorCount: number;
  aliases?: string[];
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
  markets: OutputMarketEntry[];
};

// Per-market source JSONs (the tracked/Tier-2 tier reads these). The
// company-owned Google Shared Drive is now the source of truth (the pipeline
// data moved off the laptop), so honor $IQ_DATA_DIR exactly like the Python
// pipeline scripts do; fall back to the old Product Support laptop path only
// when it's unset. Set IQ_DATA_DIR to the Drive mount when running a refresh
// (see scripts/data-pipeline/MONTHLY_REFRESH.md) or the tracked tier silently
// empties out.
const SOURCE_DIR =
  process.env.IQ_DATA_DIR ||
  "/Users/jonasbordo/Documents/Claude/Projects/Product Support";
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
  // v0.6.4 Patch 2 — Seattle + Denver added (PR #90). Tier 1 (ranked
  // operators) comes from the merged seed which already contains both
  // markets. Tier 2 (tracked operators) comes from the per-market
  // source JSONs read below; both have v0.6.4 files with the
  // allOperatorsT12BySubmarket field, so the loop picks them up cleanly.
  { slug: "seattle", id: "seattle-wa", city: "Seattle", state: "WA", stateSlug: "washington", citySlug: "seattle" },
  { slug: "denver", id: "denver-co", city: "Denver", state: "CO", stateSlug: "colorado", citySlug: "denver" },
  // v0.6.4 Patch 3 — San Antonio + Boulder + Fort Collins added. Same
  // pattern: v0.6.4 per-market sources, ranked tier from merged seed.
  { slug: "san-antonio", id: "san-antonio-tx", city: "San Antonio", state: "TX", stateSlug: "texas", citySlug: "san-antonio" },
  { slug: "boulder", id: "boulder-co", city: "Boulder", state: "CO", stateSlug: "colorado", citySlug: "boulder" },
  { slug: "fort-collins", id: "fort-collins-co", city: "Fort Collins", state: "CO", stateSlug: "colorado", citySlug: "fort-collins" },
  // v0.6.4 Patch 5 — Dallas-Fort Worth added (PR #98). Largest market to
  // date: 235 ranked PMs, 3,934 total tracked operators in the T12 window.
  { slug: "dallas-fort-worth", id: "dallas-fort-worth-arlington-tx", city: "Dallas-Fort Worth", state: "TX", stateSlug: "texas", citySlug: "dallas-fort-worth" },
  // v0.6.4 Patch 6 — Baltimore + Cincinnati + Pittsburgh added.
  // First MD / OH / PA presence in the platform; all three are mid-
  // sized eastern MSAs with strong SFR operator concentration (Baltimore
  // 77 / Cincinnati 71 / Pittsburgh 80 ranked PMs respectively).
  { slug: "baltimore", id: "baltimore-towson-md", city: "Baltimore", state: "MD", stateSlug: "maryland", citySlug: "baltimore" },
  { slug: "cincinnati", id: "cincinnati-middletown-oh-ky-in", city: "Cincinnati", state: "OH", stateSlug: "ohio", citySlug: "cincinnati" },
  { slug: "pittsburgh", id: "pittsburgh-pa", city: "Pittsburgh", state: "PA", stateSlug: "pennsylvania", citySlug: "pittsburgh" },
  // v0.6.4 Patch 7 — Midwest expansion: Chicago + Cleveland + Columbus +
  // Detroit + Indianapolis + Fort Wayne. First IL / MI presence; OH grows
  // to three markets (Cincinnati + Cleveland + Columbus), IN to two
  // (Indianapolis + Fort Wayne). Chicago is the largest market by ranked
  // operators on the platform (245).
  { slug: "chicago", id: "chicago-joliet-naperville-il-in-wi", city: "Chicago", state: "IL", stateSlug: "illinois", citySlug: "chicago" },
  { slug: "cleveland", id: "cleveland-elyria-mentor-oh", city: "Cleveland", state: "OH", stateSlug: "ohio", citySlug: "cleveland" },
  { slug: "columbus", id: "columbus-oh", city: "Columbus", state: "OH", stateSlug: "ohio", citySlug: "columbus" },
  { slug: "detroit", id: "detroit-warren-livonia-mi", city: "Detroit", state: "MI", stateSlug: "michigan", citySlug: "detroit" },
  { slug: "indianapolis", id: "indianapolis-carmel-in", city: "Indianapolis", state: "IN", stateSlug: "indiana", citySlug: "indianapolis" },
  { slug: "fort-wayne", id: "fort-wayne-in", city: "Fort Wayne", state: "IN", stateSlug: "indiana", citySlug: "fort-wayne" },
  // v0.6.4 Patch 10 — Orlando added (26th market), first new market with
  // company-type columns from the start.
  { slug: "orlando", id: "orlando-kissimmee-sanford-fl", city: "Orlando", state: "FL", stateSlug: "florida", citySlug: "orlando" },
  // v0.6.4 Patch 11 — six-market expansion to 32. First KY / MO / NC / MN /
  // VA presence (Louisville straddles KY-IN; Kansas City + St. Louis bring
  // Missouri to two markets). All six ship typed (company-type columns) from
  // the start, so cross-market identity links via parent_company_id.
  { slug: "louisville", id: "louisville-jefferson-county-ky-in", city: "Louisville", state: "KY", stateSlug: "kentucky", citySlug: "louisville" },
  { slug: "st-louis", id: "st-louis-mo-il", city: "St. Louis", state: "MO", stateSlug: "missouri", citySlug: "st-louis" },
  { slug: "charlotte", id: "charlotte-gastonia-rock-hill-nc-sc", city: "Charlotte", state: "NC", stateSlug: "north-carolina", citySlug: "charlotte" },
  { slug: "kansas-city", id: "kansas-city-mo-ks", city: "Kansas City", state: "MO", stateSlug: "missouri", citySlug: "kansas-city" },
  { slug: "minneapolis", id: "minneapolis-st-paul-bloomington-mn-wi", city: "Minneapolis", state: "MN", stateSlug: "minnesota", citySlug: "minneapolis" },
  { slug: "richmond", id: "richmond-va", city: "Richmond", state: "VA", stateSlug: "virginia", citySlug: "richmond" },
  // v0.6.4 Patch 12 — Houston added (33rd market; completes the Adamas
  // client's 17-market set). Houston-Sugar Land-Baytown, TX MSA (26420).
  { slug: "houston", id: "houston-tx", city: "Houston", state: "TX", stateSlug: "texas", citySlug: "houston" },
  // v0.6.4 Patch 13 — Los Angeles added (34th market). This entry was
  // missed when the market shipped, so LA operators were absent from the
  // search index until now; adding it here backfills LA into the tracked +
  // ranked tiers. Los Angeles-Long Beach-Santa Ana, CA MSA (31100).
  { slug: "los-angeles", id: "los-angeles-long-beach-santa-ana-ca", city: "Los Angeles", state: "CA", stateSlug: "california", citySlug: "los-angeles" },
  // v0.6.4 Patch 14 — Milwaukee added (35th market). First WI-anchored
  // market. Milwaukee-Waukesha-West Allis, WI MSA (33340).
  { slug: "milwaukee", id: "milwaukee-waukesha-west-allis-wi", city: "Milwaukee", state: "WI", stateSlug: "wisconsin", citySlug: "milwaukee" },
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
const namesByCanonicalSlug = new Map<string, Set<string>>();

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
    const nameSet = namesByCanonicalSlug.get(canonSlug) ?? new Set<string>();
    if (pm.name) nameSet.add(pm.name);
    if (pm.canonicalOperatorName) nameSet.add(pm.canonicalOperatorName);
    namesByCanonicalSlug.set(canonSlug, nameSet);
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
    aliases: (() => { const a: string[] = []; addAlias(a, dbaAlias(pm.name, pm.canonicalOperatorName), pm.name); return a.length ? a : undefined; })(),
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
    aliases: (() => { const a: string[] = []; for (const n of namesByCanonicalSlug.get(entity.canonicalSlug) ?? []) addAlias(a, n, entity.canonicalName); return a.length ? a : undefined; })(),
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
  // v0.6.4 Patch 2 — read v0.6.4 source files (every market in MARKETS
  // now has a v0.6.4 per-market JSON in Product Support; the v0.6.3
  // pattern was a leftover from when the Alabama markets were added in
  // v0.6.4 but the original 7 still only had v0.6.3 files). Fall back
  // to v0.6.3 if the v0.6.4 file is missing — shouldn't happen for any
  // current market but defensive.
  let filePath = path.join(SOURCE_DIR, `Scorecard_Data_v0.6.4_${m.slug}.json`);
  if (!fs.existsSync(filePath)) {
    const v063Path = path.join(SOURCE_DIR, `Scorecard_Data_v0.6.3_${m.slug}.json`);
    if (fs.existsSync(v063Path)) {
      filePath = v063Path;
    } else {
      console.warn(`  ! missing source file for ${m.slug}: tried v0.6.4 + v0.6.3`);
      continue;
    }
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

const summaryPath = path.resolve(__dirname, "../src/data/markets-summary.json");
const summaryById = new Map<string, { operatorCountEligible?: number; fullName?: string }>();
if (fs.existsSync(summaryPath)) {
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  for (const m of summary.markets ?? []) summaryById.set(m.id, m);
}
const markets: OutputMarketEntry[] = MARKETS.map((m) => {
  const s = summaryById.get(m.id);
  const name = `${m.city}, ${m.state}`;
  const aliases: string[] = [];
  addAlias(aliases, s?.fullName, name);   // "Denver-Aurora-Lakewood, CO MSA"
  addAlias(aliases, m.city, name);        // bare city
  addAlias(aliases, m.stateSlug, name);   // state name, e.g. "colorado"
  return {
    tier: "market" as const,
    name,
    marketId: m.id,
    marketCity: m.city,
    stateCode: m.state,
    stateSlug: m.stateSlug,
    citySlug: m.citySlug,
    operatorCount: s?.operatorCountEligible ?? 0,
    aliases: aliases.length ? aliases : undefined,
  };
});
console.log(`  markets: ${markets.length}`);

const out: SearchIndex = { ranked, tracked, canonical, markets };

// Phase 2 — overlay admin name corrections so a corrected operator is shown
// + searchable by its new name. Reads the committed export (build stays
// DB-free); an empty file is a no-op. A `pm` correction on a grouped member
// matches no ranked row and is reported as unmatched (expected).
const ncPath = path.resolve(__dirname, "../src/data/name_corrections.json");
if (fs.existsSync(ncPath)) {
  const nc = JSON.parse(fs.readFileSync(ncPath, "utf8"));
  const { matched, unmatched } = applyNameCorrectionsToSearchIndex(
    out,
    nc.corrections ?? []
  );
  console.log(
    `  name corrections: ${matched} applied, ${unmatched.length} unmatched (grouped/absent)`
  );
  if (unmatched.length) console.log(`    unmatched: ${unmatched.join(", ")}`);
}

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
