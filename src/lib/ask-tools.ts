// Tool catalog for the Ask Dwellsy IQ natural-language interface.
//
// Each tool is a server-side function the model can call to query the
// canonical scorecard/market data. Tools deliberately return slim,
// LLM-friendly shapes — not the full ScorecardData interface — because:
//   1. Token economy: scorecards are ~10KB each; the model only needs
//      a handful of fields to answer most questions.
//   2. Stable contracts: if internal types churn, the tool surface stays
//      pinned to what the model expects.
//   3. Safer composition: every tool that names an operator also returns
//      a scorecardUrl so follow-up questions can hand the URL to the
//      visitor without the model fabricating a path.
//
// Output bounds: list-shaped tools cap at 20 results. Anything larger
// would risk truncated model responses and wasted context.

import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import { searchPMs } from "@/lib/pm-search";
import { loadOperatorView } from "@/lib/operator-data";
import type { ScorecardData, StarLevel } from "@/lib/types";

// ─── shared helpers ─────────────────────────────────────────────────

/** Build the canonical scorecard URL given the three slug components.
 *  This mirrors what `/property-managers/[state]/[city]/[slug]/page.tsx`
 *  serves so the model can hand a working link back to the visitor. */
function scorecardHref(stateCode: string, city: string, pmSlug: string): string {
  return `/property-managers/${stateCodeToSlug(stateCode)}/${citySlug(city)}/${pmSlug}`;
}

/** Market landing URL for a market row. */
function marketHref(stateCode: string, city: string): string {
  return `/property-managers/${stateCodeToSlug(stateCode)}/${citySlug(city)}`;
}

/** Format a StarLevel for the model — null/undefined collapses to "none"
 *  so the LLM never sees an ambiguous undefined and tries to interpret
 *  it as "no data". */
function starLabel(s: StarLevel | undefined): "gold" | "silver" | "none" {
  if (s === "gold") return "gold";
  if (s === "silver") return "silver";
  return "none";
}

/** Format a decimal as a signed percentage with 2 decimals — handles the
 *  `marketRentGrowthT12` style values where 0.0023 means +0.23%. */
function pct(value: number | null | undefined, digits = 2): string | null {
  if (value === null || value === undefined) return null;
  const signed = value >= 0 ? `+${(value * 100).toFixed(digits)}%` : `${(value * 100).toFixed(digits)}%`;
  return signed;
}

// ─── tool 1: searchOperators ────────────────────────────────────────

export type SearchOperatorsResult = {
  count: number;
  results: Array<{
    name: string;
    pmSlug: string | null;
    canonicalOperatorId: string | null;
    marketName: string | null;
    tier: "ranked" | "canonical" | "tracked";
    t12ListingsCount: number | null;
    goldStars: number | null;
    silverStars: number | null;
    scorecardUrl: string | null;
    crossMarketProfileUrl: string | null;
  }>;
};

export async function searchOperators(
  query: string,
  limit = 10
): Promise<SearchOperatorsResult> {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("searchOperators: query is required");
  }
  const cap = Math.min(Math.max(1, limit ?? 10), 20);
  const hits = searchPMs(query.trim(), cap);

  return {
    count: hits.length,
    results: hits.map((h) => {
      // Discriminated union in PMSearchResult: tier carries different
      // payload shapes. Each branch derives its own URL.
      if (h.tier === "canonical") {
        return {
          name: h.name,
          pmSlug: null,
          canonicalOperatorId: h.canonicalSlug,
          marketName: null,
          tier: "canonical" as const,
          t12ListingsCount: h.totalT12Listings ?? null,
          goldStars: h.goldCount ?? null,
          silverStars: h.silverCount ?? null,
          scorecardUrl: null,
          crossMarketProfileUrl: `/operators/${h.canonicalSlug}`,
        };
      }
      if (h.tier === "ranked") {
        return {
          name: h.name,
          pmSlug: h.slug,
          // PMSearchResult doesn't carry canonicalOperatorId; resolve via
          // getOperatorScorecard if the model needs to walk to the
          // canonical profile.
          canonicalOperatorId: null,
          marketName: `${h.marketCity}, ${h.stateCode}`,
          tier: "ranked" as const,
          t12ListingsCount: h.t12Listings ?? null,
          goldStars: h.goldCount ?? null,
          silverStars: h.silverCount ?? null,
          scorecardUrl: scorecardHref(h.stateCode, h.marketCity, h.slug),
          crossMarketProfileUrl: null,
        };
      }
      // tracked tier — no scorecard, no stars
      return {
        name: h.name,
        pmSlug: null,
        canonicalOperatorId: null,
        marketName: `${h.marketCity}, ${h.stateCode}`,
        tier: "tracked" as const,
        t12ListingsCount: null,
        goldStars: null,
        silverStars: null,
        scorecardUrl: null,
        crossMarketProfileUrl: null,
      };
    }),
  };
}

