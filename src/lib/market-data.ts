import { prisma } from "@/lib/prisma";
import {
  citySlug,
  QUADRANT_SEGMENTS,
  quadrantToSegment,
  segmentToQuadrant7Cell,
  slugToStateCode,
  stateCodeToSlug,
  type QuadrantSegment,
} from "@/lib/slugify";
import { toPmListItem } from "@/lib/slugify";
import type { MarketSummary, PMListItem, ScorecardData } from "@/lib/types";
import { parseScorecard } from "@/lib/scorecard/parse";
import {
  deriveQuadrantSummary,
  deriveQuadrant7CellSummary,
} from "@/lib/quadrant-summary";
import { estimatedManagedUnits } from "@/lib/operator-size";
import { getSfrTurnoverMultiplier } from "@/lib/app-settings";

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
  // v0.6.4 Patch 9 — eligible brokers for this market, hidden from the
  // default ranked list and surfaced behind the UI's "Show brokers"
  // toggle. Empty on markets not yet re-exported with company-type data.
  brokerPms: PMListItem[];
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
    // PMs whose topCities array (Layer 5B share-of-portfolio) includes
    // this submarket. Drives the operator-list filter and the per-row
    // share-of-portfolio percentage swap.
    matchedOperatorCount: number;
    // v0.6.3 — broader "any T12 listing here" count from each PM's
    // t12ListingsBySubmarket map. Strictly ≥ matchedOperatorCount because
    // it captures operators with footprint in the submarket even when
    // it's not among their top-7-share entries. Surfaces on the filtered
    // MarketHero "Eligible with <submarket> footprint" tile.
    eligibleWithFootprint: number;
    // v0.6.3 Patch 1 — per-submarket active operator count (≥3 listings
    // T12). Lifted from market.activeOperatorCountBySubmarket[slug]. Null
    // when the submarket is missing from the seed's bucket map; the tile
    // gracefully falls back to a "—" placeholder in that case.
    activeOperatorCount: number | null;
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
  // v0.6.4 Patch 9 — company-type bucket; drives the broker split below.
  operatorType: true,
  // v0.6.3 — Patch 1 per-PM submarket listing map. Backs the filtered-state
  // "Eligible with <submarket> footprint" tile in MarketHero by counting
  // PMs where the map's entry for the submarket slug is > 0. Stored as a
  // JSON string in SQLite; parsed once per page render.
  t12ListingsBySubmarket: true,
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

  // v0.6.3 Patch 4 — list ordering by star count (Methodology_v0.6.3_Patches.md
  // §Patch 4). The prisma row order (rankOverall asc) is the tiebreaker; we
  // re-sort in memory so the visible list leads with operators carrying the
  // most golds, then most silvers, then composite rank as the final break.
  // toArray()-stable .sort preserves DB order for equal keys, so an operator
  // with 0 golds + 0 silvers stays in composite-rank order at the bottom.
  // v0.6.4 Patch 9 — split brokers out of the default operator universe.
  // `allPms` (PM-only) drives every existing path: quadrant summaries, the
  // ranked list, submarket filtering, counts. `brokerPms` is surfaced
  // separately for the UI's hidden-by-default "Show brokers" section, so
  // brokers never enter the PM cohort math or the default list while
  // staying reachable (scorecards + search are unaffected). Markets seeded
  // before the company-type columns existed have operatorType "pm" for
  // every operator, so brokerPms is empty and behavior is unchanged.
  const mappedPms = marketRow.pms
    .map(toPmListItem)
    .sort(comparePmsByStarCount);
  const allPms = mappedPms.filter((p) => p.operatorType !== "broker");
  const brokerPms = mappedPms.filter((p) => p.operatorType === "broker");

  // v0.6.5 — estimated managed units per operator (the size headline). Uses
  // the admin-tunable SFR turnover multiplier; MF/community operators use
  // their declared community units instead. Computed here rather than in
  // toPmListItem because the multiplier is a DB-backed setting. Mutating in
  // place (allPms/brokerPms are filtered views over the same objects) so the
  // cohort summary and the list rows read one consistent value.
  const sfrMultiplier = await getSfrTurnoverMultiplier();
  for (const pm of mappedPms) {
    pm.estManagedUnits = estimatedManagedUnits(
      {
        quadrant7Cell: pm.quadrant7Cell,
        urusT12: pm.totalObservedUnits,
        observedCommunityTotalUnits: pm.observedCommunityTotalUnits ?? null,
      },
      sfrMultiplier
    );
  }

  // v0.6.2: the 4 newer markets (Memphis/Knoxville/Clarksville/Phoenix)
  // emit only the 7-cell quadrant summary at seed time; their 5-cell
  // `quadrantSummary` blob is `{}`. Rather than reading the (sometimes
  // empty) cached blob, derive the 5-cell counts + median DOM in-memory
  // from the PMs themselves. Single source of truth; works for both
  // populated and empty seed cases. v0.6.3 polish adds the 7-cell summary
  // with the same shape (count + median DOM + median rent-vs-comp); the
  // 7-cell variant is what the redesigned QuadrantSummaryCard renders.
  const quadrantSummary = deriveQuadrantSummary(allPms);
  const quadrant7CellSummary = deriveQuadrant7CellSummary(allPms);

  // v0.6.3 — Patch 1 + 3 fields lifted from the seeded Market row. The
  // submarket map arrives as a JSON string; parse defensively in case the
  // column is null on a pre-v0.6.3 reseed.
  const activeOperatorCountBySubmarket =
    marketRow.activeOperatorCountBySubmarket
      ? (JSON.parse(marketRow.activeOperatorCountBySubmarket) as Record<
          string,
          number
        >)
      : undefined;

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
    // v0.6.3 — Patches 1 + 2 + 3. All optional on the type so consumers
    // unchanged from v0.6.2 still compile.
    activeOperatorCount: marketRow.activeOperatorCount ?? null,
    activeOperatorCountBySubmarket,
    marketRentGrowthT12: marketRow.marketRentGrowthT12 ?? null,
    nationalRentGrowthT12: marketRow.nationalRentGrowthT12 ?? null,
    marketRentGrowthDeltaVsNationalPp:
      marketRow.marketRentGrowthDeltaVsNationalPp ?? null,
    eligibilityWindow: marketRow.eligibilityWindow ?? "T12",
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
    // v0.6.3 — broader "any T12 listing in this submarket" count from each
    // PM's t12ListingsBySubmarket map. Walks the prisma rows directly (we
    // already loaded the column via PM_SELECT) and counts PMs with a
    // positive entry for the filter slug.
    let eligibleWithFootprint = 0;
    for (const pmRow of marketRow.pms) {
      if (!pmRow.t12ListingsBySubmarket) continue;
      try {
        const map = JSON.parse(pmRow.t12ListingsBySubmarket) as Record<
          string,
          number
        >;
        if ((map[filterSlug] ?? 0) > 0) eligibleWithFootprint += 1;
      } catch {
        // Defensive — malformed JSON gets skipped silently rather than
        // crashing the page. Logged at seed time, not here.
      }
    }
    // v0.6.3 Patch 1 — submarket-scoped active operator count lifted from
    // the seed's per-market bucket map. Defaults to null when the slug
    // isn't present (the tile renders "—" rather than 0 to distinguish
    // "data missing for this submarket" from "zero active operators").
    const submarketActiveOperatorCount =
      activeOperatorCountBySubmarket?.[filterSlug] ?? null;
    submarketState = {
      slug: filterSlug,
      displayName,
      matchedOperatorCount: submarketMatches.length,
      eligibleWithFootprint,
      activeOperatorCount: submarketActiveOperatorCount,
    };
    universe = submarketMatches;
  }

  // v0.6.3 polish — per-segment counts are now derived from each PM's
  // quadrant7Cell (the v0.6.2 canonical 7-cell label), not the legacy
  // v0.6.1 5-cell quadrant string. The FilterChips render 7 chips (+ All)
  // and need the matching cohort sizes. Hybrid PMs carry quadrant7Cell=
  // "Hybrid" in v0.6.2+, so the single quadrantToSegment lookup naturally
  // routes them to the "hybrid" bucket without a separate increment.
  const countsBySegment: Partial<Record<QuadrantSegment, number>> = {};
  let hybridCount = 0;
  for (const pm of universe) {
    const cellKey = pm.quadrant7Cell ?? pm.quadrant;
    const seg = quadrantToSegment(cellKey);
    if (seg) countsBySegment[seg] = (countsBySegment[seg] ?? 0) + 1;
    if (pm.hybrid) hybridCount += 1;
  }

  let filteredPms = universe;
  if (segment === "hybrid") {
    filteredPms = universe.filter(
      (p) => p.hybrid || (p.quadrant7Cell ?? p.quadrant) === "Hybrid"
    );
  } else if (segment !== null) {
    // Compare against quadrant7Cell because v0.6.3 segments are 7-cell.
    // Defensive fallback to legacy quadrant when quadrant7Cell is null
    // (shouldn't happen in v0.6.2+ data but keeps the path safe).
    const target = segmentToQuadrant7Cell(segment);
    filteredPms = universe.filter(
      (p) => (p.quadrant7Cell ?? p.quadrant) === target
    );
  }

  const rankedPoolSize = filteredPms.length;

  // v0.6.5 — the "All operators" view renders the full ranked pool, matching
  // the segment/submarket drill-downs (which have always rendered their whole
  // cohort). The prior top-10 cap treated the landing list as a teaser, but
  // for a B2B intelligence product the exhaustive, sortable, filterable list
  // is the point — capping it left operators past #10 reachable only by
  // changing the sort, which is not a discovery mechanism. Filters + sort
  // narrow the list when the reader wants a subset.

  const methodologyVersion = marketRow.pms[0]?.methodologyVersion ?? "unknown";
  const dataAsOf =
    marketRow.pms[0]?.dataAsOf.toISOString().split("T")[0] ?? "";

  // Map data is denormalized into every PM's scorecardData blob; grab from the
  // first available PM. (Backdrop points are identical across PMs in the same
  // market, so this is cheap and avoids a separate query.)
  const sampleScorecard = marketRow.pms[0]
    ? (parseScorecard(marketRow.pms[0]))
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
    brokerPms,
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

// v0.6.3 Patch 4 sort comparator: (-gold, -silver, composite rank asc).
// Pulled out as a named helper because the same ordering applies to the
// universe sort (allPms) and is preserved through Array.filter into the
// segment / submarket subviews.
function comparePmsByStarCount(a: PMListItem, b: PMListItem): number {
  const aGold = a.goldCount ?? 0;
  const bGold = b.goldCount ?? 0;
  if (aGold !== bGold) return bGold - aGold;
  const aSilver = a.silverCount ?? 0;
  const bSilver = b.silverCount ?? 0;
  if (aSilver !== bSilver) return bSilver - aSilver;
  // Composite rank tiebreaker — nulls sort last so unranked PMs (none in
  // the v0.6.3 corpus, but defensive) cluster at the bottom of the equal
  // star-count bucket.
  const aRank = a.rankOverall ?? Number.MAX_SAFE_INTEGER;
  const bRank = b.rankOverall ?? Number.MAX_SAFE_INTEGER;
  return aRank - bRank;
}
