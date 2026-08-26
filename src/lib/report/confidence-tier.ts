// v0.30 — Consumer confidence tier (presentation layer).
//
// The single-report funnel shows owners how much to trust a given operator's
// report, reading ONLY existing seeded data — no pipeline change. Two tiers:
//
//   Ranked  — the operator cleared the ranking bar (coverage.dataTier ===
//             "Full ranking"); we show full percentiles/stars. Sub-graded by
//             the DOM observation count behind the lease-up metric:
//               >= HIGH_CONFIDENCE_MIN_OBS  -> "High confidence"
//               <  HIGH_CONFIDENCE_MIN_OBS  -> "Moderate confidence"
//             (Threshold from the stability analysis: below ~50 DOM
//             observations the percentile carries meaningfully wider error.)
//   Profile — observed but below the ranking bar (search-index "tracked"
//             tier). Real, active operator; not enough listing volume to rank.
//
// Pure — type-only imports, unit-testable.

import type { ScorecardData } from "@/lib/types";
import type { PMSearchResult } from "@/lib/pm-search";

/** DOM observations at/above which a ranked operator's metrics read as
 *  high-confidence. See the stability (bootstrap) analysis. */
export const HIGH_CONFIDENCE_MIN_OBS = 50;

export type ReportTier = "ranked" | "profile";
export type ReportConfidence = "high" | "moderate";

export interface ReportTierInfo {
  tier: ReportTier;
  /** Only meaningful for ranked operators; null for profiles. */
  confidence: ReportConfidence | null;
  /** Short badge label, e.g. "Ranked" / "Profile". */
  label: string;
  /** Confidence qualifier for ranked operators, e.g. "High confidence". */
  confidenceLabel: string | null;
  /** Trailing-12-month listing count, when known. */
  t12Listings: number | null;
  /** DOM observation count behind the lease-up metric (ranked only). */
  domObservations: number | null;
  /** One-line plain-English explanation for the buyer. */
  blurb: string;
}

function rankedInfo(
  t12Listings: number | null,
  domObservations: number | null
): ReportTierInfo {
  const high =
    domObservations != null && domObservations >= HIGH_CONFIDENCE_MIN_OBS;
  return {
    tier: "ranked",
    confidence: high ? "high" : "moderate",
    label: "Ranked",
    confidenceLabel: high ? "High confidence" : "Moderate confidence",
    t12Listings,
    domObservations,
    blurb: high
      ? "Enough observed activity to rank this operator against local peers with high confidence."
      : "Ranked against local peers, on a smaller sample — read the percentiles as directional.",
  };
}

const PROFILE_INFO: Omit<ReportTierInfo, "t12Listings"> = {
  tier: "profile",
  confidence: null,
  label: "Profile",
  confidenceLabel: null,
  domObservations: null,
  blurb:
    "A real, active operator we track, but not yet enough listing volume to rank against peers.",
};

/** Tier for an operator we hold a full scorecard for. */
export function tierFromScorecard(scorecard: ScorecardData): ReportTierInfo {
  const t12 = scorecard.coverage?.t12Listings ?? null;
  if (scorecard.coverage?.dataTier !== "Full ranking") {
    return { ...PROFILE_INFO, t12Listings: t12 };
  }
  return rankedInfo(t12, scorecard.performance?.domT12N ?? null);
}

/** Tier for a search-index hit (no DOM count available in the index, so a
 *  ranked hit is graded on listing volume as a proxy). */
export function tierFromSearch(result: PMSearchResult): ReportTierInfo {
  if (result.tier === "ranked") {
    // No domT12N in the index; approximate confidence from listing volume.
    const t12 = result.t12Listings ?? null;
    const proxyObs = t12; // listings ≈ lower bound on DOM observations
    return rankedInfo(t12, proxyObs);
  }
  if (result.tier === "tracked") {
    return { ...PROFILE_INFO, t12Listings: result.t12Listings ?? null };
  }
  // canonical / market rows aren't single-report targets; treat as ranked
  // rollups for badge purposes.
  return rankedInfo(null, null);
}