// ─── tool 2: listMarkets ────────────────────────────────────────────

export type ListMarketsResult = {
  count: number;
  markets: Array<{
    marketSlug: string;
    marketName: string;
    state: string;
    activeOperatorCount: number | null;
    eligibleCount: number;
    totalOperatorCount: number;
    medianDomT12: number;
    marketRentGrowthT12: string | null;
    nationalRentGrowthT12: string | null;
    marketUrl: string;
  }>;
};

export async function listMarkets(): Promise<ListMarketsResult> {
  const rows = await prisma.market.findMany({
    orderBy: { operatorCountEligible: "desc" },
  });
  return {
    count: rows.length,
    markets: rows.map((m) => ({
      marketSlug: m.id,
      marketName: m.fullName,
      state: m.state,
      activeOperatorCount: m.activeOperatorCount ?? null,
      eligibleCount: m.operatorCountEligible,
      totalOperatorCount: m.operatorCountTotal,
      medianDomT12: m.medianDomT12,
      marketRentGrowthT12: pct(m.marketRentGrowthT12, 2),
      nationalRentGrowthT12: pct(m.nationalRentGrowthT12, 2),
      marketUrl: marketHref(m.state, m.city),
    })),
  };
}

// ─── tool 3: getMarket ──────────────────────────────────────────────

export type GetMarketResult = {
  marketSlug: string;
  marketName: string;
  state: string;
  city: string;
  marketUrl: string;
  activeOperatorCount: number | null;
  eligibleCount: number;
  totalOperatorCount: number;
  medianDomT12: number;
  marketRentGrowthT12: string | null;
  nationalRentGrowthT12: string | null;
  quadrant7CellBreakdown: Array<{
    cell: string;
    count: number;
    medianDomT12: number | null;
    medianRentVsComp: number | null;
  }>;
  topOperators: Array<{
    name: string;
    pmSlug: string;
    rankOverall: number | null;
    goldStars: number;
    silverStars: number;
    quadrant7Cell: string | null;
    t12Listings: number | null;
    scorecardUrl: string;
  }>;
};

export async function getMarket(marketSlug: string): Promise<GetMarketResult> {
  if (typeof marketSlug !== "string" || marketSlug.length === 0) {
    throw new Error("getMarket: marketSlug is required");
  }
  const market = await prisma.market.findUnique({ where: { id: marketSlug } });
  if (!market) {
    throw new Error(
      `getMarket: market "${marketSlug}" not in coverage. Use listMarkets to see covered markets.`
    );
  }

  const summary = market.quadrant7CellSummary
    ? (JSON.parse(market.quadrant7CellSummary) as Record<
        string,
        { count: number; medianDomT12: number | null; medianRentVsComp: number | null }
      >)
    : {};

  const pms = await prisma.pM.findMany({
    where: { marketId: market.id, rankOverall: { not: null } },
    orderBy: [{ rankOverall: "asc" }],
    take: 100,
  });

  // Score PMs by star count (gold desc, silver desc, rank asc) to mirror
  // the market-landing ordering. Parse scorecardData once per row.
  const scored = pms.map((row) => {
    const sc = JSON.parse(row.scorecardData) as ScorecardData;
    const goldStars =
      (sc.performance.domStar === "gold" ? 1 : 0) +
      (sc.rentPerformance?.star === "gold" ? 1 : 0) +
      (sc.marketing.star === "gold" ? 1 : 0) +
      (sc.tenancy.star === "gold" ? 1 : 0) +
      (sc.communityVisibility?.star === "gold" ? 1 : 0);
    const silverStars =
      (sc.performance.domStar === "silver" ? 1 : 0) +
      (sc.rentPerformance?.star === "silver" ? 1 : 0) +
      (sc.marketing.star === "silver" ? 1 : 0) +
      (sc.tenancy.star === "silver" ? 1 : 0) +
      (sc.communityVisibility?.star === "silver" ? 1 : 0);
    return {
      name: row.name,
      pmSlug: row.slug,
      rankOverall: row.rankOverall,
      goldStars,
      silverStars,
      quadrant7Cell: row.quadrant7Cell ?? null,
      t12Listings: sc.coverage.t12Listings,
      scorecardUrl: scorecardHref(market.state, market.city, row.slug),
    };
  });

  scored.sort((a, b) => {
    if (a.goldStars !== b.goldStars) return b.goldStars - a.goldStars;
    if (a.silverStars !== b.silverStars) return b.silverStars - a.silverStars;
    return (a.rankOverall ?? 9999) - (b.rankOverall ?? 9999);
  });

  return {
    marketSlug: market.id,
    marketName: market.fullName,
    state: market.state,
    city: market.city,
    marketUrl: marketHref(market.state, market.city),
    activeOperatorCount: market.activeOperatorCount ?? null,
    eligibleCount: market.operatorCountEligible,
    totalOperatorCount: market.operatorCountTotal,
    medianDomT12: market.medianDomT12,
    marketRentGrowthT12: pct(market.marketRentGrowthT12, 2),
    nationalRentGrowthT12: pct(market.nationalRentGrowthT12, 2),
    quadrant7CellBreakdown: Object.entries(summary).map(([cell, stats]) => ({
      cell,
      count: stats.count,
      medianDomT12: stats.medianDomT12,
      medianRentVsComp: stats.medianRentVsComp,
    })),
    topOperators: scored.slice(0, 10),
  };
}

