import type { PMListItem, ScorecardData } from "@/lib/types";

// --- State (2-letter code <-> URL slug) ---

const STATE_CODE_TO_NAME: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california",
  CO: "colorado", CT: "connecticut", DE: "delaware", DC: "district-of-columbia",
  FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois",
  IN: "indiana", IA: "iowa", KS: "kansas", KY: "kentucky", LA: "louisiana",
  ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan", MN: "minnesota",
  MS: "mississippi", MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada",
  NH: "new-hampshire", NJ: "new-jersey", NM: "new-mexico", NY: "new-york",
  NC: "north-carolina", ND: "north-dakota", OH: "ohio", OK: "oklahoma", OR: "oregon",
  PA: "pennsylvania", RI: "rhode-island", SC: "south-carolina", SD: "south-dakota",
  TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia",
  WA: "washington", WV: "west-virginia", WI: "wisconsin", WY: "wyoming",
};

const STATE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_CODE_TO_NAME).map(([code, name]) => [name, code])
);

export function stateCodeToSlug(code: string): string {
  return STATE_CODE_TO_NAME[code.toUpperCase()] ?? code.toLowerCase();
}

export function slugToStateCode(slug: string): string | null {
  // Try full name first; fall back to 2-letter slug for backwards compat.
  const code = STATE_NAME_TO_CODE[slug.toLowerCase()];
  if (code) return code;
  const upper = slug.toUpperCase();
  if (STATE_CODE_TO_NAME[upper]) return upper;
  return null;
}

// --- City <-> URL slug ---

