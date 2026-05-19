// Two-tier PM search index + Fuse.js fuzzy searcher.
// Drives both the top-nav SearchInput dropdown and the Cmd+K SearchModal.
//
// Tier 1 (ranked): all 575 PMs that carry a Dwellsy IQ scorecard — clicks
// route to /property-managers/[state]/[city]/[slug]. Star counts (gold +
// silver) surface inline so the user can see the operator's strongest
// markers without leaving the search.
//
// Tier 2 (tracked): the ~1,431 operators we observe with ≥3 listings T12
// who don't have a scorecard yet (below the ≥30 ranking threshold).
// Clicks route to the market landing page with a ?highlight= query so a
// future iteration can scroll-into-view; today the param is forward-
// compat and the page ignores it.
//
// The index lives in src/data/search_index.json (built by
// scripts/build-operator-universe.ts) so the client bundle stays under
// 500KB rather than parsing the full 8.3MB scorecard_data.json blob.

import Fuse from "fuse.js";
import type { IFuseOptions } from "fuse.js";
import indexData from "@/data/search_index.json";

export type PMSearchTier = "ranked" | "tracked" | "canonical";

// Result row shape — discriminated on `tier` so the renderer can branch
// without re-narrowing every field.
//   ranked    — single-market operator with a scorecard. Click → scorecard.
//   tracked   — universe operator below ranking threshold. Click → market
//               landing with ?highlight=.
//   canonical — v0.6.4 Patch 1: multi-market operator. Click → operator
//               profile at /operator/<canonicalSlug>. Star counts are
//               aggregated sums across the operator's market-instances.
export type PMSearchResult =
  | {
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
      href: string;
      /** Fuse match score, 0 (perfect) to 1 (no match). Lower is better. */
      score: number;
    }
  | {
      tier: "tracked";
      name: string;
      marketId: string;
      marketCity: string;
      stateCode: string;
      stateSlug: string;
      citySlug: string;
      t12Listings: number;
      /** Top 3 submarkets by listing count (descending). Surfaced on the
       *  market-landing highlight banner when a Tier 2 search result
       *  click routes through ?highlight=<name>. */
      topSubmarkets: Array<{ slug: string; count: number }>;
      href: string;
      score: number;
    }
  | {
      tier: "canonical";
      name: string;
      canonicalSlug: string;
      marketCount: number;
      /** Per-market footprint for the "Operates in Phoenix, Memphis, …"
       *  subtitle on the search result row. */
      markets: Array<{ marketCity: string; stateCode: string }>;
      /** Aggregated star counts across the operator's market-instances. */
      goldCount: number;
      silverCount: number;
      /** Pre-computed sums from the seed's canonicalOperators map. */
      totalT12Listings: number;
      totalT24T12Listings: number;
      totalUrusT12: number;
      href: string;
      score: number;
    };

interface IndexFile {
  ranked: Array<{
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
  }>;
  tracked: Array<{
    tier: "tracked";
    name: string;
    marketId: string;
    marketCity: string;
    stateCode: string;
    stateSlug: string;
    citySlug: string;
    t12Listings: number;
    topSubmarkets: Array<{ slug: string; count: number }>;
  }>;
  // v0.6.4 Patch 1 — multi-market canonical operators. Optional for
  // back-compat with pre-v0.6.4 index files; runs through the same
  // Fuse corpus as the other tiers, routing to /operator/<slug>.
  canonical?: Array<{
    tier: "canonical";
    name: string;
    canonicalSlug: string;
    marketCount: number;
    markets: Array<{ marketCity: string; stateCode: string }>;
    goldCount: number;
    silverCount: number;
    totalT12Listings: number;
    totalT24T12Listings: number;
    totalUrusT12: number;
  }>;
}

const data = indexData as IndexFile;

// Combined corpus — all three tiers in one Fuse instance so a single
// query produces a unified ranked list, then we partition by tier for
// the grouped display. Each entry carries a precomputed href to keep
// the renderer dumb.
type IndexedEntry = (PMSearchResult extends infer R
  ? Omit<R extends { score: number } ? R : never, "score">
  : never);

function buildHref(
  entry:
    | { tier: "ranked"; stateSlug: string; citySlug: string; slug: string }
    | { tier: "tracked"; stateSlug: string; citySlug: string; name: string }
    | { tier: "canonical"; canonicalSlug: string }
): string {
  if (entry.tier === "ranked") {
    return `/property-managers/${entry.stateSlug}/${entry.citySlug}/${entry.slug}`;
  }
  if (entry.tier === "canonical") {
    return `/operator/${entry.canonicalSlug}`;
  }
  // Tier 2 → market landing with forward-compat highlight param.
  return `/property-managers/${entry.stateSlug}/${entry.citySlug}?highlight=${encodeURIComponent(entry.name)}`;
}