// ─── tool 4: getOperatorScorecard ───────────────────────────────────

export type GetOperatorScorecardResult = {
  name: string;
  pmSlug: string;
  marketName: string;
  scorecardUrl: string;
  classification: {
    quadrant: string;
    quadrant7Cell: string | null;
    institutional: boolean | undefined;
    rationale: string;
  };
  rank: {
    overall: number;
    overallTotal: number;
    quadrant: number | null;
    quadrantTotal: number;
    compositeStar: "gold" | "silver" | "none";
  };
  coverage: {
    t12Listings: number;
    urusT12: number;
    totalObservedUnits: number;
    citiesObserved: number;
    monthsOnPlatform: number;
    dataTier: string;
  };
  stars: {
    dom: "gold" | "silver" | "none";
    rentPerformance: "gold" | "silver" | "none";
    marketing: "gold" | "silver" | "none";
    tenancy: "gold" | "silver" | "none";
    communityVisibility: "gold" | "silver" | "none";
  };
  metrics: {
    domT12: number;
    domLifetime: number;
    rentPerformanceYoY: string | null;
    rentPerformanceVsCohortPp: number | null;
    marketingCompositeScore: number;
    tenancyMultiEpisodePct: number;
  };
  executiveSummary: string | null;
  distinguishingCharacteristics: string[];
  canonicalOperatorId: string | null;
  crossMarketProfileUrl: string | null;
  // v0.7 — portfolio size estimate carried through so the model can
  // answer "what's the estimated portfolio size of X" without needing
  // a separate tool round-trip. Status discriminates the four cases
  // (estimated / insufficient_data / insufficient_history / no_listings);
  // point/low/high/cohort are populated only when status === "estimated".
  portfolioEstimate: {
    status:
      | "estimated"
      | "insufficient_data"
      | "insufficient_history"
      | "no_listings";
    point: number | null;
    low: number | null;
    high: number | null;
    cohort: string | null;
    cohortN: number | null;
    confidence: "Low" | "Medium" | "High" | null;
    message: string | null;
  } | null;
};