export function citySlug(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Submarket (top-cities entries) <-> URL slug ---
//
// Used by the ?submarket= query parameter on market landing pages. Names in
// geographicCoverage.topCities arrive in display form ("Saint Augustine",
// "Mt. Juliet", "Bay City"); the slug normalizes them to a URL-safe lower-
// kebab form. Drops periods first so "St. Petersburg" and "St Petersburg"
// collapse to the same slug, then collapses any remaining non-alphanumeric
// run into a single hyphen. The audit in scripts/audit-top-cities.ts
// confirmed every PM in src/data/scorecard_data.json produces a unique slug
// within its market (no within-market collisions across 192 distinct city
// names; cross-market collisions exist only for two minor cities and are
// harmless because filtering is always scoped to a single market's PM list).
export function submarketSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Quadrant segment <-> DB quadrant string ---
//
// v0.6.3 polish: the FilterChips moved from 5-cell (legacy v0.6.1 4 quadrants
// + Hybrid) to 7-cell (v0.6.2 canonical taxonomy + Hybrid). QUADRANT_SEGMENTS
// is the canonical 7-cell list and is the source of truth for sitemap +
// route resolution + chip rendering. Each slug maps to its canonical
// quadrant7Cell string from src/lib/types.ts Quadrant7CellKey; the
// loadMarketView segment filter compares against pm.quadrant7Cell.

export const QUADRANT_SEGMENTS = [
  "sfr-independent",
  "sfr-institutional",
  "small-mfbtr-independent",
  "small-mfbtr-institutional",
  "large-mfbtr-independent",
  "large-mfbtr-institutional",
  "hybrid",
] as const;

export type QuadrantSegment = (typeof QUADRANT_SEGMENTS)[number];

// Slug → canonical quadrant7Cell string (matches the seed's
// pm.quadrant7Cell values and the QUADRANT7_COLORS labels).
const SEGMENT_TO_QUADRANT7CELL: Record<QuadrantSegment, string> = {
  "sfr-independent": "SFR Independent",
  "sfr-institutional": "SFR Institutional",
  "small-mfbtr-independent": "Small MF/BTR Independent",
  "small-mfbtr-institutional": "Small MF/BTR Institutional",
  "large-mfbtr-independent": "Large MF/BTR Independent",
  "large-mfbtr-institutional": "Large MF/BTR Institutional",
  hybrid: "Hybrid",
};

const SEGMENT_LABELS: Record<QuadrantSegment, string> = {
  "sfr-independent": "SFR · Independent",
  "sfr-institutional": "SFR · Institutional",
  "small-mfbtr-independent": "Small MF/BTR · Independent",
  "small-mfbtr-institutional": "Small MF/BTR · Institutional",
  "large-mfbtr-independent": "Large MF/BTR · Independent",
  "large-mfbtr-institutional": "Large MF/BTR · Institutional",
  hybrid: "Hybrid",
};

export function isQuadrantSegment(s: string): s is QuadrantSegment {
  return (QUADRANT_SEGMENTS as readonly string[]).includes(s);
}

// Returns the canonical quadrant7Cell string (e.g. "Large MF/BTR
// Independent") the segment URL slug refers to. Consumer in loadMarketView
// compares this against pm.quadrant7Cell.
export function segmentToQuadrant7Cell(segment: QuadrantSegment): string {
  return SEGMENT_TO_QUADRANT7CELL[segment];
}

// Back-compat shim. The previous API name was `segmentToQuadrant` and
// returned the v0.6.1 5-cell label. Existing callers — loadMarketView's
// segment filter — now receive the 7-cell label and compare against the
// canonical quadrant7Cell on each PMListItem. Kept as an alias to avoid a
// rename churn cycle through the call sites.
export const segmentToQuadrant = segmentToQuadrant7Cell;

export function segmentLabel(segment: QuadrantSegment): string {
  return SEGMENT_LABELS[segment];
}

// Reverse: a PM's quadrant7Cell string → the segment URL slug.
// Hybrid PMs in v0.6.2+ carry quadrant7Cell="Hybrid"; SFR/MF/BTR PMs
// carry the full 7-cell label. Falls back to defensively matching v0.6.1
// 5-cell labels onto their nearest 7-cell equivalent (Large MF/BTR for any
// "MF/BTR /" string) so any legacy DB rows still resolve.
export function quadrantToSegment(quadrant: string): QuadrantSegment | null {
  for (const seg of QUADRANT_SEGMENTS) {
    if (SEGMENT_TO_QUADRANT7CELL[seg] === quadrant) return seg;
  }
  // Defensive fallback for v0.6.1 5-cell labels.
  const lower = quadrant.toLowerCase();
  if (lower.startsWith("hybrid")) return "hybrid";
  if (lower.includes("mf") || lower.includes("btr")) {
    return lower.includes("institutional")
      ? "large-mfbtr-institutional"
      : "large-mfbtr-independent";
  }
  if (lower.includes("scattered")) {
    return lower.includes("institutional")
      ? "sfr-institutional"
      : "sfr-independent";
  }
  return null;
}

// --- Prisma PM row + parsed scorecard -> spec PMListItem shape ---

type PmRowForList = {
  slug: string;
  name: string;
  quadrant: string;
  hybrid: boolean;
  rankOverall: number | null;
  rankQuadrant: number | null;
  claimed: boolean;
  scorecardData: string;
};

export function toPmListItem(row: PmRowForList): PMListItem {
  const sc = JSON.parse(row.scorecardData) as ScorecardData;
  // Derive primary-city share from the citiesText prefix. The seed data uses
  // two formats: "NN% City …" (single-city operators) or "City NN% · …"
  // (multi-city). Try both, default to null if neither matches.
  const leadingPctMatch = sc.geographicCoverage.citiesText.match(/^(\d{1,3})%\s+/);
  const trailingPctMatch = sc.geographicCoverage.citiesText.match(
    /^[A-Za-z\s.()-]+?\s+(\d{1,3})%/
  );
  const primaryCityShare = leadingPctMatch
    ? Number.parseInt(leadingPctMatch[1], 10)
    : trailingPctMatch
      ? Number.parseInt(trailingPctMatch[1], 10)
      : null;
  // v0.6.3 Patch 4 — gold/silver star counts across this operator's Layer 3
  // per-metric scoring. The five star fields walked here are the ones the
  // scorecard pages render as per-metric stars; composite star is a roll-up
  // and is intentionally excluded so the counts can't be inflated by it.
  // communityVisibility is null for SFR/Hybrid operators (scope gate failed
  // upstream), so its star is treated as absent rather than zero.
  const metricStars: Array<"gold" | "silver" | null | undefined> = [
    sc.performance?.domStar,
    sc.rentPerformance?.star,
    sc.marketing?.star,
    sc.tenancy?.star,
    sc.communityVisibility?.star,
  ];
  const goldCount = metricStars.filter((s) => s === "gold").length;
  const silverCount = metricStars.filter((s) => s === "silver").length;
  return {
    slug: row.slug,
    name: row.name,
    quadrant: row.quadrant,
    quadrant7Cell: sc.pm.quadrant7Cell ?? null,
    hybrid: row.hybrid,
    rankOverall: row.rankOverall,
    rankOverallTotal: sc.rank.overallTotal ?? null,
    rankQuadrant: row.rankQuadrant,
    rankQuadrantTotal: sc.rank.quadrantTotal ?? null,
    domT12: sc.performance.domT12,
    totalObservedUnits: sc.coverage.totalObservedUnits,
    primaryCity: sc.market.name,
    primaryCityShare,
    claimed: row.claimed,
    // v0.6.1 drops the pricing premium / concession-rate fields entirely;
    // surface the rent-performance delta + cohort comparison instead so the
    // market landing operator cards still have a per-operator pricing
    // signal. The seed stores `rentPerformance.delta` as a decimal (e.g.
    // -0.0347 means "3.47pp below cohort"); the rentVsComp field on
    // PMListItem is consumed by fmtSignedPct which expects a percentage
    // value (-3.47, not -0.0347). Multiply by 100 here so the field's
    // semantic ("percent vs comp") matches its representation everywhere
    // it's read.
    rentVsComp:
      sc.rentPerformance?.delta !== undefined && sc.rentPerformance?.delta !== null
        ? sc.rentPerformance.delta * 100
        : null,
    concessionRate: null,
    accentColor: sc.pm.accentColor ?? null,
    coverageMapPoints: sc.geographicCoverage.coverageMapPoints ?? [],
    // v0.6.2 / v1.0 — composite star + cohort name surface on the market
    // landing operator cards alongside the legacy rank.
    compositeStar: sc.rank.compositeStar ?? null,
    compositeCohortName: sc.rank.compositeCohortName ?? null,
    // Submarket index — geographicCoverage.topCities mapped through the same
    // slugifier the scorecard's Layer 5B link uses, so the market landing
    // ?submarket= filter (loadMarketView in market-data.ts) matches by exact
    // slug equality. Empty array when the scorecard has no topCities entries.
    // topCityNames preserves the raw display form (e.g. "Mt. Juliet") so the
    // filter chip can render the correct label from a slug match.
    // topCityPcts carries share-of-portfolio so the PM list row subtitle can
    // swap from "40% Phoenix" to "X% Mesa" when a submarket filter is active.
    // All three arrays are index-aligned per geographicCoverage.topCities[i].
    topCitySlugs: (sc.geographicCoverage.topCities ?? []).map((c) =>
      submarketSlug(c.name)
    ),
    topCityNames: (sc.geographicCoverage.topCities ?? []).map((c) => c.name),
    topCityPcts: (sc.geographicCoverage.topCities ?? []).map((c) => c.pct),
    // v0.6.3 Patch 4 — derived star counts; drive both ★N ☆M chip + sort.
    goldCount,
    silverCount,
  };
}
