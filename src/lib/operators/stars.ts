// Per-metric gold + silver star roll-up for a single operator.
//
// PR #53 consolidates what used to be three near-identical copies of
// this loop (compare page, IdentityHero, operator-data) into one
// shared utility. The market list, the scorecard hero, the operator
// profile, the compare table, and now the homepage sample cards all
// read the same gold/silver counts for the same operator from this
// module — so adding or removing a starable metric is a one-line
// change instead of a search-and-replace across the codebase.
//
// The five metrics that earn per-metric stars are fixed by the
// v0.6.4 methodology:
//
//   1. performance.domStar         — Lease-up speed
//   2. rentPerformance.star        — Rent performance vs cohort
//   3. marketing.star              — Marketing discipline
//   4. tenancy.star                — Tenant retention
//   5. communityVisibility.star    — Inventory transparency
//                                    (MF/BTR only; null elsewhere)
//
// communityVisibility is optional: SFR and Hybrid operators don't
// have a meaningful community-visibility scope, so the field is
// undefined / null for them. countOperatorStars treats that as
// "no star contributed" — never throws and never double-counts.

import type { ScorecardData, StarLevel } from "@/lib/types";

export interface OperatorStarCounts {
  /** How many of the (up to five) starable metrics earned a gold
   *  star — top quartile in the operator's cohort. */
  goldCount: number;
  /** How many earned a silver star — above-median in cohort but not
   *  top quartile. */
  silverCount: number;
}

/**
 * Count per-metric gold + silver stars for a single operator.
 *
 * Reads the five canonical star fields off `scorecard` and returns
 * the totals. Operators with no stars at all return { gold: 0,
 * silver: 0 }; the caller decides whether to hide a UI affordance
 * (StarSummaryChip does this internally).
 */
export function countOperatorStars(
  scorecard: ScorecardData
): OperatorStarCounts {
  const stars: Array<StarLevel | undefined> = [
    scorecard.performance?.domStar,
    scorecard.rentPerformance?.star,
    scorecard.marketing?.star,
    scorecard.tenancy?.star,
    scorecard.communityVisibility?.star,
  ];
  let goldCount = 0;
  let silverCount = 0;
  for (const s of stars) {
    if (s === "gold") goldCount++;
    else if (s === "silver") silverCount++;
  }
  return { goldCount, silverCount };
}
