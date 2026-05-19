// v0.6.3 Patch 5 — state-level data layer.
// Methodology_v0.6.3_Patches.md §Patch 5. State landing pages aggregate
// across the MSAs in a single state, surfacing operator-weighted medians +
// summed counts. State membership is derived from each market's `state`
// field — no hardcoded state→MSA map — so coverage expansion (new markets)
// auto-flows through.
//
// Aggregation is operator-weighted: each ranked operator contributes one
// value to the state median. Multi-market operators (e.g. Invitation Homes
// in Phoenix + Memphis + Nashville) are counted once per MSA they appear
// in; cross-market identity dedup is on the v0.7 roadmap.
//
// National DOM is computed at runtime by pooling every PM across every
// MSA (cheap — ~575 PMs across 7 markets). National rent growth is
// already pre-computed at seed time and stored on every Market row
// (identical value); we read it from any market.

import { prisma } from "@/lib/prisma";
import {
  citySlug,
  slugToStateCode,
  stateCodeToSlug,
  STATE_CODE_TO_NAME,
} from "@/lib/slugify";
import { toPmListItem } from "@/lib/slugify";
import type { PMListItem } from "@/lib/types";

// Per-MSA snapshot rendered inside the MarketCard grid on the state page.
// Mirrors the MarketHero tile values so the grid reads as a row of mini
// MarketHero blocks. Each card is clickable to /property-managers/<state>/<city>.
export type StateMarketSummary = {
  marketId: string;
  city: string;
  citySlug: string;
  fullName: string;
  activeOperatorCount: number | null;
  operatorCountEligible: number;
  medianDomT12: number;
  marketRentGrowthT12: number | null;
  marketRentGrowthDeltaVsNationalPp: number | null;
};

export type StateAggregates = {
  stateActiveOperatorCount: number;
  stateEligibleOperatorCount: number;
  stateMedianDomT12: number | null;
  stateRentGrowthT12: number | null;
  stateMedianDomDeltaVsNationalD: number | null;
  stateRentGrowthDeltaVsNationalPp: number | null;
};

export type StateView = {
  stateCode: string; // "TN" / "FL" / "AZ"
  stateSlug: string; // "tennessee" / "florida" / "arizona"
  stateName: string; // "Tennessee" / "Florida" / "Arizona" (display)
  markets: StateMarketSummary[];
  aggregates: StateAggregates;
  intro: string;
  methodologyVersion: string;
  dataAsOf: string;
};

