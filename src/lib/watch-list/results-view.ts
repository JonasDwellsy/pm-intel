// Results-view adapter. Bridges runtime apply() output to the
// data the ranked-results table renders.
//
// v0.9 widens this module to handle both views the table toggles
// between:
//   - Market view  (RankedTarget → projectMarketRow) — the v0.8
//                  behavior, one row per PM-market pair.
//   - Operator view (RolledUpTarget → projectOperatorRow) — one
//                  row per canonical operator with members listed
//                  for the multi-market badge + drill-through.
//
// Both projections produce the same ResultRowVM shape so the table
// component switches purely on which list it renders. The shape
// carries the full PMRecord (or AggregatedPMRecord) so the table's
// adaptive columns can call FIELD_REGISTRY[fieldId].getValueFromPM
// to populate per-criterion columns without an extra projection
// pass per column.

import { stateCodeToSlug, citySlug } from "@/lib/slugify";
import {
  FIELD_REGISTRY,
  type FilterOperator,
  type FilterValue,
  type PMRecord,
} from "./fields";
import { OPERATOR_LABELS } from "./editor-options";
import type { RankedTarget, RolledUpTarget } from "./apply";

export interface BreakdownEntryVM {
  field: string;
  label: string;
  operator: FilterOperator;
  operatorLabel: string;
  passed: boolean;
  weight: number | null;
  contribution: number | null;
  weightPct: number | null;
}

export interface DrillTarget {
  pmSlug: string;
  marketId: string;
  /** Short label for the market picker buttons — derived from the
   *  city portion of the market full name (e.g. "Birmingham-Hoover"
   *  out of "Birmingham-Hoover, AL MSA"). */
  marketShort: string;
  /** Full market label for hover / a11y. */
  marketName: string;
  href: string;
}

export interface ResultRowVM {
  rank: number;
  /** Stable React key — canonical id for rollups, "{slug}-{market}"
   *  for per-market rows. */
  id: string;
  name: string;
  /** v0.11 — populated for rolled-up multi-market operator rows so
   *  the View → picker can offer "View operator scorecard" as the
   *  primary action. Null for per-market and single-market rows
   *  where the operator scorecard would be redundant with the
   *  per-market scorecard. */
  operatorScorecardHref: string | null;
  /** True for multi-market rolled-up rows (drives the "Multi-market"
   *  pill + the View → market picker). */
  isMultiMarket: boolean;
  marketCount: number;
  /** Human-readable market column content — comma-joined city
   *  names for rollups, single market for per-market rows. */
  marketLabel: string;
  quadrant7Cell: string | null;
  /** True only when the rolled-up modal hides at least one disagree-
   *  ing member; UI surfaces a "mixed" badge next to the cell. */
  quadrant7CellIsMixed: boolean;
  estimatedPortfolioPoint: number | null;
  estimatedPortfolioLow: number | null;
  estimatedPortfolioHigh: number | null;
  estimatedPortfolioConfidence: string | null;
  urusT12: number | null;
  listingTrajectoryYoY: number | null;
  concessionRate: number | null;
  fitScore: number;
  /** PMRecord the adaptive-column cells read from. */
  pm: PMRecord;
  preferredBreakdown: BreakdownEntryVM[];
  requiredBreakdown: BreakdownEntryVM[];
  excludedBreakdown: BreakdownEntryVM[];
  preferredPassedCount: number;
  preferredTotalCount: number;
  /** Drill-through targets. Single entry for per-market or single-
   *  market operator; multiple for rolled-up multi-market (the
   *  View → button opens a picker). */
  drillTargets: DrillTarget[];
}

export interface ResultsViewSummary {
  totalCandidates: number;
  totalOperators: number;
  matchedCount: number;
  matchedOperatorCount: number;
  scoreMin: number | null;
  scoreMax: number | null;
  scoreMinOperator: number | null;
  scoreMaxOperator: number | null;
  generatedAt: string;
}

// ─── projection ───────────────────────────────────────────────────

interface ProjectArgs {
  marketResults: RankedTarget[];
  operatorResults: RolledUpTarget[];
  watchListId: string;
  totalCandidates: number;
  totalOperators: number;
  matchedCount: number;
  matchedOperatorCount: number;
  generatedAt: string;
}