export async function getOperatorScorecard(
  operatorSlug: string,
  marketSlug: string
): Promise<GetOperatorScorecardResult> {
  if (typeof operatorSlug !== "string" || operatorSlug.length === 0) {
    throw new Error("getOperatorScorecard: operatorSlug is required");
  }
  if (typeof marketSlug !== "string" || marketSlug.length === 0) {
    throw new Error("getOperatorScorecard: marketSlug is required");
  }
  const row = await prisma.pM.findUnique({ where: { slug: operatorSlug } });
  if (!row) {
    throw new Error(
      `getOperatorScorecard: operator "${operatorSlug}" not found. Use searchOperators to find their exact slug.`
    );
  }
  if (row.marketId !== marketSlug) {
    throw new Error(
      `getOperatorScorecard: operator "${operatorSlug}" is in market "${row.marketId}", not "${marketSlug}". Try again with the correct marketSlug.`
    );
  }
  const sc = JSON.parse(row.scorecardData) as ScorecardData;
  const market = await prisma.market.findUnique({ where: { id: row.marketId } });
  if (!market) throw new Error(`getOperatorScorecard: market row missing for "${row.marketId}".`);

  // Cross-market profile URL only when canonical id differs from PM slug
  // (the v0.6.4 single-market convention is canonicalOperatorId === pm.slug).
  const isMultiMarket =
    sc.canonicalOperatorId !== undefined &&
    sc.canonicalOperatorId !== null &&
    sc.canonicalOperatorId !== sc.pm.slug;

  return {
    name: sc.pm.name,
    pmSlug: sc.pm.slug,
    marketName: market.fullName,
    scorecardUrl: scorecardHref(market.state, market.city, sc.pm.slug),
    classification: {
      quadrant: sc.pm.quadrant,
      quadrant7Cell: sc.pm.quadrant7Cell ?? null,
      institutional: sc.pm.institutional,
      rationale: sc.classificationRationale,
    },
    rank: {
      overall: sc.rank.overall,
      overallTotal: sc.rank.overallTotal,
      quadrant: sc.rank.quadrant,
      quadrantTotal: sc.rank.quadrantTotal,
      compositeStar: starLabel(sc.rank.compositeStar),
    },
    coverage: {
      t12Listings: sc.coverage.t12Listings,
      urusT12: sc.coverage.urusT12,
      totalObservedUnits: sc.coverage.totalObservedUnits,
      citiesObserved: sc.coverage.citiesObserved,
      monthsOnPlatform: sc.coverage.monthsOnPlatform,
      dataTier: sc.coverage.dataTier,
    },
    stars: {
      dom: starLabel(sc.performance.domStar),
      rentPerformance: starLabel(sc.rentPerformance?.star),
      marketing: starLabel(sc.marketing.star),
      tenancy: starLabel(sc.tenancy.star),
      communityVisibility: starLabel(sc.communityVisibility?.star),
    },
    metrics: {
      domT12: sc.performance.domT12,
      domLifetime: sc.performance.domLifetime,
      rentPerformanceYoY: pct(sc.rentPerformance?.pmYoyChange, 2),
      rentPerformanceVsCohortPp:
        sc.rentPerformance?.delta != null
          ? Number((sc.rentPerformance.delta * 100).toFixed(2))
          : null,
      marketingCompositeScore: sc.marketing.compositeScore,
      tenancyMultiEpisodePct: sc.tenancy.multiEpisodePct,
    },
    executiveSummary: sc.generatedText?.executiveSummary ?? null,
    distinguishingCharacteristics:
      sc.generatedText?.distinguishingCharacteristics ?? [],
    canonicalOperatorId: sc.canonicalOperatorId ?? null,
    crossMarketProfileUrl: isMultiMarket
      ? `/operators/${sc.canonicalOperatorId}`
      : null,
    portfolioEstimate: sc.portfolioEstimate
      ? {
          status: sc.portfolioEstimate.status,
          point: sc.portfolioEstimate.point ?? null,
          low: sc.portfolioEstimate.low ?? null,
          high: sc.portfolioEstimate.high ?? null,
          cohort: sc.portfolioEstimate.cohort ?? null,
          cohortN: sc.portfolioEstimate.cohortN ?? null,
          confidence: sc.portfolioEstimate.confidence ?? null,
          message: sc.portfolioEstimate.message ?? null,
        }
      : null,
  };
}

// ─── tool 5: getCanonicalOperator ───────────────────────────────────

export type GetCanonicalOperatorResult = {
  canonicalSlug: string;
  canonicalName: string;
  marketCount: number;
  totalT12Listings: number;
  totalObservedUnits: number;
  modalClassification: string | null;
  crossMarketProfileUrl: string;
  markets: Array<{
    marketName: string;
    marketSlug: string;
    pmSlug: string;
    scorecardUrl: string;
    quadrant7Cell: string | null;
    t12Listings: number;
    goldStars: number;
    silverStars: number;
  }>;
};

export async function getCanonicalOperator(
  canonicalSlug: string
): Promise<GetCanonicalOperatorResult> {
  if (typeof canonicalSlug !== "string" || canonicalSlug.length === 0) {
    throw new Error("getCanonicalOperator: canonicalSlug is required");
  }
  const view = await loadOperatorView(canonicalSlug);
  if (!view) {
    throw new Error(
      `getCanonicalOperator: "${canonicalSlug}" not found or operator is single-market. ` +
        `Single-market operators don't have a cross-market profile; use getOperatorScorecard instead.`
    );
  }

  return {
    canonicalSlug: view.canonicalSlug,
    canonicalName: view.canonicalName,
    marketCount: view.marketCount,
    totalT12Listings: view.aggregateStats.totalT12Listings,
    // OperatorView aggregateStats doesn't carry totalObservedUnits, so
    // sum it from the per-market cards' t12Listings instead — a useful
    // proxy for footprint scale that gives the LLM a single number.
    totalObservedUnits: view.aggregateStats.totalUrusT12,
    modalClassification: view.modalClassification,
    crossMarketProfileUrl: `/operators/${view.canonicalSlug}`,
    markets: view.marketCards.map((c) => ({
      marketName: c.marketFullName,
      marketSlug: c.marketId,
      pmSlug: c.pmSlug,
      scorecardUrl: c.scorecardHref,
      quadrant7Cell: c.quadrant7Cell,
      t12Listings: c.t12Listings,
      goldStars: c.goldCount,
      silverStars: c.silverCount,
    })),
  };
}

