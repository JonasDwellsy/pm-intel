// National / cross-market brief — aggregation layer (Briefs V2 Phase 2).
//
// A "state of the union" across all covered markets. Deterministic + reads the
// existing seed (Market rows + CanonicalOperator + OperatorSnapshot); the prose
// generator (national-brief-prose.ts) owns the Claude side + cache. Cost-safe:
// aggregates the ~34 Market rows + a few targeted cross-market queries — it does
// NOT rebuild every per-market brief.
//
// The "since last period" national roll-up reuses buildMarketChangeSummary with
// each operator paired to its OWN latest/prior snapshot (markets carry slightly
// different dataAsOf, so pairing is per-operator, not a single global window).

import { prisma } from "@/lib/prisma";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import { titleCaseSlug } from "@/lib/format";
import { toSnapshotRow, type SnapshotRow } from "@/lib/watch-list/snapshot";
import {
  buildMarketChangeSummary,
  type MarketChangeSummary,
  type OperatorMeta,
} from "@/lib/market-brief-changes";

const TOP_N = 5;
export const NATIONAL_SLUG = "__national__";

export interface MarketRef {
  marketName: string;
  briefUrl: string;
  value: number; // rent-growth decimal or concession fraction, per list
}
export interface LargeOperator {
  name: string;
  canonicalSlug: string;
  marketCount: number;
  estimatedUnits: number | null;
}
export interface QuadrantMixEntry {
  cell: string;
  count: number;
  sharePct: number;
}

export interface NationalBriefData {
  methodologyVersion: string;
  dataAsOf: string; // ISO date (latest across markets)
  marketCount: number;
  nationalRentGrowthT12: number | null; // decimal
  hotMarkets: MarketRef[];
  coldMarkets: MarketRef[];
  topConcessionMarkets: MarketRef[];
  quadrantMix: QuadrantMixEntry[];
  largestOperators: LargeOperator[];
  sinceLastPeriod: MarketChangeSummary | null;
}

function briefUrlFor(state: string, city: string): string {
  return `/property-managers/${stateCodeToSlug(state)}/${citySlug(city)}/brief`;
}

/** Aggregate the national change roll-up: each operator's latest vs its own
 *  prior snapshot, then the market-level summary primitive over all of them. */
async function loadNationalChangeSummary(
  marketById: Map<string, { state: string; city: string }>,
): Promise<MarketChangeSummary | null> {
  const snaps = await prisma.operatorSnapshot.findMany({
    orderBy: [{ pmSlug: "asc" }, { snapshotDate: "desc" }],
  });
  if (snaps.length === 0) return null;

  const currentBySlug = new Map<string, SnapshotRow>();
  const priorBySlug = new Map<string, SnapshotRow>();
  const seen = new Map<string, number>();
  for (const s of snaps) {
    const n = seen.get(s.pmSlug) ?? 0;
    if (n === 0) currentBySlug.set(s.pmSlug, toSnapshotRow(s));
    else if (n === 1) priorBySlug.set(s.pmSlug, toSnapshotRow(s));
    seen.set(s.pmSlug, n + 1);
  }
  // Only operators with both a latest and a prior can contribute a change.
  const pairedSlugs = [...currentBySlug.keys()].filter((slug) => priorBySlug.has(slug));
  if (pairedSlugs.length === 0) return null;

  const pms = await prisma.pM.findMany({
    where: { slug: { in: pairedSlugs } },
    select: { slug: true, name: true, marketId: true },
  });
  const meta = new Map<string, OperatorMeta>();
  for (const p of pms) {
    const m = marketById.get(p.marketId);
    meta.set(p.slug, {
      name: p.name,
      scorecardUrl: m
        ? `/property-managers/${stateCodeToSlug(m.state)}/${citySlug(m.city)}/${p.slug}`
        : `#${p.slug}`,
    });
  }

  const current = pairedSlugs.map((s) => currentBySlug.get(s)!);
  const prior = pairedSlugs.map((s) => priorBySlug.get(s)!);
  return buildMarketChangeSummary(prior, current, meta);
}