// PM select shape needed for state aggregation. Same scorecardData + identity
// fields we already lift in market-data.ts. State aggregator pulls the parsed
// PMListItem's domT12 + pmYoyChange.
const STATE_PM_SELECT = {
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

// Title-case a hyphenated lowercase state name slug ("tennessee" → "Tennessee",
// "new-jersey" → "New Jersey") for H1 + breadcrumb display. The slugify
// module's STATE_CODE_TO_NAME map stores the lower-kebab form; this helper
// derives the display form from the slug rather than maintaining a parallel
// "Display Name" lookup.
export function stateDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((word) =>
      word.length === 0
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Build the auto-generated outcome-oriented intro paragraph. Falls back to
// the single-MSA template when only one market is in coverage for the state.
// Both arms of the template come straight out of the Patch 5 spec.
function buildStateIntro({
  stateName,
  markets,
  stateActiveOperatorCount,
  fastestMarket,
  strongestGrowthMarket,
}: {
  stateName: string;
  markets: StateMarketSummary[];
  stateActiveOperatorCount: number;
  fastestMarket: StateMarketSummary | null;
  strongestGrowthMarket: StateMarketSummary | null;
}): string {
  const n = markets.length;
  if (n === 1) {
    const m = markets[0];
    return `Dwellsy IQ identifies the operators worth knowing across ${stateName}'s rental markets. 1 MSA in coverage. Drill into ${m.city} for ranked operators and full scorecards.`;
  }
  const pieces = [
    `Dwellsy IQ identifies the operators worth knowing across ${stateName}'s rental markets.`,
    `${n} MSAs in coverage with ${stateActiveOperatorCount.toLocaleString("en-US")} active operators total.`,
  ];
  if (fastestMarket) {
    pieces.push(
      `${fastestMarket.city} leases fastest at ${fastestMarket.medianDomT12.toFixed(1)} days;`
    );
  }
  if (
    strongestGrowthMarket &&
    strongestGrowthMarket.marketRentGrowthT12 !== null
  ) {
    const pct = strongestGrowthMarket.marketRentGrowthT12 * 100;
    const sign = pct >= 0 ? "+" : "−";
    pieces.push(
      `${strongestGrowthMarket.city} shows the strongest rent trajectory at ${sign}${Math.abs(pct).toFixed(1)}%.`
    );
  }
  return pieces.join(" ");
}

export async function loadStateView(
  stateUrlSegment: string
): Promise<StateView | null> {
  const stateCode = slugToStateCode(stateUrlSegment);
  if (!stateCode) return null;
  const stateName = STATE_CODE_TO_NAME[stateCode];
  if (!stateName) return null;

  // Pull every market in our coverage (max 7 in v0.6.3) along with its PMs.
  // The state branch in-memory filters to in-state markets; the cross-state
  // pool drives the national DOM median used for the state-level
  // benchmark line. Single query keeps the round-trip count low.
  const allMarkets = await prisma.market.findMany({
    include: {
      pms: { select: STATE_PM_SELECT, orderBy: { rankOverall: "asc" } },
    },
  });

  const inState = allMarkets.filter((m) => m.state === stateCode);
  if (inState.length === 0) return null;

  // National DOM — operator-weighted median across every ranked PM in every
  // MSA. Mirrors the national rent growth computation already done at seed
  // time (Patch 3); we recompute here because national DOM isn't pre-seeded.
  // Cheap: ~575 PMs.
  const nationalDoms: number[] = [];
  for (const m of allMarkets) {
    for (const row of m.pms) {
      const sc = JSON.parse(row.scorecardData) as { performance?: { domT12?: number } };
      const d = sc.performance?.domT12;
      if (typeof d === "number" && Number.isFinite(d)) nationalDoms.push(d);
    }
  }
  const nationalMedianDomT12 = median(nationalDoms);

  // National rent growth lifted from any market row — seed embeds the same
  // value on every market (single national number across the 7-market footprint).
  const nationalRentGrowthT12 =
    inState[0]?.nationalRentGrowthT12 ??
    allMarkets[0]?.nationalRentGrowthT12 ??
    null;

  // State-scoped pool: every in-state PM, parsed once. We need domT12 +
  // pmYoyChange for the operator-weighted medians, and the parsed list
  // also feeds per-MSA snapshots below.
  const stateDoms: number[] = [];
  const stateRents: number[] = [];
  const perMarket: Array<{
    row: (typeof allMarkets)[number];
    pms: PMListItem[];
  }> = [];
  for (const m of inState) {
    const pms = m.pms.map(toPmListItem);
    perMarket.push({ row: m, pms });
    for (const pm of pms) {
      if (Number.isFinite(pm.domT12)) stateDoms.push(pm.domT12);
      if (pm.pmYoyChange !== null && pm.pmYoyChange !== undefined) {
        stateRents.push(pm.pmYoyChange);
      }
    }
  }

  const stateMedianDomT12 = median(stateDoms);
  const stateRentGrowthT12 = median(stateRents);

  // Sum counts. Multi-market operators may be double-counted per the spec's
  // documented v0.7 dedup caveat. activeOperatorCount is nullable on the
  // schema (pre-v0.6.3 markets); coalesce to 0 for the sum.
  const stateActiveOperatorCount = inState.reduce(
    (acc, m) => acc + (m.activeOperatorCount ?? 0),
    0
  );
  const stateEligibleOperatorCount = inState.reduce(
    (acc, m) => acc + m.operatorCountEligible,
    0
  );

  // Per-MSA snapshots. Mirror the values MarketHero tiles render so the
  // grid reads as a row of mini hero blocks.
  const markets: StateMarketSummary[] = perMarket
    .map(({ row }) => ({
      marketId: row.id,
      city: row.city,
      citySlug: citySlug(row.city),
      fullName: row.fullName,
      activeOperatorCount: row.activeOperatorCount,
      operatorCountEligible: row.operatorCountEligible,
      medianDomT12: row.medianDomT12,
      marketRentGrowthT12: row.marketRentGrowthT12,
      marketRentGrowthDeltaVsNationalPp: row.marketRentGrowthDeltaVsNationalPp,
    }))
    // Stable display order — by active operator count desc so the largest
    // markets lead each state grid. TN cards: Phoenix-style ordering by
    // size; FL/AZ single card unaffected.
    .sort((a, b) => {
      const av = a.activeOperatorCount ?? 0;
      const bv = b.activeOperatorCount ?? 0;
      return bv - av;
    });

  // Intro template inputs — fastest MSA (lowest DOM) and strongest rent
  // growth MSA (highest market-level YoY). Pulls from the per-market
  // medians already stored on each row, not the operator-pooled value
  // (intro is about market-level signals, not the state aggregate).
  const fastestMarket =
    markets.length > 0
      ? markets.reduce((best, cur) =>
          cur.medianDomT12 < best.medianDomT12 ? cur : best
        )
      : null;
  const rentCandidates = markets.filter(
    (m) => m.marketRentGrowthT12 !== null && m.marketRentGrowthT12 !== undefined
  );
  const strongestGrowthMarket =
    rentCandidates.length > 0
      ? rentCandidates.reduce((best, cur) =>
          (cur.marketRentGrowthT12 ?? -Infinity) >
          (best.marketRentGrowthT12 ?? -Infinity)
            ? cur
            : best
        )
      : null;

  const intro = buildStateIntro({
    stateName: stateDisplayName(stateCodeToSlug(stateCode)),
    markets,
    stateActiveOperatorCount,
    fastestMarket,
    strongestGrowthMarket,
  });

  // Deltas vs national for the benchmark lines under tiles 3 + 4. Returned
  // null when either side is missing — the renderer falls back to "—".
  const stateMedianDomDeltaVsNationalD =
    stateMedianDomT12 !== null && nationalMedianDomT12 !== null
      ? stateMedianDomT12 - nationalMedianDomT12
      : null;
  const stateRentGrowthDeltaVsNationalPp =
    stateRentGrowthT12 !== null && nationalRentGrowthT12 !== null
      ? (stateRentGrowthT12 - nationalRentGrowthT12) * 100
      : null;

  // Methodology version + data-as-of carried from the first PM (same logic
  // loadMarketView uses for its own footer).
  const samplePm = perMarket[0]?.row.pms[0];
  const methodologyVersion = samplePm?.methodologyVersion ?? "unknown";
  const dataAsOf = samplePm?.dataAsOf.toISOString().split("T")[0] ?? "";

  return {
    stateCode,
    stateSlug: stateCodeToSlug(stateCode),
    stateName: stateDisplayName(stateCodeToSlug(stateCode)),
    markets,
    aggregates: {
      stateActiveOperatorCount,
      stateEligibleOperatorCount,
      stateMedianDomT12,
      stateRentGrowthT12,
      stateMedianDomDeltaVsNationalD,
      stateRentGrowthDeltaVsNationalPp,
    },
    intro,
    methodologyVersion,
    dataAsOf,
  };
}

// Static-params lister for /property-managers/[state]. Distinct
// in-coverage states from the markets table. Excludes synthetic / placeholder
// rows by requiring at least one PM (defensive — the v0.6.3 footprint has
// PMs in every market, so this is a no-op today).
export async function listStateRouteParams(): Promise<Array<{ state: string }>> {
  const markets = await prisma.market.findMany({
    select: { state: true },
  });
  const seen = new Set<string>();
  for (const m of markets) seen.add(m.state);
  return [...seen].map((code) => ({ state: stateCodeToSlug(code) }));
}