// ─── tool 6: filterOperators ────────────────────────────────────────

export type FilterOperatorsInput = {
  marketSlug: string;
  minT12Listings?: number;
  maxT12Listings?: number;
  shareTrajectoryDirection?: "rising" | "falling" | "any";
  shareTrajectoryMinPp?: number;
  quadrant7Cell?: string;
  isInstitutional?: boolean;
  hasGoldStar?: "dom" | "rentPerformance" | "tenancy" | "marketing" | "any";
};

export type FilterOperatorsResult = {
  marketSlug: string;
  marketName: string;
  filtersApplied: FilterOperatorsInput;
  matchCount: number;
  truncated: boolean;
  results: Array<{
    name: string;
    pmSlug: string;
    scorecardUrl: string;
    quadrant7Cell: string | null;
    institutional: boolean | undefined;
    rankOverall: number | null;
    t12Listings: number;
    domT12: number;
    rentPerformanceYoY: string | null;
    shareTrajectoryYoYPp: number | null;
    goldStars: number;
    silverStars: number;
  }>;
};

export async function filterOperators(
  input: FilterOperatorsInput
): Promise<FilterOperatorsResult> {
  if (!input || typeof input.marketSlug !== "string") {
    throw new Error("filterOperators: marketSlug is required");
  }
  const market = await prisma.market.findUnique({ where: { id: input.marketSlug } });
  if (!market) {
    throw new Error(
      `filterOperators: market "${input.marketSlug}" not in coverage. Use listMarkets to see covered markets.`
    );
  }

  // Pull ranked PMs only; tracked-tier (rankOverall null) operators
  // don't have full scorecard data so filters wouldn't apply meaningfully.
  const pms = await prisma.pM.findMany({
    where: { marketId: market.id, rankOverall: { not: null } },
  });

  // Need share-trajectory only if a trajectory filter is set. The YoY is
  // computed inline from the scorecard's t12ListingsCount and
  // t24t12ListingsCount — both pre-baked at seed time — so we avoid the
  // msaPool round-trip that buildShareTrajectoryView would otherwise do.
  // Continuing-display eligibility (the gate buildShareTrajectoryView
  // applies for the scorecard surface) isn't enforced here — for the
  // tool surface, a non-null t24 baseline is the only requirement.
  const trajectoryFilterActive =
    input.shareTrajectoryDirection &&
    input.shareTrajectoryDirection !== "any";

  // Score + filter every row, keeping at most 20.
  const matches: FilterOperatorsResult["results"] = [];
  for (const row of pms) {
    const sc = JSON.parse(row.scorecardData) as ScorecardData;

    const t12 = sc.coverage.t12Listings;
    if (input.minT12Listings != null && t12 < input.minT12Listings) continue;
    if (input.maxT12Listings != null && t12 > input.maxT12Listings) continue;

    if (input.quadrant7Cell && sc.pm.quadrant7Cell !== input.quadrant7Cell)
      continue;

    if (input.isInstitutional != null) {
      const isInst = sc.pm.institutional === true;
      if (input.isInstitutional !== isInst) continue;
    }

    if (input.hasGoldStar) {
      const goldMap: Record<string, boolean> = {
        dom: sc.performance.domStar === "gold",
        rentPerformance: sc.rentPerformance?.star === "gold",
        tenancy: sc.tenancy.star === "gold",
        marketing: sc.marketing.star === "gold",
      };
      if (input.hasGoldStar === "any") {
        if (!Object.values(goldMap).some(Boolean)) continue;
      } else if (!goldMap[input.hasGoldStar]) continue;
    }

    let shareYoYPp: number | null = null;
    if (trajectoryFilterActive) {
      const t12 = sc.t12ListingsCount ?? null;
      const t24 = sc.t24t12ListingsCount ?? null;
      // Drop rows without a continuing baseline — share trajectory is
      // undefined for null_baseline / new_in_coverage operators.
      if (t12 === null || t24 === null || t24 === 0) continue;
      const yoy = (t12 - t24) / t24;
      const yoyPp = yoy * 100;
      if (input.shareTrajectoryDirection === "rising" && yoyPp <= 0) continue;
      if (input.shareTrajectoryDirection === "falling" && yoyPp >= 0) continue;
      if (
        input.shareTrajectoryMinPp != null &&
        Math.abs(yoyPp) < input.shareTrajectoryMinPp
      )
        continue;
      shareYoYPp = Number(yoyPp.toFixed(2));
    }

    const goldStars =
      (sc.performance.domStar === "gold" ? 1 : 0) +
      (sc.rentPerformance?.star === "gold" ? 1 : 0) +
      (sc.marketing.star === "gold" ? 1 : 0) +
      (sc.tenancy.star === "gold" ? 1 : 0) +
      (sc.communityVisibility?.star === "gold" ? 1 : 0);
    const silverStars =
      (sc.performance.domStar === "silver" ? 1 : 0) +
      (sc.rentPerformance?.star === "silver" ? 1 : 0) +
      (sc.marketing.star === "silver" ? 1 : 0) +
      (sc.tenancy.star === "silver" ? 1 : 0) +
      (sc.communityVisibility?.star === "silver" ? 1 : 0);

    matches.push({
      name: sc.pm.name,
      pmSlug: sc.pm.slug,
      scorecardUrl: scorecardHref(market.state, market.city, sc.pm.slug),
      quadrant7Cell: sc.pm.quadrant7Cell ?? null,
      institutional: sc.pm.institutional,
      rankOverall: sc.rank.overall,
      t12Listings: t12,
      domT12: sc.performance.domT12,
      rentPerformanceYoY: pct(sc.rentPerformance?.pmYoyChange, 2),
      shareTrajectoryYoYPp: shareYoYPp,
      goldStars,
      silverStars,
    });
  }

  // Rank ordering: gold desc, silver desc, rank asc — mirrors the
  // market-landing list ordering so tool output feels consistent with the
  // visible product.
  matches.sort((a, b) => {
    if (a.goldStars !== b.goldStars) return b.goldStars - a.goldStars;
    if (a.silverStars !== b.silverStars) return b.silverStars - a.silverStars;
    return (a.rankOverall ?? 9999) - (b.rankOverall ?? 9999);
  });

  const truncated = matches.length > 20;
  return {
    marketSlug: market.id,
    marketName: market.fullName,
    filtersApplied: input,
    matchCount: matches.length,
    truncated,
    results: matches.slice(0, 20),
  };
}

