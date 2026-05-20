// Pure aggregation layer for auto-generated weekly market briefs.
// buildMarketBriefData reads the existing v0.6.4 seed (Market rows +
// PM scorecards + canonical operators) and produces the structured
// shape the LLM prose generator consumes.
//
// No LLM calls here — this module is deterministic + testable. The
// prose generator in market-brief-prose.ts owns the Claude side and
// the cache.

import { prisma } from "@/lib/prisma";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import type { ScorecardData } from "@/lib/types";

// ─── shapes ─────────────────────────────────────────────────────────

export interface MarketBriefData {
  market: MarketHeader;
  shareGainers: ShareMovement[];
  shareLosers: ShareMovement[];
  newEntrants: NewEntrant[];
  quadrantBreakdown: QuadrantBreakdownEntry[];
  crossMarketOperators: CrossMarketOperatorEntry[];
}

export interface MarketHeader {
  marketSlug: string;
  marketName: string;
  city: string;
  state: string;
  stateName: string;
  marketUrl: string;
  briefUrl: string;
  dataAsOf: string; // ISO date string
  methodologyVersion: string;
  activeOperatorCount: number | null;
  eligibleCount: number;
  totalOperatorCount: number;
  medianDomT12: number;
  /** Decimal — 0.0023 means +0.23%. */
  marketRentGrowthT12: number | null;
  nationalRentGrowthT12: number | null;
  /** Pre-computed in pp (percentage points) — e.g. 1.5 means market
   *  outperformed national by 1.5pp. */
  deltaVsNationalPp: number | null;
  /** Continuing-cohort size used for share trajectory rollups. Useful
   *  context for the prose generator when describing thin markets. */
  continuingCohortSize: number;
}

export interface ShareMovement {
  name: string;
  pmSlug: string;
  scorecardUrl: string;
  quadrant7Cell: string | null;
  t12Listings: number;
  t24t12Listings: number;
  /** Share trajectory YoY in percentage points (e.g. +3.2 = +3.2pp share
   *  of market vs the prior window). */
  shareYoYPp: number;
}

export interface NewEntrant {
  name: string;
  pmSlug: string;
  scorecardUrl: string;
  quadrant7Cell: string | null;
  t12Listings: number;
}

export interface QuadrantBreakdownEntry {
  cell: string;
  count: number;
  medianDomT12: number | null;
  medianRentVsComp: number | null;
  /** Share of total active operators (0-1) — adds context the prose
   *  generator uses to describe market composition. */
  share: number;
}

export interface CrossMarketOperatorEntry {
  canonicalSlug: string;
  canonicalName: string;
  marketCount: number;
  crossMarketProfileUrl: string;
  /** Display names of the OTHER markets this operator is in (excluding
   *  the focal market) — so prose can say "also operates in Phoenix,
   *  Jacksonville". */
  otherMarketNames: string[];
}

// ─── implementation ─────────────────────────────────────────────────

/** Mirrors share-trajectory.ts COHORT_THRESHOLD — operators need at
 *  least this many listings in both T12 windows to be in the continuing
 *  cohort that drives share-of-market math. */
const COHORT_THRESHOLD = 30;

/** Top-N cutoff for gainers/losers/entrants in the brief. The prose
 *  generator can mention fewer if the data is thin, but 5 each is the
 *  ceiling. */
const TOP_N = 5;

/** Minimum T12 listings for a new entrant to count as "notable" — below
 *  this we're probably looking at a small operator that just barely
 *  shows up in the data and doesn't merit naming in a brief. */
const NEW_ENTRANT_MIN_T12 = 20;

