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

// PR #75 — Prospect-share polish helpers.
//
// The cohort framing line and the OG image both need the names of
// the specific metrics that earned a gold star (e.g. "Lease-up
// Speed, Rent Performance"). The display names mirror the headline-
// metric-tile titles in SynthesisLayer.tsx so the sentence reads
// the way the rest of the scorecard labels these axes.

/** Stable display name for each of the 5 starable axes — matches the
 *  Layer 2 headline-tile titles so the cohort sentence reads the same
 *  way the rest of the scorecard labels these metrics. */
const STAR_AXIS_LABELS = {
  dom: "Lease-up Speed",
  rentPerformance: "Rent Performance",
  marketing: "Marketing Discipline",
  tenancy: "Tenant Retention",
  communityVisibility: "Inventory Transparency",
} as const;

/** Names of the axes where this operator earned a gold star, in the
 *  canonical 5-axis order. Empty array when no axis earned gold.
 *  Used by buildCohortFramingSentence (mixed variant) and by the
 *  OG image renderer. */
export function goldMetricNames(scorecard: ScorecardData): string[] {
  const names: string[] = [];
  if (scorecard.performance?.domStar === "gold")
    names.push(STAR_AXIS_LABELS.dom);
  if (scorecard.rentPerformance?.star === "gold")
    names.push(STAR_AXIS_LABELS.rentPerformance);
  if (scorecard.marketing?.star === "gold")
    names.push(STAR_AXIS_LABELS.marketing);
  if (scorecard.tenancy?.star === "gold")
    names.push(STAR_AXIS_LABELS.tenancy);
  if (scorecard.communityVisibility?.star === "gold")
    names.push(STAR_AXIS_LABELS.communityVisibility);
  return names;
}

/** Total number of starable axes for this operator. SFR + Hybrid
 *  operators have 4 (no community-visibility scope); MF/BTR with a
 *  computed community-visibility ratio have 5. Used as the "of N"
 *  denominator in the cohort framing sentence so the math is honest
 *  for operator types that genuinely don't have 5 axes available. */
export function starableAxisCount(scorecard: ScorecardData): number {
  // The five axes map 1:1 onto the SynthesisLayer headline tiles
  // EXCEPT Inventory Transparency, which is null for SFR + Hybrid.
  // Treat communityVisibility.star === null/undefined as "axis not
  // available for this operator type."
  const hasCommunityVisibility =
    scorecard.communityVisibility?.star !== undefined &&
    scorecard.communityVisibility?.star !== null;
  return hasCommunityVisibility ? 5 : 4;
}

/** Strip "(any scale)" + ensure a trailing "cohort" — mirrors the
 *  normalizeCohortName helper in IdentityHero.tsx so the cohort
 *  sentence + OG image agree on the canonical form. Pending the
 *  upstream fix in v0.7 seed pipeline. */
function normalizeCohortName(raw: string): string {
  const stripped = raw.replace(/\s*\(any scale\)\s*/i, "").trim();
  if (/cohort$/i.test(stripped)) return stripped;
  return `${stripped} cohort`;
}

/** PR #75 — Build the one-sentence cohort framing summary that
 *  renders above the Synthesis section and (in slightly compressed
 *  form) at the bottom of the OG preview image.
 *
 *  Three variants by gold-star count, per the PR #75 spec:
 *
 *    - All gold (goldCount === axes): top-quartile sweep
 *    - Mixed gold/silver/none (1 ≤ goldCount < axes):
 *        median-plus framing + comma list of gold metric names
 *    - Zero gold AND zero silver: below-cohort-median framing
 *    - Zero gold but some silver: above-median-on-N-of-axes framing
 *      (kept distinct from zero-stars to avoid telling silver-only
 *      operators they're below median, which they aren't)
 *
 *  Operator name is the canonical display name (scorecard.pm.name).
 *  Cohort name is normalized via normalizeCohortName above. */
export function buildCohortFramingSentence(
  scorecard: ScorecardData
): string {
  const operator = scorecard.pm.name;
  const axes = starableAxisCount(scorecard);
  const { goldCount, silverCount } = countOperatorStars(scorecard);
  const goldNames = goldMetricNames(scorecard);
  const cohort = normalizeCohortName(
    scorecard.rank.compositeCohortName ?? `${scorecard.market.name} MSA cohort`
  );

  // Variant A — all starable axes earned gold.
  if (goldCount === axes && axes > 0) {
    return `${operator} ranks in the top quartile of the ${cohort} on all ${axes} performance dimensions.`;
  }

  // Variant B — at least one gold but not a sweep.
  if (goldCount >= 1) {
    const list =
      goldNames.length === 1
        ? goldNames[0]
        : goldNames.length === 2
          ? `${goldNames[0]} and ${goldNames[1]}`
          : // Oxford-comma list, e.g. "A, B, and C"
            `${goldNames.slice(0, -1).join(", ")}, and ${goldNames[goldNames.length - 1]}`;
    const aboveCount = goldCount + silverCount;
    return `${operator} ranks above the ${cohort} median on ${aboveCount} of ${axes} dimensions, including top-quartile performance on ${list}.`;
  }

  // Variant C — silver-only (no gold but at least one above-median).
  if (silverCount >= 1) {
    return `${operator} ranks above the ${cohort} median on ${silverCount} of ${axes} performance dimensions.`;
  }

  // Variant D — no stars at all.
  return `${operator} ranks below cohort median across all ${axes} performance dimensions in the ${cohort}.`;
}
