import { prisma } from "@/lib/prisma";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import type { ScorecardData, StarLevel } from "@/lib/types";

// Cross-market footprint lookup — returns one entry per market where an
// operator with the given canonical name is observed. Used by the v1.0 Layer 1
// Identity hero (pills) and Layer 5 (Cross-Market Presence side-by-side
// comparison). For the multi-market case (e.g., Mission Rock Residential
// in 5 markets) we load each market's scorecardData so the Layer 5 table
// can surface per-market observed units + cohort qualifier with star.
//
// Match key: exact case-sensitive operator name. The v0.6.2 seed already
// reconciles cross-market operator identity via the national-urus aggregation,
// so name-equality is the canonical join here (rather than slug fuzzy match).
// Two unrelated operators sharing a name in different markets would
// erroneously merge — acceptable risk at current scale; tighten via an
// operator-identity table when the cross-market institutional aggregation
// evolves.

export type MarketFootprintPill = {
  marketId: string;
  city: string;
  stateCode: string;
  fullName: string;
  /** Public scorecard URL for this operator in that market. */
  href: string;
  /** True when this row is the focal operator (current page). */
  isCurrent: boolean;
  /** Per-market observed urus T12 — used by Layer 5 Cross-Market Presence. */
  urusT12: number;
  /** Composite star + cohort name from that market's scorecard. Reflects
   *  whichever cohort level was selected at seed time per Patch 3. */
  compositeStar: StarLevel;
  compositeCohortName: string | null;
};

export async function loadMarketFootprint({
  name,
  currentSlug,
}: {
  name: string;
  currentSlug: string;
}): Promise<MarketFootprintPill[]> {
  if (!name) return [];

  const rows = await prisma.pM.findMany({
    where: { name },
    select: {
      slug: true,
      marketId: true,
      market: { select: { city: true, state: true, fullName: true } },
      scorecardData: true,
    },
  });

  return rows
    .map((row) => {
      // Parse the per-market scorecard for urusT12 + composite star. We're
      // already paying the JSON.parse cost for the focal scorecard upstream;
      // doing it for cross-market rows adds at most ~5 parses (Mission Rock).
      const sc = JSON.parse(row.scorecardData) as ScorecardData;
      return {
        marketId: row.marketId,
        city: row.market.city,
        stateCode: row.market.state,
        fullName: row.market.fullName,
        href: `/property-managers/${stateCodeToSlug(row.market.state)}/${citySlug(row.market.city)}/${row.slug}?unlocked=true`,
        isCurrent: row.slug === currentSlug,
        urusT12: sc.coverage.urusT12 ?? 0,
        compositeStar: (sc.rank.compositeStar ?? null) as StarLevel,
        compositeCohortName: sc.rank.compositeCohortName ?? null,
      };
    })
    .sort((a, b) => a.city.localeCompare(b.city));
}
