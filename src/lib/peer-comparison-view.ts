// Peer selection algorithm for the "Compare with similar PMs" page.
//
// Naming note: this lives in a separate file from src/lib/peer-comparison.ts
// (which serves the scorecard Layer 3 per-metric cohort tables) to keep the
// two surfaces independent. They share the same data layer (PoolPm) but
// answer different questions:
//
//   peer-comparison.ts        — "for THIS metric, how does X compare to
//                                same-cohort medians on the SAME chart?"
//                                Used by every Layer 3 metric card.
//
//   peer-comparison-view.ts   — "give me 3 operators most similar to X
//                                so we can put them side-by-side on a
//                                comparison page." This file.
//
// The selection waterfall is intentionally conservative — strict first,
// then loosened only when the strict cohort is too thin. The cohortScope
// + cohortNote return values surface that fallback choice to the UI so
// readers know whether they're looking at apples-to-apples peers or a
// broader fill-in.

import type { PoolPm } from "@/lib/msa-pool";
import type { Quadrant7CellKey } from "@/lib/types";

export type CohortLevel = "strict" | "family" | "market";

export interface ComparisonPeers {
  peers: PoolPm[];
  /** Human-readable description of which cohort the peers came from. */
  cohortScope: string;
  /** Diagnostic message when the algorithm fell back or returned fewer
   *  peers than desiredCount. Null when strict produced a full set. */
  cohortNote: string | null;
  /** Which level of the waterfall actually produced the peers. */
  cohortLevel: CohortLevel;
}

/** Inferred operator family from a 7-cell quadrant label. Used by the
 *  family-fallback step of the waterfall. */
type Family = "SFR" | "MF/BTR" | "Hybrid";

function inferFamily(quadrant7Cell: string | null): Family | null {
  if (!quadrant7Cell) return null;
  const q = quadrant7Cell.toLowerCase();
  if (q.startsWith("sfr")) return "SFR";
  if (q.startsWith("small mf") || q.startsWith("large mf")) return "MF/BTR";
  if (q.startsWith("hybrid")) return "Hybrid";
  return null;
}

/** Sort comparator: closest rank to the focal first. Operators without a
 *  rank fall to the bottom (defensive — the eligibility filter above
 *  excludes them anyway). */
function rankDistance(focalRank: number) {
  return (a: PoolPm, b: PoolPm): number => {
    const ra = a.scorecard.rank.overall ?? Number.MAX_SAFE_INTEGER;
    const rb = b.scorecard.rank.overall ?? Number.MAX_SAFE_INTEGER;
    return Math.abs(ra - focalRank) - Math.abs(rb - focalRank);
  };
}

/** Build a human-readable cohort scope label, parameterized on the
 *  focal operator's quadrant or family so the UI can say "Same market +
 *  same SFR Independent quadrant" rather than the generic "strict". */
function scopeLabel(
  level: CohortLevel,
  marketName: string,
  quadrant7Cell: string | null,
  family: Family | null
): string {
  switch (level) {
    case "strict":
      return quadrant7Cell
        ? `Same market + same ${quadrant7Cell} quadrant`
        : `Same market + same quadrant`;
    case "family":
      return family
        ? `Same market + same family (${family})`
        : `Same market + same family`;
    case "market":
      return `${marketName} — broader cohort`;
  }
}

export function selectComparisonPeers(
  focalSlug: string,
  marketName: string,
  msaPool: PoolPm[],
  desiredCount = 3
): ComparisonPeers {
  const focal = msaPool.find((p) => p.slug === focalSlug);
  if (!focal) {
    // Defensive: the route handler resolves the focal scorecard before
    // calling this, but if a caller skips that step we don't want to
    // crash — return an empty cohort with an explanatory note.
    return {
      peers: [],
      cohortScope: "No focal operator",
      cohortNote: "Focal operator not found in the market cohort.",
      cohortLevel: "strict",
    };
  }

  // Eligible peers: every ranked operator in the pool EXCEPT the focal.
  // Tracked-tier (rankOverall null) entries don't carry enough scorecard
  // data for side-by-side comparison and are excluded.
  const focalRank = focal.scorecard.rank.overall;
  const eligible = msaPool.filter(
    (p) =>
      p.slug !== focalSlug &&
      p.scorecard.rank.overall !== null &&
      p.scorecard.rank.overall !== undefined
  );

  const focalQuadrant = focal.scorecard.pm.quadrant7Cell ?? null;
  const focalFamily = inferFamily(focalQuadrant);
  const cmp = rankDistance(focalRank ?? Number.MAX_SAFE_INTEGER);

  // Step 1 — strict cohort: same quadrant7Cell.
  if (focalQuadrant) {
    const strict = eligible
      .filter((p) => p.scorecard.pm.quadrant7Cell === focalQuadrant)
      .sort(cmp)
      .slice(0, desiredCount);
    if (strict.length >= desiredCount) {
      return {
        peers: strict,
        cohortScope: scopeLabel("strict", marketName, focalQuadrant, focalFamily),
        cohortNote: null,
        cohortLevel: "strict",
      };
    }

    // Step 2 — family fallback: same broad family.
    if (focalFamily) {
      const family = eligible
        .filter((p) => inferFamily(p.scorecard.pm.quadrant7Cell ?? null) === focalFamily)
        .sort(cmp)
        .slice(0, desiredCount);
      if (family.length >= desiredCount) {
        return {
          peers: family,
          cohortScope: scopeLabel("family", marketName, focalQuadrant, focalFamily),
          cohortNote:
            strict.length === 0
              ? `No same-quadrant peers available in ${marketName}; falling back to ${focalFamily} family.`
              : `Only ${strict.length} same-quadrant peer${strict.length === 1 ? "" : "s"} available; falling back to ${focalFamily} family.`,
          cohortLevel: "family",
        };
      }

      // Step 3 — market fallback: any ranked operator in the market.
      const market = eligible.sort(cmp).slice(0, desiredCount);
      const note =
        market.length < desiredCount
          ? `Only ${market.length} ranked peer${market.length === 1 ? "" : "s"} available across ${marketName}.`
          : strict.length === 0 && family.length === 0
            ? `No same-quadrant or same-family peers in ${marketName}; showing the broader market cohort.`
            : `Falling back to broader ${marketName} cohort.`;
      return {
        peers: market,
        cohortScope: scopeLabel("market", marketName, focalQuadrant, focalFamily),
        cohortNote: note,
        cohortLevel: "market",
      };
    }
  }

  // No quadrant info → drop straight to market cohort.
  const market = eligible.sort(cmp).slice(0, desiredCount);
  return {
    peers: market,
    cohortScope: scopeLabel("market", marketName, focalQuadrant, focalFamily),
    cohortNote:
      market.length < desiredCount
        ? `Only ${market.length} ranked peer${market.length === 1 ? "" : "s"} available across ${marketName}.`
        : `Showing broader market cohort (operator quadrant unavailable).`,
    cohortLevel: "market",
  };
}

/** Quick boolean for the sidebar button — returns true when at least one
 *  peer is available so we can hide the button on the rare edge case
 *  where a market has only the focal operator. */
export function hasComparablePeers(msaPool: PoolPm[], focalSlug: string): boolean {
  return msaPool.some(
    (p) =>
      p.slug !== focalSlug &&
      p.scorecard.rank.overall !== null &&
      p.scorecard.rank.overall !== undefined
  );
}

// Re-export Quadrant7CellKey for downstream consumers that import from
// this module (avoids them needing a separate types import).
export type { Quadrant7CellKey };