// ─── tool 7: compareOperators ───────────────────────────────────────

export type CompareOperatorsResult = {
  comparisons: Array<{
    name: string;
    pmSlug: string;
    marketName: string;
    scorecardUrl: string;
    quadrant7Cell: string | null;
    institutional: boolean | undefined;
    rankOverall: number;
    rankOverallTotal: number;
    compositeStar: "gold" | "silver" | "none";
    goldStars: number;
    silverStars: number;
    t12Listings: number;
    domT12: number;
    rentPerformanceYoY: string | null;
  }>;
};

export async function compareOperators(
  operatorSlugs: string[],
  marketSlugs: string[]
): Promise<CompareOperatorsResult> {
  if (!Array.isArray(operatorSlugs) || !Array.isArray(marketSlugs)) {
    throw new Error("compareOperators: operatorSlugs and marketSlugs must be arrays");
  }
  if (operatorSlugs.length === 0) {
    throw new Error("compareOperators: at least one operator required");
  }
  if (operatorSlugs.length !== marketSlugs.length) {
    throw new Error(
      `compareOperators: operatorSlugs (length ${operatorSlugs.length}) and marketSlugs (length ${marketSlugs.length}) must be the same length`
    );
  }
  if (operatorSlugs.length > 6) {
    throw new Error("compareOperators: comparing more than 6 operators is unsupported");
  }

  const comparisons: CompareOperatorsResult["comparisons"] = [];
  for (let i = 0; i < operatorSlugs.length; i++) {
    const opSlug = operatorSlugs[i];
    const mktSlug = marketSlugs[i];
    const row = await prisma.pM.findUnique({ where: { slug: opSlug } });
    if (!row) {
      throw new Error(
        `compareOperators: operator "${opSlug}" not found. Use searchOperators to find their exact slug.`
      );
    }
    if (row.marketId !== mktSlug) {
      throw new Error(
        `compareOperators: operator "${opSlug}" is in market "${row.marketId}", not "${mktSlug}".`
      );
    }
    const sc = JSON.parse(row.scorecardData) as ScorecardData;
    const market = await prisma.market.findUnique({ where: { id: row.marketId } });
    if (!market) continue;

    const goldStars =
      (sc.performance.domStar === "gold" ? 1 : 0) +
      (sc.rentPerformance?.star === "gold" ? 1 : 0) +
      (sc.marketing.star === "gold" ? 1 : 0) +
      (sc.tenancy.star === "gold" ? 1 : 0) +
      (sc.communityVisibility?.star === "gold" ? 1 : 0);
    const silverStars =
      (sc.performance.domStar === "silver" ? 1 : 0) +
      (sc.rentPerformance?.star === "silver" ? 1 : 0) +
      (sc.marketing.star === "silver" ? 1 : 0) +
      (sc.tenancy.star === "silver" ? 1 : 0) +
      (sc.communityVisibility?.star === "silver" ? 1 : 0);

    comparisons.push({
      name: sc.pm.name,
      pmSlug: sc.pm.slug,
      marketName: market.fullName,
      scorecardUrl: scorecardHref(market.state, market.city, sc.pm.slug),
      quadrant7Cell: sc.pm.quadrant7Cell ?? null,
      institutional: sc.pm.institutional,
      rankOverall: sc.rank.overall,
      rankOverallTotal: sc.rank.overallTotal,
      compositeStar: starLabel(sc.rank.compositeStar),
      goldStars,
      silverStars,
      t12Listings: sc.coverage.t12Listings,
      domT12: sc.performance.domT12,
      rentPerformanceYoY: pct(sc.rentPerformance?.pmYoyChange, 2),
    });
  }

  return { comparisons };
}

