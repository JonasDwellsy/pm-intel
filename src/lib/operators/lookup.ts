// v0.11 — Operator-level scorecard data loader.
//
// /operators/<canonicalSlug> consumes loadOperatorScorecard which
// pulls every PM with that canonicalOperatorId, builds the
// PMRecord shape, then routes through the same aggregateRecords()
// the buy-box rollup uses (src/lib/buy-box/aggregate.ts). That
// keeps the aggregation rules — SUM / footprint-weighted average
// / modal / max / any — in exactly one place: any change to the
// math automatically affects both surfaces.
//
// Resolution rules:
//   - Multi-market canonical (CanonicalOperator row exists,
//     marketCount ≥ 2): N member PMs → aggregate, isRollup=true.
//   - Single-market canonical (pm.canonicalOperatorId === pm.slug
//     per the v0.6.4 seed convention): exactly 1 member PM →
//     aggregate wraps it, isRollup=false. The page still renders
//     so deep links stay stable if the operator later expands.
//   - No PMs found with that canonicalOperatorId: returns null
//     (route should 404).

import { prisma } from "@/lib/prisma";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import {
  aggregateRecords,
  type AggregatedPMRecord,
} from "@/lib/buy-box/aggregate";
import type { PMRecord } from "@/lib/buy-box/fields";
import type { ScorecardData } from "@/lib/types";

export interface OperatorMember {
  pmSlug: string;
  marketId: string;
  marketFullName: string;
  cityName: string;
  stateCode: string;
  /** Pre-built link to the per-market scorecard. PR #47 retired
   *  the paywall, so the URL is bare — no ?unlocked=true suffix
   *  required. */
  scorecardHref: string;
  /** Display fields for the per-market breakdown table — pulled
   *  directly from each member's scorecard for fidelity (the
   *  aggregated view holds the rolled-up versions). */
  quadrant7Cell: string | null;
  urusT12: number | null;
  portfolioPoint: number | null;
  portfolioLow: number | null;
  portfolioHigh: number | null;
  concessionRate: number | null;
  /** Year-over-year listing trajectory for THIS market alone,
   *  computed from the member's t12 vs t24 counts. The aggregate
   *  view recomputes a single YoY from the SUMMED counts; this
   *  per-market value is for the breakdown row. */
  listingTrajectoryYoY: number | null;
  claimed: boolean;
}

export interface OperatorScorecardData {
  canonicalSlug: string;
  canonicalName: string;
  /** Aggregated PMRecord — drives every value the scorecard
   *  header + aggregate stats render. */
  aggregated: AggregatedPMRecord;
  /** Per-market member details, sorted by URUs T12 desc. */
  members: OperatorMember[];
  /** Distinct state codes the operator operates across — used by
   *  the page header's geographic sublabel. */
  stateCodes: string[];
}

export async function loadOperatorScorecard(
  canonicalSlug: string
): Promise<OperatorScorecardData | null> {
  // Pull every PM whose canonicalOperatorId matches. For multi-
  // market operators this lands the full member set in one query;
  // for single-market operators (canonicalOperatorId === pm.slug)
  // it lands one row.
  const rows = await prisma.pM.findMany({
    where: { canonicalOperatorId: canonicalSlug },
    select: {
      slug: true,
      name: true,
      marketId: true,
      claimed: true,
      canonicalOperatorId: true,
      scorecardData: true,
      market: { select: { fullName: true, city: true, state: true } },
    },
  });
  if (rows.length === 0) return null;

  // Resolve the operator display name. Multi-market entities live
  // in the CanonicalOperator table; single-market operators don't
  // (canonicalOperatorId === pm.slug per the v0.6.4 seed convention),
  // so we fall back to the first member's name.
  const canonicalRow = await prisma.canonicalOperator.findUnique({
    where: { canonicalSlug },
    select: { canonicalName: true },
  });

  // Build PMRecord[] for the aggregator. Defensive: skip any row
  // whose scorecardData fails to parse rather than tank the page.
  const pmRecords: PMRecord[] = [];
  for (const row of rows) {
    let scorecard: ScorecardData;
    try {
      scorecard = JSON.parse(row.scorecardData) as ScorecardData;
    } catch {
      continue;
    }
    pmRecords.push({
      slug: row.slug,
      name: row.name,
      marketId: row.marketId,
      claimed: row.claimed,
      marketCount: rows.length,
      scorecard,
    });
  }
  if (pmRecords.length === 0) return null;

  const aggregated = aggregateRecords(pmRecords);

  // Build the per-market member list. Sorted by URUs T12 desc so
  // the largest-presence market sits at the top of the breakdown
  // (the spec's default sort).
  const members: OperatorMember[] = [];
  for (const row of rows) {
    let scorecard: ScorecardData;
    try {
      scorecard = JSON.parse(row.scorecardData) as ScorecardData;
    } catch {
      continue;
    }
    const stateCode = row.market.state;
    const cityName = row.market.city;
    const t12 = scorecard.t12ListingsCount;
    const t24 = scorecard.t24t12ListingsCount;
    members.push({
      pmSlug: row.slug,
      marketId: row.marketId,
      marketFullName: row.market.fullName,
      cityName,
      stateCode,
      scorecardHref: `/property-managers/${stateCodeToSlug(stateCode)}/${citySlug(cityName)}/${row.slug}`,
      quadrant7Cell: scorecard.pm?.quadrant7Cell ?? null,
      urusT12: scorecard.coverage?.urusT12 ?? null,
      portfolioPoint: scorecard.portfolioEstimate?.point ?? null,
      portfolioLow: scorecard.portfolioEstimate?.low ?? null,
      portfolioHigh: scorecard.portfolioEstimate?.high ?? null,
      concessionRate: scorecard.concessionRate ?? null,
      listingTrajectoryYoY:
        typeof t12 === "number" && typeof t24 === "number" && t24 !== 0
          ? (t12 - t24) / t24
          : null,
      claimed: row.claimed,
    });
  }
  members.sort((a, b) => (b.urusT12 ?? 0) - (a.urusT12 ?? 0));

  // Distinct state codes for the header sublabel.
  const stateCodes = Array.from(new Set(members.map((m) => m.stateCode))).sort();

  return {
    canonicalSlug,
    canonicalName: canonicalRow?.canonicalName ?? pmRecords[0].name,
    aggregated,
    members,
    stateCodes,
  };
}

/** Lightweight existence + multi-market check used by the per-
 *  market scorecard to decide whether to render the "← View
 *  operator-level scorecard" back-link. Skips the heavy data
 *  pull when only the count + name are needed. */
export async function getCanonicalSummary(
  canonicalSlug: string
): Promise<{ canonicalSlug: string; canonicalName: string; marketCount: number } | null> {
  const row = await prisma.canonicalOperator.findUnique({
    where: { canonicalSlug },
    select: { canonicalSlug: true, canonicalName: true, marketCount: true },
  });
  if (!row) return null;
  return row;
}
