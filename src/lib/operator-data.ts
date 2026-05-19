// v0.6.4 Patch 1 — operator profile data loader.
// /operator/<canonicalSlug> route consumes loadOperatorView which
// resolves a CanonicalOperator row + every member PM scorecard + the
// market row each PM sits in. Profile renders only for multi-market
// canonical entities (marketCount ≥ 2) — single-market PMs 404 here
// since their primary surface is the per-market scorecard.

import { prisma } from "@/lib/prisma";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import type { ScorecardData, StarLevel } from "@/lib/types";

export interface OperatorMarketCard {
  marketId: string;
  marketCity: string;
  marketFullName: string;
  stateCode: string;
  stateSlug: string;
  citySlug: string;
  pmSlug: string;
  scorecardHref: string;
  /** v0.6.2 quadrant7Cell label for this PM, used to derive the modal
   *  classification in the operator's cross-market summary. */
  quadrant7Cell: string | null;
  t12Listings: number;
  goldCount: number;
  silverCount: number;
  /** v0.6.3 Patch 6 share-trajectory eligibility for the per-market
   *  card. Renderer surfaces the YoY value when "continuing", or the
   *  status label otherwise. */
  shareTrajectoryYoY: number | null;
  shareTrajectoryEligibility:
    | "continuing"
    | "new_in_coverage"
    | "null_baseline";
  t12ListingsCountForShare: number | null;
  t24t12ListingsCount: number | null;
}

export interface OperatorView {
  canonicalSlug: string;
  canonicalName: string;
  marketCount: number;
  marketCards: OperatorMarketCard[];
  /** Distinct state codes the operator operates across, alphabetized for
   *  the "across X, Y, Z" sublabel. */
  stateCodes: string[];
  aggregateStats: {
    totalT12Listings: number;
    totalT24T12Listings: number;
    totalUrusT12: number;
  };
  /** Modal classification across markets — the most-frequently observed
   *  quadrant7Cell among the operator's market-instances. Null when no
   *  PM carries a classification (defensive — every v0.6.4 ranked PM
   *  has one). */
  modalClassification: string | null;
}

function countStars(sc: ScorecardData, tone: "gold" | "silver"): number {
  const stars: Array<StarLevel | undefined> = [
    sc.performance?.domStar,
    sc.rentPerformance?.star,
    sc.marketing?.star,
    sc.tenancy?.star,
    sc.communityVisibility?.star,
  ];
  return stars.filter((s) => s === tone).length;
}

// Strict continuing-cohort threshold per Patch 6. Mirrors the runtime
// rule in share-trajectory.ts so the operator profile card classifier
// matches the scorecard Layer 5 surface.
const COHORT_THRESHOLD = 30;

function shareEligibility(
  t12: number | null,
  t24: number | null
): "continuing" | "new_in_coverage" | "null_baseline" {
  if (t24 === null || t24 === 0) return "null_baseline";
  if (typeof t12 === "number" && t12 >= COHORT_THRESHOLD && t24 >= COHORT_THRESHOLD) {
    return "continuing";
  }
  return "new_in_coverage";
}

export async function loadOperatorView(
  canonicalSlug: string
): Promise<OperatorView | null> {
  const entity = await prisma.canonicalOperator.findUnique({
    where: { canonicalSlug },
  });
  if (!entity || entity.marketCount < 2) return null;

  // Resolve every member PM scorecard. The pmSlugs JSON array on the
  // CanonicalOperator row drives the lookup. Members may have been
  // disambiguated at seed time (quick-wins slug fix) — we look up by
  // slug, so disambiguated rows still resolve.
  const pmSlugs = JSON.parse(entity.pmSlugs) as string[];
  const pmRows = await prisma.pM.findMany({
    where: { slug: { in: pmSlugs } },
    select: {
      slug: true,
      scorecardData: true,
      market: {
        select: { id: true, city: true, state: true, fullName: true },
      },
    },
  });

  const marketCards: OperatorMarketCard[] = [];
  const classificationCounts = new Map<string, number>();
  const stateSet = new Set<string>();

  for (const row of pmRows) {
    const sc = JSON.parse(row.scorecardData) as ScorecardData;
    const stateSlug = stateCodeToSlug(row.market.state);
    const city = row.market.city;
    const cellLabel = sc.pm.quadrant7Cell ?? sc.pm.quadrant ?? null;
    if (cellLabel) {
      classificationCounts.set(
        cellLabel,
        (classificationCounts.get(cellLabel) ?? 0) + 1
      );
    }
    stateSet.add(row.market.state);

    const t12 = sc.t12ListingsCount ?? null;
    const t24 = sc.t24t12ListingsCount ?? null;
    const eligibility = shareEligibility(t12, t24);
    // Profile cards intentionally omit the full share-trajectory math
    // (cohort totals etc.) — that lives on the scorecard's Layer 5
    // section. The card surfaces the eligibility classification +
    // (when continuing) a one-line YoY hint computed in the cohort
    // context of that market. To avoid pulling the full msaPool per
    // card we compute a simpler proxy here: the operator's raw
    // shareT12/shareT24 against the cohort totals would require the
    // pool. Default to null and link to the per-market scorecard
    // where the full math lives.
    marketCards.push({
      marketId: row.market.id,
      marketCity: city,
      marketFullName: row.market.fullName,
      stateCode: row.market.state,
      stateSlug,
      citySlug: citySlug(city),
      pmSlug: row.slug,
      scorecardHref: `/property-managers/${stateSlug}/${citySlug(city)}/${row.slug}`,
      quadrant7Cell: cellLabel,
      t12Listings: sc.coverage?.t12Listings ?? 0,
      goldCount: countStars(sc, "gold"),
      silverCount: countStars(sc, "silver"),
      shareTrajectoryYoY: null,
      shareTrajectoryEligibility: eligibility,
      t12ListingsCountForShare: t12,
      t24t12ListingsCount: t24,
    });
  }

  // Stable display order — by t12Listings desc so the operator's
  // strongest-presence market leads the grid.
  marketCards.sort((a, b) => b.t12Listings - a.t12Listings);

  // Modal classification — most-frequent quadrant7Cell. Tied modes pick
  // the lexicographically-first for determinism across reseeds.
  let modalClassification: string | null = null;
  let modalCount = 0;
  for (const [label, count] of classificationCounts) {
    if (count > modalCount || (count === modalCount && (modalClassification ?? "") > label)) {
      modalClassification = label;
      modalCount = count;
    }
  }

  return {
    canonicalSlug: entity.canonicalSlug,
    canonicalName: entity.canonicalName,
    marketCount: entity.marketCount,
    marketCards,
    stateCodes: [...stateSet].sort(),
    aggregateStats: JSON.parse(entity.aggregateStats) as OperatorView["aggregateStats"],
    modalClassification,
  };
}

// Static-params lister for /operator/[canonicalSlug]. Multi-market
// entities only (marketCount ≥ 2) so single-market PMs don't generate
// stub pages that 404.
export async function listOperatorRouteParams(): Promise<
  Array<{ canonicalSlug: string }>
> {
  const rows = await prisma.canonicalOperator.findMany({
    where: { marketCount: { gte: 2 } },
    select: { canonicalSlug: true },
  });
  return rows.map((r) => ({ canonicalSlug: r.canonicalSlug }));
}
