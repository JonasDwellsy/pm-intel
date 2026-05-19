import { prisma } from "@/lib/prisma";
import {
  citySlug,
  QUADRANT_SEGMENTS,
  quadrantToSegment,
  segmentToQuadrant,
  slugToStateCode,
  stateCodeToSlug,
  type QuadrantSegment,
} from "@/lib/slugify";
import { toPmListItem } from "@/lib/slugify";
import type { MarketSummary, PMListItem, ScorecardData } from "@/lib/types";

export type MarketMapData = {
  mapCenter?: { lat: number; lon: number };
  mapBounds?: { north: number; south: number; east: number; west: number };
  msaBackdropPoints: Array<{ lat: number; lon: number }>;
};

export type LoadedMarket = {
  market: MarketSummary;
  methodologyVersion: string;
  dataAsOf: string;
  allPms: PMListItem[];
  filteredPms: PMListItem[];
  countsBySegment: Partial<Record<QuadrantSegment, number>>;
  hybridCount: number;
  state: string; // 2-letter
  stateSlug: string;
  citySlug: string;
  mapData: MarketMapData;
  // Submarket filter state — non-null only when ?submarket= produced a match
  // somewhere in the market's PM list. The page renders a filter chip and
  // adjusted operator count when set; the empty state when filteredPms = 0.
  submarket: {
    slug: string;
    displayName: string;
    matchedOperatorCount: number;
  } | null;
  // Pool size for the "Showing X of Y" line. Equals allPms.length when no
  // submarket filter is active; equals submarket.matchedOperatorCount when
  // one is. Drives the count display + the "clear filter" hint.
  rankedPoolSize: number;
};

const PM_SELECT = {
  slug: true,
  name: true,
  quadrant: true,
  hybrid: true,
  rankOverall: true,
  rankQuadrant: true,
  claimed: true,
  scorecardData: true,
  methodologyVersion: true,
  dataAsOf: true,
} as const;

