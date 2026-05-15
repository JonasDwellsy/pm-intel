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
import type { MarketSummary, PMListItem } from "@/lib/types";

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
}: {
  stateUrlSegment: string;
  cityUrlSegment: string;
  segment: QuadrantSegment | null;
}): Promise<LoadedMarket | null> {
  const stateCode = slugToStateCode(stateUrlSegment);
  if (!stateCode) return null;

  const marketRow = await prisma.market.findFirst({
    where: { state: stateCode },
    include: { pms: { select: PM_SELECT, orderBy: { rankOverall: "asc" } } },
  });
  if (!marketRow) return null;
  if (citySlug(marketRow.city) !== cityUrlSegment) return null;

  const market: MarketSummary = {
    id: marketRow.id,
    city: marketRow.city,
    state: marketRow.state,
    fullName: marketRow.fullName,
    operatorCountEligible: marketRow.operatorCountEligible,
    operatorCountTotal: marketRow.operatorCountTotal,
    medianDomT12: marketRow.medianDomT12,
    quadrantSummary: JSON.parse(marketRow.quadrantSummary),
  };

  const allPms = marketRow.pms.map(toPmListItem);

  const countsBySegment: Partial<Record<QuadrantSegment, number>> = {};
  let hybridCount = 0;
  for (const pm of allPms) {
    if (pm.hybrid) {
      hybridCount += 1;
      countsBySegment.hybrid = (countsBySegment.hybrid ?? 0) + 1;
    }
    const seg = quadrantToSegment(pm.quadrant);
    if (seg) countsBySegment[seg] = (countsBySegment[seg] ?? 0) + 1;
  }

  let filteredPms = allPms;
  if (segment === "hybrid") {
    filteredPms = allPms.filter((p) => p.hybrid);
  } else if (segment !== null) {
    const targetQuadrant = segmentToQuadrant(segment);
    filteredPms = allPms.filter((p) => p.quadrant === targetQuadrant);
  }

  // Per spec: top 10 list on market landing.
  filteredPms = filteredPms.slice(0, 10);

  const methodologyVersion = marketRow.pms[0]?.methodologyVersion ?? "unknown";
  const dataAsOf =
    marketRow.pms[0]?.dataAsOf.toISOString().split("T")[0] ?? "";

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
  };
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
