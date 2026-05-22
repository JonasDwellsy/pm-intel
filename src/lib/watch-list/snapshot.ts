// v0.16 — Capture per-operator snapshots at seed time.
//
// One row per PM (per-market-instance). snapshotDate stamps the
// methodology's dataAsOf, NOT the deploy time, so the snapshot
// cadence inherits the monthly data-refresh cadence (April-data
// lands in May, May-data lands in June, etc.). Re-deploys against
// the same JSON no-op via the @@unique([pmSlug, snapshotDate])
// constraint + Prisma's skipDuplicates flag.
//
// This module exposes two pure functions (no Prisma dependencies)
// so they're testable in isolation. The seed script orchestrates
// the actual DB write.

import type { ScorecardData, StarLevel } from "@/lib/types";

/** Five canonical metrics that earn per-metric stars. Keys are the
 *  business labels surfaced on the scorecard; values are the star
 *  tier for that metric (null when no star earned, undefined never).
 *  Mirrors the order the scorecard hero renders for visual continuity. */
export interface StarsPerMetric {
  leaseUp: StarLevel | null;
  tenancy: StarLevel | null;
  rentPerformance: StarLevel | null;
  marketingDiscipline: StarLevel | null;
  /** Null for SFR + Hybrid operators (community-visibility scope
   *  doesn't apply outside MF/BTR). */
  inventoryTransparency: StarLevel | null;
}

/** Shape that maps 1-to-1 to an OperatorSnapshot row. All JSON fields
 *  are stored as serialized strings in the DB (matches the project-
 *  wide JSON-as-String convention). */
export interface SnapshotRow {
  pmSlug: string;
  snapshotDate: Date;
  methodologyVersion: string;
  starsPerMetric: StarsPerMetric;
  starGoldCount: number;
  starSilverCount: number;
  estimatedPortfolioPoint: number | null;
  estimatedPortfolioBand: string | null;
  /** MSA slugs the canonical operator has at least one PM in at this
   *  snapshot date. For single-market operators this is a 1-element
   *  array (the operator's only marketId); for cross-market entities
   *  (Invitation Homes, etc.) this is the full footprint. Replicated
   *  across every PM row sharing the same canonicalOperatorId so the
   *  diff can compute set delta from any single PM snapshot. */
  topMSAs: string[];
  /** Submarket slugs where this PM has > 0 listings in the T12
   *  window. Sourced from PM.t12ListingsBySubmarket (JSON map). */
  topSubmarkets: string[];
  concessionRate: number | null;
  isEligibleForRanking: boolean;
}

/** The five star fields on a ScorecardData blob, normalised into the
 *  business-label shape we persist. Reads exactly the same fields
 *  countOperatorStars() reads — no methodology drift introduced. */
export function extractStarsPerMetric(sc: ScorecardData): StarsPerMetric {
  return {
    leaseUp: normaliseStar(sc.performance?.domStar),
    tenancy: normaliseStar(sc.tenancy?.star),
    rentPerformance: normaliseStar(sc.rentPerformance?.star),
    marketingDiscipline: normaliseStar(sc.marketing?.star),
    inventoryTransparency: normaliseStar(sc.communityVisibility?.star),
  };
}

function normaliseStar(value: StarLevel | undefined): StarLevel | null {
  if (value === "gold" || value === "silver") return value;
  return null;
}

/** Sum the gold + silver counts across the five metrics. Mirrors
 *  countOperatorStars() in src/lib/operators/stars.ts but operates
 *  on the persisted snapshot shape, which is what the change-
 *  detection diff reads from. */
export function countStarTotals(stars: StarsPerMetric): {
  gold: number;
  silver: number;
} {
  let gold = 0;
  let silver = 0;
  for (const s of [
    stars.leaseUp,
    stars.tenancy,
    stars.rentPerformance,
    stars.marketingDiscipline,
    stars.inventoryTransparency,
  ]) {
    if (s === "gold") gold++;
    else if (s === "silver") silver++;
  }
  return { gold, silver };
}

/** Eligibility threshold from the methodology: ≥30 T12 listings
 *  qualifies an operator for the per-cohort ranked surface. Lives
 *  here as a named constant so the change-detection diff can
 *  reproduce the rule without having to import the seed module. */
export const RANKING_ELIGIBILITY_THRESHOLD = 30;

/** Read the eligibility-relevant T12 listing count off the scorecard.
 *  Returns 0 when the field is missing so the threshold check below
 *  classifies the operator as ineligible (safe default). */
export function readT12ListingsCount(sc: ScorecardData): number {
  const n = sc.coverage?.t12Listings;
  return typeof n === "number" ? n : 0;
}

/** Parse the t12ListingsBySubmarket JSON column off a PM row and
 *  return the set of submarket slugs where the count is > 0. Used
 *  by the snapshot composer + smoke tests. Tolerant of malformed
 *  input — bad JSON or wrong shape yields an empty array, never
 *  throws. */
export function readActiveSubmarkets(
  t12ListingsBySubmarket: string | null | undefined
): string[] {
  if (!t12ListingsBySubmarket) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(t12ListingsBySubmarket);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const result: string[] = [];
  for (const [slug, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "number" && value > 0) result.push(slug);
  }
  return result.sort();
}

/** Read the portfolio estimate point + confidence tier off the
 *  scorecard. Non-estimated rows (status = 'insufficient_data',
 *  'insufficient_history', 'no_listings') return null point + the
 *  status string as the band so the diff can detect transitions
 *  in/out of estimated mode. */
export function readPortfolioBand(sc: ScorecardData): {
  point: number | null;
  band: string | null;
} {
  const est = sc.portfolioEstimate;
  if (!est) return { point: null, band: null };
  if (est.status === "estimated" && typeof est.point === "number") {
    return { point: Math.round(est.point), band: est.confidence ?? null };
  }
  return { point: null, band: est.status ?? null };
}