export function projectResultsForView(args: ProjectArgs): {
  marketRows: ResultRowVM[];
  operatorRows: ResultRowVM[];
  summary: ResultsViewSummary;
} {
  const marketRows = args.marketResults.map((r, idx) =>
    projectMarketRow(r, idx + 1, args.watchListId)
  );
  const operatorRows = args.operatorResults.map((r, idx) =>
    projectOperatorRow(r, idx + 1, args.watchListId)
  );

  const marketScores = marketRows.map((r) => r.fitScore);
  const operatorScores = operatorRows.map((r) => r.fitScore);

  return {
    marketRows,
    operatorRows,
    summary: {
      totalCandidates: args.totalCandidates,
      totalOperators: args.totalOperators,
      matchedCount: args.matchedCount,
      matchedOperatorCount: args.matchedOperatorCount,
      scoreMin: marketScores.length > 0 ? Math.min(...marketScores) : null,
      scoreMax: marketScores.length > 0 ? Math.max(...marketScores) : null,
      scoreMinOperator:
        operatorScores.length > 0 ? Math.min(...operatorScores) : null,
      scoreMaxOperator:
        operatorScores.length > 0 ? Math.max(...operatorScores) : null,
      generatedAt: args.generatedAt,
    },
  };
}

function projectMarketRow(
  r: RankedTarget,
  rank: number,
  watchListId: string
): ResultRowVM {
  const sc = r.pm.scorecard;
  const stateCode = sc.market?.state ?? null;
  const cityName = sc.market?.name ?? null;
  const href = scorecardHref(r.pmSlug, stateCode, cityName, watchListId);

  return {
    rank,
    id: `${r.pmSlug}-${r.marketId}`,
    name: r.name,
    isMultiMarket: r.pm.marketCount > 1, // canonical roll-up count
    marketCount: r.pm.marketCount,
    marketLabel: r.marketName,
    quadrant7Cell: sc.pm?.quadrant7Cell ?? null,
    quadrant7CellIsMixed: false,
    estimatedPortfolioPoint: sc.portfolioEstimate?.point ?? null,
    estimatedPortfolioLow: sc.portfolioEstimate?.low ?? null,
    estimatedPortfolioHigh: sc.portfolioEstimate?.high ?? null,
    estimatedPortfolioConfidence: sc.portfolioEstimate?.confidence ?? null,
    urusT12: sc.coverage?.urusT12 ?? null,
    listingTrajectoryYoY: computeYoY(
      sc.t12ListingsCount,
      sc.t24t12ListingsCount
    ),
    concessionRate: sc.concessionRate ?? null,
    fitScore: r.fitScore,
    pm: r.pm,
    preferredBreakdown: projectBreakdown(r.breakdown.preferred, true),
    requiredBreakdown: projectBreakdown(r.breakdown.required, false),
    excludedBreakdown: projectBreakdown(r.breakdown.excluded, false),
    preferredPassedCount: r.breakdown.preferred.filter((e) => e.passed).length,
    preferredTotalCount: r.breakdown.preferred.length,
    // Per-market rows don't expose an operator-scorecard link — the
    // per-market scorecard at `href` is the natural drill target.
    operatorScorecardHref: null,
    drillTargets: [
      {
        pmSlug: r.pmSlug,
        marketId: r.marketId,
        marketShort: cityShort(r.marketName),
        marketName: r.marketName,
        href,
      },
    ],
  };
}