// ─── Anthropic tool definitions ─────────────────────────────────────

// These schemas are what Claude sees. Descriptions are tuned for the
// model's tool-selection step: clear pickability ("use this when the
// user asks for X") trumps strict typing minutiae.
export const ASK_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "searchOperators",
    description:
      "Fuzzy text search across property managers (PMs) by name. " +
      "Returns up to 20 ranked, canonical (multi-market), or tracked (universe) operators. " +
      "Use this FIRST when the user mentions an operator by name to resolve their exact pmSlug + marketSlug, " +
      "which other tools (getOperatorScorecard, compareOperators) need. " +
      "Tier 'canonical' means the operator is multi-market — use getCanonicalOperator with the canonicalOperatorId for a cross-market view.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Free-text operator name or partial name. Case-insensitive, fuzzy matching.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default 10, max 20).",
          minimum: 1,
          maximum: 20,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "listMarkets",
    description:
      "List all 10 markets in Dwellsy IQ coverage with their high-level stats: " +
      "active operator count, eligible cohort size, median days-on-market, market rent growth YoY. " +
      "Use this when the user asks 'what markets do you cover' or wants a high-level market comparison.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "getMarket",
    description:
      "Deep dive on a single market. Returns market stats, 7-cell quadrant breakdown " +
      "(count + median DOM + median rent-vs-comp per cell), and the top 10 ranked operators " +
      "ordered by star count. Use this when the user asks about a specific market's operator landscape, " +
      "quadrant distribution, or 'best operators in <market>'.",
    input_schema: {
      type: "object" as const,
      properties: {
        marketSlug: {
          type: "string",
          description:
            "Market slug like 'phoenix-az', 'jacksonville-fl', 'chattanooga-tn', " +
            "'nashville-davidson-murfreesboro-franklin-tn', 'memphis-tn-ms-ar', " +
            "'knoxville-tn', 'clarksville-tn-ky', 'birmingham-al', 'huntsville-al', " +
            "'montgomery-al'. Call listMarkets to see all 10 slugs.",
        },
      },
      required: ["marketSlug"],
    },
  },
  {
    name: "getOperatorScorecard",
    description:
      "Full scorecard for a single operator in a single market. Returns classification, " +
      "rank, all 5 metric stars (DOM, rent performance, marketing, tenancy, community visibility), " +
      "executive summary, distinguishing characteristics. Use this when the user wants depth on a " +
      "specific operator. Resolve the exact slugs via searchOperators first.",
    input_schema: {
      type: "object" as const,
      properties: {
        operatorSlug: {
          type: "string",
          description: "Exact PM slug from searchOperators result (e.g. 'invitation-homes-phoenix-az').",
        },
        marketSlug: {
          type: "string",
          description: "The market this PM operates in (e.g. 'phoenix-az'). Must match the PM's market.",
        },
      },
      required: ["operatorSlug", "marketSlug"],
    },
  },
  {
    name: "getCanonicalOperator",
    description:
      "Cross-market profile for a multi-market operator (e.g. Invitation Homes operating in 4 markets). " +
      "Returns aggregate stats + per-market cards. Use this when the user asks about an operator " +
      "across markets ('Compare Invitation Homes across markets', 'Where does Mission Rock operate?'). " +
      "Only works for multi-market entities — single-market operators don't have a canonical profile.",
    input_schema: {
      type: "object" as const,
      properties: {
        canonicalSlug: {
          type: "string",
          description:
            "Canonical operator slug like 'invitation-homes', 'mission-rock-residential', " +
            "'first-keys-homes'. Returned in searchOperators results when tier='canonical'.",
        },
      },
      required: ["canonicalSlug"],
    },
  },
  {
    name: "filterOperators",
    description:
      "Flexible filtered query against operators in a specific market. " +
      "Use this for compound queries like 'Memphis institutional operators with rising share trajectory ≥3pp' " +
      "or 'Phoenix operators with gold star on rent performance'. " +
      "Returns up to 20 matches sorted by star count then rank.",
    input_schema: {
      type: "object" as const,
      properties: {
        marketSlug: {
          type: "string",
          description: "Required. The market to filter within. See getMarket for valid slugs.",
        },
        minT12Listings: {
          type: "number",
          description: "Minimum T12 listings count (inclusive).",
        },
        maxT12Listings: {
          type: "number",
          description: "Maximum T12 listings count (inclusive).",
        },
        shareTrajectoryDirection: {
          type: "string",
          enum: ["rising", "falling", "any"],
          description:
            "Filter by share-of-market trajectory YoY direction. 'rising'=positive YoY, 'falling'=negative YoY.",
        },
        shareTrajectoryMinPp: {
          type: "number",
          description:
            "Minimum absolute share trajectory YoY in percentage points (e.g. 3 means at least ±3pp). " +
            "Only meaningful when shareTrajectoryDirection is set.",
        },
        quadrant7Cell: {
          type: "string",
          enum: [
            "SFR Independent",
            "SFR Institutional",
            "Small MF/BTR Independent",
            "Small MF/BTR Institutional",
            "Large MF/BTR Independent",
            "Large MF/BTR Institutional",
            "Hybrid",
          ],
          description: "Exact 7-cell classification label.",
        },
        isInstitutional: {
          type: "boolean",
          description: "True for institutional operators, false for independent.",
        },
        hasGoldStar: {
          type: "string",
          enum: ["dom", "rentPerformance", "tenancy", "marketing", "any"],
          description:
            "Filter to operators with a gold star on the named metric, or 'any' for at least one gold star.",
        },
      },
      required: ["marketSlug"],
    },
  },
  {
    name: "compareOperators",
    description:
      "Side-by-side comparison of 2-6 operators. Pairs must be equal-length: " +
      "operatorSlugs[i] is in marketSlugs[i]. Use this for 'compare X and Y' or " +
      "'how does Brookside stack against UDR'. Returns normalized rows for tabular rendering.",
    input_schema: {
      type: "object" as const,
      properties: {
        operatorSlugs: {
          type: "array",
          items: { type: "string" },
          description: "Operator PM slugs in the same order as marketSlugs (2-6 entries).",
        },
        marketSlugs: {
          type: "array",
          items: { type: "string" },
          description:
            "Market slugs paired index-for-index with operatorSlugs (2-6 entries). " +
            "Each must be the market the corresponding operator is in.",
        },
      },
      required: ["operatorSlugs", "marketSlugs"],
    },
  },
];

