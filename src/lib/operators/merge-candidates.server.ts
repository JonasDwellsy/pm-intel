import "server-only";

// v0.23 — server loader for the admin operator-merge tool. Reads the PM
// mirror (minimal columns — no scorecardData blob) + prior decisions, and
// feeds the pure clustering. Listing counts are summed from the per-
// submarket JSON map so we never parse the full scorecard.

import { prisma } from "@/lib/prisma";
import {
  findMergeCandidates,
  type MergeOperator,
  type MergeCluster,
} from "./merge-candidates";

export interface MarketMergeCandidates {
  marketId: string;
  marketName: string;
  clusters: MergeCluster[];
}

function sumSubmarketListings(json: string | null): number {
  if (!json) return 0;
  try {
    const m = JSON.parse(json) as Record<string, unknown>;
    return Object.values(m).reduce<number>(
      (s, v) => s + (typeof v === "number" ? v : 0),
      0
    );
  } catch {
    return 0;
  }
}

export async function loadAllMergeCandidates(): Promise<
  MarketMergeCandidates[]
> {
  const [pms, markets, decisions] = await Promise.all([
    prisma.pM.findMany({
      select: {
        slug: true,
        name: true,
        marketId: true,
        quadrant7Cell: true,
        claimed: true,
        canonicalOperatorId: true,
        t12ListingsBySubmarket: true,
      },
    }),
    prisma.market.findMany({ select: { id: true, fullName: true } }),
    prisma.operatorMergeDecision.findMany({
      select: { marketId: true, clusterKey: true },
    }),
  ]);

  const marketName = new Map(markets.map((m) => [m.id, m.fullName]));
  const decidedByMarket = new Map<string, Set<string>>();
  for (const d of decisions) {
    const set = decidedByMarket.get(d.marketId) ?? new Set<string>();
    set.add(d.clusterKey);
    decidedByMarket.set(d.marketId, set);
  }

  const byMarket = new Map<string, MergeOperator[]>();
  for (const p of pms) {
    const arr = byMarket.get(p.marketId) ?? [];
    arr.push({
      slug: p.slug,
      name: p.name,
      quadrant7Cell: p.quadrant7Cell,
      claimed: p.claimed,
      listings: sumSubmarketListings(p.t12ListingsBySubmarket),
      canonicalOperatorId: p.canonicalOperatorId,
    });
    byMarket.set(p.marketId, arr);
  }

  const out: MarketMergeCandidates[] = [];
  for (const [marketId, ops] of byMarket) {
    const clusters = findMergeCandidates(
      ops,
      decidedByMarket.get(marketId) ?? new Set()
    );
    if (clusters.length > 0) {
      out.push({
        marketId,
        marketName: marketName.get(marketId) ?? marketId,
        clusters,
      });
    }
  }
  // Markets with the most candidates first.
  return out.sort((a, b) => b.clusters.length - a.clusters.length);
}
