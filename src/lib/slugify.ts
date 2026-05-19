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

export const QUADRANT_SEGMENTS = [
  "multifamily-institutional",
  "multifamily-independent",
  "scattered-institutional",
  "scattered-independent",
  "hybrid",
] as const;

export type QuadrantSegment = (typeof QUADRANT_SEGMENTS)[number];

const SEGMENT_TO_QUADRANT: Record<QuadrantSegment, string | null> = {
  "multifamily-institutional": "MF/BTR / Institutional",
  "multifamily-independent": "MF/BTR / Independent",
  "scattered-institutional": "Scattered / Institutional",
  "scattered-independent": "Scattered / Independent",
  // Hybrid is its own quadrant value in v0.6.1 (not a boolean flag). The
  // route filter still uses pm.hybrid OR pm.quadrant === "Hybrid".
  hybrid: "Hybrid",
};

const SEGMENT_LABELS: Record<QuadrantSegment, string> = {
  "multifamily-institutional": "Multifamily · Institutional",
  "multifamily-independent": "Multifamily · Independent",
  "scattered-institutional": "Scattered · Institutional",
  "scattered-independent": "Scattered · Independent",
  hybrid: "Hybrid operators",
};

export function isQuadrantSegment(s: string): s is QuadrantSegment {
  return (QUADRANT_SEGMENTS as readonly string[]).includes(s);
}

export function segmentToQuadrant(segment: QuadrantSegment): string | null {
  return SEGMENT_TO_QUADRANT[segment];
}

export function segmentLabel(segment: QuadrantSegment): string {
  return SEGMENT_LABELS[segment];
}

// Reverse: a PM's quadrant string -> the segment URL slug.
export function quadrantToSegment(quadrant: string): QuadrantSegment | null {
  for (const seg of QUADRANT_SEGMENTS) {
    if (SEGMENT_TO_QUADRANT[seg] === quadrant) return seg;
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
    topCitySlugs: (sc.geographicCoverage.topCities ?? []).map((c) =>
      submarketSlug(c.name)
    ),
    topCityNames: (sc.geographicCoverage.topCities ?? []).map((c) => c.name),
  };
}