export async function buildNationalBriefData(): Promise<NationalBriefData | null> {
  const markets = await prisma.market.findMany({ orderBy: { city: "asc" } });
  if (markets.length === 0) return null;

  const seedMeta = await prisma.pM.findFirst({
    select: { methodologyVersion: true, dataAsOf: true },
  });
  const methodologyVersion = seedMeta?.methodologyVersion ?? "v0.6.4";
  // dataAsOf is the global seed data-window (same source the per-market briefs
  // use); Market rows don't carry it.
  const dataAsOf = seedMeta?.dataAsOf?.toISOString().slice(0, 10) ?? "2026-07-06";

  const marketById = new Map(markets.map((m) => [m.id, { state: m.state, city: m.city }]));
  const ref = (m: (typeof markets)[number], value: number): MarketRef => ({
    marketName: m.fullName,
    briefUrl: briefUrlFor(m.state, m.city),
    value,
  });

  // Rent standouts — markets with a real rent-growth reading, hottest/coldest.
  const withRent = markets.filter((m) => typeof m.marketRentGrowthT12 === "number");
  const byRentDesc = [...withRent].sort(
    (a, b) => (b.marketRentGrowthT12 ?? 0) - (a.marketRentGrowthT12 ?? 0),
  );
  const hotMarkets = byRentDesc.slice(0, TOP_N).map((m) => ref(m, m.marketRentGrowthT12 as number));
  const coldMarkets = byRentDesc
    .slice(-TOP_N)
    .reverse()
    .map((m) => ref(m, m.marketRentGrowthT12 as number));

  // Concession prevalence — share of the eligible cohort offering concessions.
  const topConcessionMarkets = markets
    .filter((m) => m.operatorCountEligible > 0)
    .map((m) => ref(m, m.operatorsWithConcessions / m.operatorCountEligible))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N);

  // National 7-cell mix — sum each market's quadrant summary counts.
  const cellCounts = new Map<string, number>();
  for (const m of markets) {
    if (!m.quadrant7CellSummary) continue;
    try {
      const summary = JSON.parse(m.quadrant7CellSummary) as Record<
        string,
        { count?: number } | number
      >;
      for (const [cell, v] of Object.entries(summary)) {
        const count = typeof v === "number" ? v : (v?.count ?? 0);
        if (count > 0) cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + count);
      }
    } catch {
      // skip malformed summary
    }
  }
  const totalCells = [...cellCounts.values()].reduce((a, b) => a + b, 0) || 1;
  const quadrantMix: QuadrantMixEntry[] = [...cellCounts.entries()]
    .map(([cell, count]) => ({ cell, count, sharePct: Math.round((count / totalCells) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count);

  // Largest multi-market operators — by estimated units (falls back to observed
  // urus), among canonicals spanning 2+ markets.
  const canonicals = await prisma.canonicalOperator.findMany({
    where: { marketCount: { gte: 2 } },
  });
  const largestOperators: LargeOperator[] = canonicals
    .map((c) => {
      let estimatedUnits: number | null = null;
      try {
        const stats = JSON.parse(c.aggregateStats) as {
          estimatedUnits?: number;
          portfolioEstimate?: { point?: number };
          totalUrusT12?: number;
        };
        estimatedUnits =
          stats.estimatedUnits ??
          stats.portfolioEstimate?.point ??
          stats.totalUrusT12 ??
          null;
      } catch {
        estimatedUnits = null;
      }
      return {
        name: c.canonicalName,
        canonicalSlug: c.canonicalSlug,
        marketCount: c.marketCount,
        estimatedUnits,
      };
    })
    .sort((a, b) => (b.estimatedUnits ?? 0) - (a.estimatedUnits ?? 0) || b.marketCount - a.marketCount)
    .slice(0, TOP_N);

  const sinceLastPeriod = await loadNationalChangeSummary(marketById);

  return {
    methodologyVersion,
    dataAsOf,
    marketCount: markets.length,
    nationalRentGrowthT12: markets.find((m) => m.nationalRentGrowthT12 != null)?.nationalRentGrowthT12 ?? null,
    hotMarkets,
    coldMarkets,
    topConcessionMarkets,
    quadrantMix,
    largestOperators,
    sinceLastPeriod,
  };
}

/** State-name helper for display (re-exported to keep the page import light). */
export function stateDisplayName(stateCode: string): string {
  return titleCaseSlug(stateCodeToSlug(stateCode));
}