// ─── dispatcher ─────────────────────────────────────────────────────

// Single entry point the /api/ask route uses to execute a tool by name.
// Wraps each branch in a try/catch so a tool-implementation error returns
// a structured error object the model can read and recover from, rather
// than crashing the streaming response.
export async function executeTool(
  name: string,
  input: unknown
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    const args = (input ?? {}) as Record<string, unknown>;
    switch (name) {
      case "searchOperators":
        return {
          ok: true,
          result: await searchOperators(
            String(args.query ?? ""),
            typeof args.limit === "number" ? args.limit : undefined
          ),
        };
      case "listMarkets":
        return { ok: true, result: await listMarkets() };
      case "getMarket":
        return {
          ok: true,
          result: await getMarket(String(args.marketSlug ?? "")),
        };
      case "getOperatorScorecard":
        return {
          ok: true,
          result: await getOperatorScorecard(
            String(args.operatorSlug ?? ""),
            String(args.marketSlug ?? "")
          ),
        };
      case "getCanonicalOperator":
        return {
          ok: true,
          result: await getCanonicalOperator(String(args.canonicalSlug ?? "")),
        };
      case "filterOperators":
        return {
          ok: true,
          result: await filterOperators(args as unknown as FilterOperatorsInput),
        };
      case "compareOperators":
        return {
          ok: true,
          result: await compareOperators(
            (args.operatorSlugs as string[]) ?? [],
            (args.marketSlugs as string[]) ?? []
          ),
        };
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