function projectOperatorRow(
  r: RolledUpTarget,
  rank: number,
  watchListId: string
): ResultRowVM {
  const sc = r.pm.scorecard;

  // Build drill targets — one per member market, using each member's
  // scorecard for the state + city the URL needs.
  const drillTargets: DrillTarget[] = r.pm.members.map((m) => {
    const stateCode = m.scorecard.market?.state ?? null;
    const cityName = m.scorecard.market?.name ?? null;
    const fullName = m.scorecard.market?.fullName ?? m.marketId;
    return {
      pmSlug: m.slug,
      marketId: m.marketId,
      marketShort: cityShort(fullName),
      marketName: fullName,
      href: scorecardHref(m.slug, stateCode, cityName, watchListId),
    };
  });

  const marketLabel = r.isRollup
    ? drillTargets.map((d) => d.marketShort).join(", ")
    : drillTargets[0]?.marketName ?? "";

  // Multi-market rollups get the operator-scorecard primary action;
  // single-market operators in the operator view don't (drill goes
  // straight to the one underlying per-market scorecard).
  const operatorScorecardHref = r.isRollup
    ? `/operators/${encodeURIComponent(r.canonicalOperatorId)}?fromWatchList=${encodeURIComponent(watchListId)}`
    : null;

  return {
    rank,
    id: r.canonicalOperatorId,
    name: r.canonicalOperatorName,
    operatorScorecardHref,
    isMultiMarket: r.isRollup,
    marketCount: r.memberMarketIds.length,
    marketLabel,
    quadrant7Cell: sc.pm?.quadrant7Cell ?? null,
    quadrant7CellIsMixed: r.quadrant7CellIsMixed,
    estimatedPortfolioPoint: sc.portfolioEstimate?.point ?? null,
    estimatedPortfolioLow: sc.portfolioEstimate?.low ?? null,
    estimatedPortfolioHigh: sc.portfolioEstimate?.high ?? null,
    estimatedPortfolioConfidence: sc.portfolioEstimate?.confidence ?? null,
    urusT12: sc.coverage?.urusT12 ?? null,
    listingTrajectoryYoY: computeYoY(
      sc.t12ListingsCount,
      sc.t24t12ListingsCount
    ),
    concessionRate: sc.concessionRate ?? null,
    fitScore: r.fitScore,
    pm: r.pm,
    preferredBreakdown: projectBreakdown(r.breakdown.preferred, true),
    requiredBreakdown: projectBreakdown(r.breakdown.required, false),
    excludedBreakdown: projectBreakdown(r.breakdown.excluded, false),
    preferredPassedCount: r.breakdown.preferred.filter((e) => e.passed).length,
    preferredTotalCount: r.breakdown.preferred.length,
    drillTargets,
  };
}

function projectBreakdown(
  entries: ReadonlyArray<{
    field: string;
    operator: FilterOperator;
    passed: boolean;
    weight?: number;
    contribution?: number;
  }>,
  withWeights: boolean
): BreakdownEntryVM[] {
  const totalWeight = withWeights
    ? entries.reduce((s, e) => s + (e.weight ?? 0), 0)
    : 0;
  return entries.map((e) => ({
    field: e.field,
    label: FIELD_REGISTRY[e.field]?.label ?? e.field,
    operator: e.operator,
    operatorLabel: OPERATOR_LABELS[e.operator],
    passed: e.passed,
    weight: e.weight ?? null,
    contribution: e.contribution ?? null,
    weightPct:
      withWeights && totalWeight > 0 && typeof e.weight === "number"
        ? Math.round((e.weight / totalWeight) * 1000) / 10
        : null,
  }));
}

// ─── helpers ──────────────────────────────────────────────────────

function scorecardHref(
  pmSlug: string,
  stateCode: string | null,
  cityName: string | null,
  watchListId: string
): string {
  return stateCode && cityName
    ? `/property-managers/${stateCodeToSlug(stateCode)}/${citySlug(cityName)}/${pmSlug}?fromWatchList=${encodeURIComponent(watchListId)}`
    : `/property-managers?fromWatchList=${encodeURIComponent(watchListId)}`;
}

function computeYoY(
  t12: number | null | undefined,
  t24t12: number | null | undefined
): number | null {
  if (typeof t12 !== "number" || typeof t24t12 !== "number" || t24t12 === 0)
    return null;
  return (t12 - t24t12) / t24t12;
}

/** Derive a short market label from the market's full name. Takes
 *  the city portion before the first comma ("Birmingham-Hoover, AL
 *  MSA" → "Birmingham-Hoover"). Falls back to the raw input if no
 *  comma is found. */
function cityShort(fullName: string): string {
  const idx = fullName.indexOf(",");
  return idx > 0 ? fullName.slice(0, idx) : fullName;
}

/** Render a stored FilterValue back to a human-readable string for
 *  the breakdown popover. */
export function renderCriterionValue(
  value: FilterValue,
  fieldId: string
): string {
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((v) => typeof v === "number")) {
      return `${value[0]}–${value[1]}`;
    }
    return (value as Array<string | number>).join(", ");
  }
  if (value === null) return "—";
  const entry = FIELD_REGISTRY[fieldId];
  if (entry?.type === "boolean") return value ? "yes" : "no";
  return String(value);
}
