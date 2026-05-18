import { prisma } from "@/lib/prisma";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";

// Cross-market footprint lookup — returns one entry per market where an
// operator with the given canonical name is observed. Used by the v1.0 Layer 1
// Identity hero to render market footprint pills (Mission Rock Residential
// surfaces in 5 markets; a single-market operator gets one pill).
//
// Match key: exact case-sensitive operator name. The v0.6.2 seed already
// reconciles cross-market operator identity via the national-urus aggregation,
// so name-equality is the canonical join here (rather than slug fuzzy match).
// Two unrelated operators sharing a name in different markets would erroneously
// merge — acceptable risk at current scale; tighten via an operator-identity
// table when the cross-market institutional aggregation evolves.

export type MarketFootprintPill = {
  marketId: string;
  city: string;
  stateCode: string;
  fullName: string;
  /** Public scorecard URL for this operator in that market. */
  href: string;
  /** True when this row is the focal operator (current page). */
  isCurrent: boolean;
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
    },
  });

  return rows
    .map((row) => ({
      marketId: row.marketId,
      city: row.market.city,
      stateCode: row.market.state,
      fullName: row.market.fullName,
      href: `/property-managers/${stateCodeToSlug(row.market.state)}/${citySlug(row.market.city)}/${row.slug}?unlocked=true`,
      isCurrent: row.slug === currentSlug,
    }))
    .sort((a, b) => a.city.localeCompare(b.city));
}