// Build the indexed corpus once at module load. All three tiers slot
// into one array; the tier field discriminates downstream. Module-level
// singleton so subsequent imports share the same Fuse instance —
// important on client where SearchInput + SearchModal both mount and
// would otherwise reindex the corpus twice.
const corpus: IndexedEntry[] = [];
for (const e of data.ranked) {
  corpus.push({ ...e, href: buildHref(e) } as IndexedEntry);
}
for (const e of data.canonical ?? []) {
  corpus.push({ ...e, href: buildHref(e) } as IndexedEntry);
}
for (const e of data.tracked) {
  corpus.push({ ...e, href: buildHref(e) } as IndexedEntry);
}

// Fuse configuration — name-weighted, with a wider recall threshold so
// loose fuzzy matches still show up in the fuzzy-suggestions branch.
// The actual "strict vs fuzzy" partition happens in SearchInput /
// SearchModal via STRICT_MATCH_SCORE on the resulting score field.
// Tuning anchors (calibrated against the v0.6.3 corpus):
//   exact match               → score 0.000
//   strong match (substring)  → score 0.019 ("Reedy" → "Reedy & Company")
//   mild typo                 → score ~0.21 ("Invitaton" → "Invitation Homes")
//   coincidental similarity   → score ~0.37+ ("Genstone" → "Cornerstone")
// Strict-match consumers should partition at ≤ 0.30; everything above
// that is a fuzzy candidate. `ignoreLocation` lets Fuse score regardless
// of where in the name the match falls — without it, "Reedy" would
// penalize "Reedy & Company" because the match isn't at character zero.
const FUSE_OPTIONS: IFuseOptions<IndexedEntry> = {
  keys: [{ name: "name", weight: 1.0 }],
  threshold: 0.5,
  distance: 100,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeScore: true,
};

let fuseInstance: Fuse<IndexedEntry> | null = null;
function getFuse(): Fuse<IndexedEntry> {
  if (!fuseInstance) {
    fuseInstance = new Fuse(corpus, FUSE_OPTIONS);
  }
  return fuseInstance;
}

// --- Public API ---

export function getAllSearchEntries(): IndexedEntry[] {
  return corpus;
}

/** Aggregate counts for the not-found-state copy and analytics. */
export function getSearchCounts(): {
  ranked: number;
  tracked: number;
  canonical: number;
  total: number;
} {
  return {
    ranked: data.ranked.length,
    tracked: data.tracked.length,
    canonical: data.canonical?.length ?? 0,
    total: corpus.length,
  };
}

/**
 * Fuzzy-search the corpus. Returns up to `limit` results in Fuse's ranked
 * order (best match first). Empty / too-short queries return an empty
 * array — caller decides whether to show an empty-state hint.
 */
export function searchPMs(query: string, limit = 10): PMSearchResult[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const fuse = getFuse();
  const matches = fuse.search(q, { limit });
  return matches.map((m) => ({
    ...(m.item as IndexedEntry),
    score: m.score ?? 1,
  })) as PMSearchResult[];
}

/**
 * Splits a result list by tier so the renderer can group the dropdown.
 * Stable order preserved within each tier (Fuse's ranking carries
 * through). v0.6.4 Patch 1 adds the canonical bucket; it renders above
 * ranked + tracked so multi-market operators are visually elevated.
 */
export function partitionByTier(results: PMSearchResult[]): {
  canonical: Extract<PMSearchResult, { tier: "canonical" }>[];
  ranked: Extract<PMSearchResult, { tier: "ranked" }>[];
  tracked: Extract<PMSearchResult, { tier: "tracked" }>[];
} {
  const canonical: Extract<PMSearchResult, { tier: "canonical" }>[] = [];
  const ranked: Extract<PMSearchResult, { tier: "ranked" }>[] = [];
  const tracked: Extract<PMSearchResult, { tier: "tracked" }>[] = [];
  for (const r of results) {
    if (r.tier === "canonical") canonical.push(r);
    else if (r.tier === "ranked") ranked.push(r);
    else tracked.push(r);
  }
  return { canonical, ranked, tracked };
}

/**
 * Direct lookup for the market-landing ?highlight= banner. Walks the
 * Tier 2 entries for a single market and returns the first whose name
 * matches case-insensitively. The search link writes the operator's
 * raw name into the query, so an exact (case-folded) match is the
 * expected path; this isn't a fuzzy lookup. Returns null when the
 * operator isn't found — caller renders no banner (silent fail).
 */
export function findTrackedInMarket(
  marketId: string,
  operatorName: string
): IndexFile["tracked"][number] | null {
  const target = operatorName.trim().toLowerCase();
  for (const entry of data.tracked) {
    if (entry.marketId !== marketId) continue;
    if (entry.name.toLowerCase() === target) return entry;
  }
  return null;
}