export async function loadMarketView({
  stateUrlSegment,
  cityUrlSegment,
  segment,
  submarketSlug: submarketParam,
}: {
  stateUrlSegment: string;
  cityUrlSegment: string;
  segment: QuadrantSegment | null;
  /** Slug from `?submarket=`. Null/empty means no submarket filter. */
  submarketSlug?: string | null;
}): Promise<LoadedMarket | null> {
  const stateCode = slugToStateCode(stateUrlSegment);
  if (!stateCode) return null;

  // Multi-market routing: there are multiple markets in some states (e.g. TN
  // has both Chattanooga and Nashville). We filter by state first, then pick
  // the row whose city slug matches the URL segment. findFirst-by-state alone
  // would silently route the wrong city — Chattanooga vs Nashville — for any
  // multi-market state.
  const candidates = await prisma.market.findMany({
    where: { state: stateCode },
    include: { pms: { select: PM_SELECT, orderBy: { rankOverall: "asc" } } },
  });
  const marketRow = candidates.find(
    (m) => citySlug(m.city) === cityUrlSegment
  );
  if (!marketRow) return null;

  const allPms = marketRow.pms.map(toPmListItem);

  // v0.6.2: the 4 newer markets (Memphis/Knoxville/Clarksville/Phoenix)
  // emit only the 7-cell quadrant summary at seed time; their 5-cell
  // `quadrantSummary` blob is `{}`. Rather than reading the (sometimes
  // empty) cached blob, derive the 5-cell counts + median DOM in-memory
  // from the PMs themselves. Single source of truth; works for both
  // populated and empty seed cases.
  const quadrantSummary = deriveQuadrantSummary(allPms);
  const quadrant7CellSummary: Record<string, number> = marketRow.quadrant7CellSummary
    ? (JSON.parse(marketRow.quadrant7CellSummary) as Record<string, number>)
    : deriveQuadrant7CellSummary(allPms);

  const market: MarketSummary = {
    id: marketRow.id,
    city: marketRow.city,
    state: marketRow.state,
    fullName: marketRow.fullName,
    operatorCountEligible: marketRow.operatorCountEligible,
    operatorCountTotal: marketRow.operatorCountTotal,
    medianDomT12: marketRow.medianDomT12,
    quadrantSummary,
    quadrant7CellSummary,
  };

  // Submarket filter — applied to the universe BEFORE the segment filter,
  // so that countsBySegment, the FilterChips, the page chrome (H1, subtitle,
  // Market Snapshot, intro paragraph), and the "ranked operators" list all
  // reflect the filtered universe coherently. Without this ordering the
  // operator-type tabs would show MSA-wide counts under a submarket filter,
  // which made the filter feel like a footnote rather than a dominant page
  // state. Display-name lookup walks the matched PMs' raw topCityNames
  // (index-aligned with topCitySlugs in toPmListItem) to recover the
  // human-readable label for the chip ("Hendersonville" not "hendersonville").
  let submarketState: LoadedMarket["submarket"] = null;
  let universe = allPms;
  if (submarketParam) {
    const filterSlug = submarketParam;
    const submarketMatches = allPms.filter((p) =>
      (p.topCitySlugs ?? []).includes(filterSlug)
    );
    let displayName = deriveSubmarketDisplayName(submarketMatches, filterSlug);
    if (!displayName) {
      displayName = filterSlug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
    submarketState = {
      slug: filterSlug,
      displayName,
      matchedOperatorCount: submarketMatches.length,
    };
    universe = submarketMatches;
  }

  // Per-segment counts are derived from the submarket-aware universe so the
  // FilterChips display the right cohort sizes ("Multifamily Institutional 6"
  // vs the MSA-wide "Multifamily Institutional 26" when no filter is active).
  //
  // Hybrid PMs in v0.6.2 always carry quadrant === "Hybrid", so the segment
  // branch below already covers them. The explicit pm.hybrid guard layered
  // an extra increment on top, double-counting hybrids (20 vs 10 in Phoenix)
  // and inflating the "All operators" chip total. The if-not-hybrid-segment
  // fallback preserves the defensive intent for any legacy row where the
  // hybrid flag is true but the quadrant isn't "Hybrid".
  const countsBySegment: Partial<Record<QuadrantSegment, number>> = {};
  let hybridCount = 0;
  for (const pm of universe) {
    const seg = quadrantToSegment(pm.quadrant);
    if (seg) countsBySegment[seg] = (countsBySegment[seg] ?? 0) + 1;
    if (pm.hybrid) {
      hybridCount += 1;
      if (seg !== "hybrid") {
        countsBySegment.hybrid = (countsBySegment.hybrid ?? 0) + 1;
      }
    }
  }

  let filteredPms = universe;
  if (segment === "hybrid") {
    filteredPms = universe.filter((p) => p.hybrid);
  } else if (segment !== null) {
    const targetQuadrant = segmentToQuadrant(segment);
    filteredPms = universe.filter((p) => p.quadrant === targetQuadrant);
  }

  // Pool size precedes the slice-to-10 so the "Showing X of Y" line reflects
  // the full filtered cohort, not just the displayed page.
  const rankedPoolSize = filteredPms.length;

  // Per spec: top 10 list on market landing.
  filteredPms = filteredPms.slice(0, 10);

  const methodologyVersion = marketRow.pms[0]?.methodologyVersion ?? "unknown";
  const dataAsOf =
    marketRow.pms[0]?.dataAsOf.toISOString().split("T")[0] ?? "";

  // Map data is denormalized into every PM's scorecardData blob; grab from the
  // first available PM. (Backdrop points are identical across PMs in the same
  // market, so this is cheap and avoids a separate query.)
  const sampleScorecard = marketRow.pms[0]
    ? (JSON.parse(marketRow.pms[0].scorecardData) as ScorecardData)
    : null;
  const mapData: MarketMapData = {
    mapCenter: sampleScorecard?.geographicCoverage.mapCenter,
    mapBounds: sampleScorecard?.geographicCoverage.mapBounds,
    msaBackdropPoints:
      sampleScorecard?.geographicCoverage.msaBackdropPoints ?? [],
  };

  return {
    market,
    methodologyVersion,
    dataAsOf,
    allPms,
    filteredPms,
    countsBySegment,
    hybridCount,
    state: stateCode,
    stateSlug: stateUrlSegment,
    citySlug: cityUrlSegment,
    mapData,
    submarket: submarketState,
    rankedPoolSize,
  };
}

// Recover the human-readable display label for a submarket slug by walking
// matched PMs' raw topCityNames arrays and returning the first name whose
// slug matches. Returns null when no PM matches (caller falls back to a
// title-cased slug for the empty-state path). Index alignment between
// topCitySlugs and topCityNames is guaranteed by toPmListItem above.
function deriveSubmarketDisplayName(
  matchedPms: PMListItem[],
  filterSlug: string
): string | null {
  for (const pm of matchedPms) {
    const slugs = pm.topCitySlugs ?? [];
    const names = pm.topCityNames ?? [];
    const idx = slugs.indexOf(filterSlug);
    if (idx >= 0 && names[idx]) return names[idx];
  }
  return null;
}

export async function listMarketRouteParams() {
  const markets = await prisma.market.findMany({
    select: { state: true, city: true },
  });
  return markets.map((m) => ({
    state: stateCodeToSlug(m.state),
    city: citySlug(m.city),
  }));
}

export async function listSegmentRouteParams() {
  const base = await listMarketRouteParams();
  return base.flatMap((p) =>
    QUADRANT_SEGMENTS.map((segment) => ({ ...p, segment }))
  );
}

// --- v0.6.2 quadrant-summary derivation ---
//
// The 4 newer markets (Memphis/Knoxville/Clarksville/Phoenix) skipped the
// legacy 5-cell `quadrantSummary` block at seed time. We derive both 5-cell
// and 7-cell summaries from the parsed PM list at render time so the market
// landing always has something to render. Single source of truth across
// the 7-market footprint.

function deriveQuadrantSummary(
  pms: PMListItem[]
): Record<string, { count: number; medianDomT12: number | null }> {
  const buckets: Record<string, number[]> = {};
  for (const pm of pms) {
    const key = pm.quadrant; // normalized at seed: "Scattered / Independent" etc.
    if (!buckets[key]) buckets[key] = [];
    if (Number.isFinite(pm.domT12)) buckets[key].push(pm.domT12);
  }
  const out: Record<string, { count: number; medianDomT12: number | null }> = {};
  for (const [quadrant, doms] of Object.entries(buckets)) {
    out[quadrant] = {
      count: doms.length,
      medianDomT12: doms.length > 0 ? median(doms) : null,
    };
  }
  return out;
}

function deriveQuadrant7CellSummary(pms: PMListItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pm of pms) {
    const key = pm.quadrant7Cell ?? pm.quadrant;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