export async function buildMarketBriefData(
  marketSlug: string
): Promise<MarketBriefData | null> {
  const market = await prisma.market.findUnique({ where: { id: marketSlug } });
  if (!market) return null;

  // Pull every PM in the market — we'll filter to ranked when computing
  // shares; tracked-tier (rankOverall null) entries don't carry the
  // share-trajectory anchor fields needed for the math.
  const pms = await prisma.pM.findMany({
    where: { marketId: market.id },
  });

  // Parse scorecards once into a {pm row, scorecard} pair to avoid
  // re-parsing in each pass below.
  const parsed = pms.map((row) => ({
    row,
    sc: JSON.parse(row.scorecardData) as ScorecardData,
  }));

  // ── share movement: build continuing cohort, compute per-op YoY ──

  type PoolEntry = {
    pmSlug: string;
    name: string;
    quadrant7Cell: string | null;
    t12: number | null;
    t24: number | null;
    scorecardUrl: string;
  };
  const pool: PoolEntry[] = parsed
    .filter(({ row }) => row.rankOverall !== null)
    .map(({ row, sc }) => ({
      pmSlug: row.slug,
      name: sc.pm.name,
      quadrant7Cell: row.quadrant7Cell ?? null,
      t12: sc.t12ListingsCount ?? null,
      t24: sc.t24t12ListingsCount ?? null,
      scorecardUrl: `/property-managers/${stateCodeToSlug(market.state)}/${citySlug(market.city)}/${row.slug}`,
    }));

  const continuing = pool.filter(
    (p) =>
      typeof p.t12 === "number" &&
      p.t12 >= COHORT_THRESHOLD &&
      typeof p.t24 === "number" &&
      p.t24 >= COHORT_THRESHOLD
  );
  const totalT12 = continuing.reduce((acc, p) => acc + (p.t12 ?? 0), 0);
  const totalT24 = continuing.reduce((acc, p) => acc + (p.t24 ?? 0), 0);

  const movements: ShareMovement[] = [];
  if (totalT12 > 0 && totalT24 > 0) {
    for (const p of continuing) {
      const t12 = p.t12 as number;
      const t24 = p.t24 as number;
      const shareT12 = t12 / totalT12;
      const shareT24 = t24 / totalT24;
      if (shareT24 <= 0) continue;
      const shareYoY = (shareT12 - shareT24) / shareT24;
      movements.push({
        name: p.name,
        pmSlug: p.pmSlug,
        scorecardUrl: p.scorecardUrl,
        quadrant7Cell: p.quadrant7Cell,
        t12Listings: t12,
        t24t12Listings: t24,
        shareYoYPp: Number((shareYoY * 100).toFixed(2)),
      });
    }
  }

  // Sort desc by signed pp for gainers; reverse for losers. Slice top N.
  const gainersSorted = [...movements].sort(
    (a, b) => b.shareYoYPp - a.shareYoYPp
  );
  const shareGainers = gainersSorted
    .filter((m) => m.shareYoYPp > 0)
    .slice(0, TOP_N);
  const shareLosers = [...gainersSorted]
    .reverse()
    .filter((m) => m.shareYoYPp < 0)
    .slice(0, TOP_N);

  // ── new entrants: t24 null/0 or below threshold, t12 substantial ──

  const newEntrants: NewEntrant[] = pool
    .filter((p) => {
      const t24NotContinuing =
        p.t24 === null || p.t24 === 0 || p.t24 < COHORT_THRESHOLD;
      const t12Substantial =
        typeof p.t12 === "number" && p.t12 >= NEW_ENTRANT_MIN_T12;
      return t24NotContinuing && t12Substantial;
    })
    .sort((a, b) => (b.t12 ?? 0) - (a.t12 ?? 0))
    .slice(0, TOP_N)
    .map((p) => ({
      name: p.name,
      pmSlug: p.pmSlug,
      scorecardUrl: p.scorecardUrl,
      quadrant7Cell: p.quadrant7Cell,
      t12Listings: p.t12 as number,
    }));

  // ── quadrant breakdown ──

  const summary = market.quadrant7CellSummary
    ? (JSON.parse(market.quadrant7CellSummary) as Record<
        string,
        {
          count: number;
          medianDomT12: number | null;
          medianRentVsComp: number | null;
        }
      >)
    : {};
  const totalForShare = Object.values(summary).reduce(
    (acc, s) => acc + s.count,
    0
  );
  const quadrantBreakdown: QuadrantBreakdownEntry[] = Object.entries(summary)
    .map(([cell, stats]) => ({
      cell,
      count: stats.count,
      medianDomT12: stats.medianDomT12,
      medianRentVsComp: stats.medianRentVsComp,
      share: totalForShare > 0 ? stats.count / totalForShare : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── cross-market operators present in this market ──

  // Collect canonicalOperatorIds of PMs in this market that point to a
  // multi-market canonical entity (i.e., canonicalOperatorId !== pm.slug
  // per the v0.6.4 convention). Then look up each one in the
  // CanonicalOperator table to get the marketCount + member markets.
  const multiMarketIds = new Set<string>();
  for (const { row, sc } of parsed) {
    const cid = sc.canonicalOperatorId ?? null;
    if (cid && cid !== row.slug) multiMarketIds.add(cid);
  }
  const canonicalRows = multiMarketIds.size
    ? await prisma.canonicalOperator.findMany({
        where: { canonicalSlug: { in: Array.from(multiMarketIds) } },
      })
    : [];

  // For each canonical, we want the OTHER markets' display names. The
  // marketIds field is a JSON array of market.id values; resolve those
  // back to market.city + state via a single bulk findMany.
  const allOtherMarketIds = new Set<string>();
  for (const co of canonicalRows) {
    const ids = JSON.parse(co.marketIds) as string[];
    for (const id of ids) {
      if (id !== market.id) allOtherMarketIds.add(id);
    }
  }
  const otherMarketRows = allOtherMarketIds.size
    ? await prisma.market.findMany({
        where: { id: { in: Array.from(allOtherMarketIds) } },
        select: { id: true, city: true, state: true },
      })
    : [];
  const otherMarketNameById = new Map(
    otherMarketRows.map((m) => [m.id, `${m.city}, ${m.state}`])
  );

  const crossMarketOperators: CrossMarketOperatorEntry[] = canonicalRows
    .map((co) => {
      const memberIds = JSON.parse(co.marketIds) as string[];
      const otherNames = memberIds
        .filter((id) => id !== market.id)
        .map((id) => otherMarketNameById.get(id) ?? id);
      return {
        canonicalSlug: co.canonicalSlug,
        canonicalName: co.canonicalName,
        marketCount: co.marketCount,
        crossMarketProfileUrl: `/operator/${co.canonicalSlug}`,
        otherMarketNames: otherNames,
      };
    })
    .sort((a, b) => b.marketCount - a.marketCount);

  // ── assemble header ──

  const stateName = stateCodeToSlug(market.state).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const dataAsOf = parsed[0]?.row.dataAsOf?.toISOString().slice(0, 10) ?? "2026-05-19";
  const methodologyVersion = parsed[0]?.row.methodologyVersion ?? "v0.6.4";

  const header: MarketHeader = {
    marketSlug: market.id,
    marketName: market.fullName,
    city: market.city,
    state: market.state,
    stateName,
    marketUrl: `/property-managers/${stateCodeToSlug(market.state)}/${citySlug(market.city)}`,
    briefUrl: `/property-managers/${stateCodeToSlug(market.state)}/${citySlug(market.city)}/brief`,
    dataAsOf,
    methodologyVersion,
    activeOperatorCount: market.activeOperatorCount ?? null,
    eligibleCount: market.operatorCountEligible,
    totalOperatorCount: market.operatorCountTotal,
    medianDomT12: market.medianDomT12,
    marketRentGrowthT12: market.marketRentGrowthT12 ?? null,
    nationalRentGrowthT12: market.nationalRentGrowthT12 ?? null,
    deltaVsNationalPp: market.marketRentGrowthDeltaVsNationalPp ?? null,
    continuingCohortSize: continuing.length,
  };

  return {
    market: header,
    shareGainers,
    shareLosers,
    newEntrants,
    quadrantBreakdown,
    crossMarketOperators,
  };
}

/** Convenience helper for the /briefs index page — lists every covered
 *  market with the minimum metadata needed to render a card. */
export async function listMarketHeaders(): Promise<MarketHeader[]> {
  const markets = await prisma.market.findMany({
    orderBy: { city: "asc" },
  });
  // For each market, derive the slugs + dataAsOf without running the
  // full brief build (the index page just needs the header).
  const seedMeta = await prisma.pM.findFirst({
    select: { methodologyVersion: true, dataAsOf: true },
  });
  const dataAsOf =
    seedMeta?.dataAsOf?.toISOString().slice(0, 10) ?? "2026-05-19";
  const methodologyVersion = seedMeta?.methodologyVersion ?? "v0.6.4";

  return markets.map((m) => ({
    marketSlug: m.id,
    marketName: m.fullName,
    city: m.city,
    state: m.state,
    stateName: stateCodeToSlug(m.state)
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    marketUrl: `/property-managers/${stateCodeToSlug(m.state)}/${citySlug(m.city)}`,
    briefUrl: `/property-managers/${stateCodeToSlug(m.state)}/${citySlug(m.city)}/brief`,
    dataAsOf,
    methodologyVersion,
    activeOperatorCount: m.activeOperatorCount ?? null,
    eligibleCount: m.operatorCountEligible,
    totalOperatorCount: m.operatorCountTotal,
    medianDomT12: m.medianDomT12,
    marketRentGrowthT12: m.marketRentGrowthT12 ?? null,
    nationalRentGrowthT12: m.nationalRentGrowthT12 ?? null,
    deltaVsNationalPp: m.marketRentGrowthDeltaVsNationalPp ?? null,
    continuingCohortSize: 0, // not loaded for the index; set to 0
  }));
}
