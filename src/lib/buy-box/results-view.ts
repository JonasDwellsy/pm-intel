// Results-view adapter. Bridges the runtime apply() result to the
// data the ranked-results table renders. Two responsibilities:
//
//   1. Project each RankedTarget into a flat view-model with all
//      the cell values the table needs (so the React layer doesn't
//      reach into pm.scorecard.* in JSX).
//   2. Build human-readable breakdown entries for the fit-score
//      popover — pairs the per-criterion entry from the scoring
//      engine with the field-registry label.
//
// Pure module: no React, no I/O. The page component imports
// projectResultsForView() at request time, hands the view models
// to the client table.

import { stateCodeToSlug, citySlug } from "@/lib/slugify";
import {
  FIELD_REGISTRY,
  type FilterOperator,
  type FilterValue,
} from "./fields";
import { OPERATOR_LABELS } from "./editor-options";
import type { RankedTarget } from "./apply";

export interface BreakdownEntryVM {
  field: string;
  label: string;
  operator: FilterOperator;
  operatorLabel: string;
  passed: boolean;
  /** Preferred only — weight + contribution. null for required/excluded. */
  weight: number | null;
  contribution: number | null;
  /** Weight as a 0-100 percentage of the total preferred weight,
   *  pre-computed here so the popover can render directly. */
  weightPct: number | null;
}

export interface ResultRowVM {
  rank: number;
  pmSlug: string;
  name: string;
  /** True when the canonical roll-up shows this operator in 2+ markets.
   *  Drives the "Multi-market" pill next to the name. */
  isMultiMarket: boolean;
  marketCount: number;
  marketName: string;
  marketId: string;
  /** "AZ" — 2-letter for badge / drill-through URL build. */
  stateCode: string | null;
  cityName: string | null;
  quadrant7Cell: string | null;
  /** Estimated portfolio point (units). null when no estimate. */
  estimatedPortfolioPoint: number | null;
  estimatedPortfolioLow: number | null;
  estimatedPortfolioHigh: number | null;
  estimatedPortfolioConfidence: string | null;
  urusT12: number | null;
  /** YoY decimal — 0.05 = +5%. null when prior window missing. */
  listingTrajectoryYoY: number | null;
  /** Decimal — 0.08 = 8%. */
  concessionRate: number | null;
  fitScore: number;
  /** Pre-built drill-through URL (with ?unlocked + ?fromBuyBox). */
  scorecardHref: string;
  /** Per-criterion breakdown rows, labeled, with weight%/contribution. */
  preferredBreakdown: BreakdownEntryVM[];
  requiredBreakdown: BreakdownEntryVM[];
  excludedBreakdown: BreakdownEntryVM[];
  preferredPassedCount: number;
  preferredTotalCount: number;
}

export interface ResultsViewSummary {
  totalCandidates: number;
  matchedCount: number;
  scoreMin: number | null;
  scoreMax: number | null;
  generatedAt: string;
}

export function projectResultsForView(
  results: RankedTarget[],
  buyBoxId: string,
  totalCandidates: number,
  generatedAt: string
): { rows: ResultRowVM[]; summary: ResultsViewSummary } {
  const rows: ResultRowVM[] = results.map((r, idx) => {
    const sc = r.pm.scorecard;
    const stateCode = sc.market?.state ?? null;
    const cityName = sc.market?.name ?? null;
    const scorecardHref =
      stateCode && cityName
        ? `/property-managers/${stateCodeToSlug(stateCode)}/${citySlug(cityName)}/${r.pmSlug}?unlocked=true&fromBuyBox=${encodeURIComponent(buyBoxId)}`
        : `/property-managers?fromBuyBox=${encodeURIComponent(buyBoxId)}`;

    // Pre-compute weight percentages so the popover doesn't have to
    // re-walk the breakdown to find the denominator.
    const totalWeight = r.breakdown.preferred.reduce(
      (sum, e) => sum + (e.weight ?? 0),
      0
    );
    const preferredBreakdown: BreakdownEntryVM[] = r.breakdown.preferred.map(
      (e) => ({
        field: e.field,
        label: FIELD_REGISTRY[e.field]?.label ?? e.field,
        operator: e.operator,
        operatorLabel: OPERATOR_LABELS[e.operator],
        passed: e.passed,
        weight: e.weight ?? null,
        contribution: e.contribution ?? null,
        weightPct:
          totalWeight > 0 && typeof e.weight === "number"
            ? Math.round((e.weight / totalWeight) * 1000) / 10
            : null,
      })
    );

    const requiredBreakdown: BreakdownEntryVM[] = r.breakdown.required.map(
      (e) => ({
        field: e.field,
        label: FIELD_REGISTRY[e.field]?.label ?? e.field,
        operator: e.operator,
        operatorLabel: OPERATOR_LABELS[e.operator],
        passed: e.passed,
        weight: null,
        contribution: null,
        weightPct: null,
      })
    );
    const excludedBreakdown: BreakdownEntryVM[] = r.breakdown.excluded.map(
      (e) => ({
        field: e.field,
        label: FIELD_REGISTRY[e.field]?.label ?? e.field,
        operator: e.operator,
        operatorLabel: OPERATOR_LABELS[e.operator],
        passed: e.passed,
        weight: null,
        contribution: null,
        weightPct: null,
      })
    );

    return {
      rank: idx + 1,
      pmSlug: r.pmSlug,
      name: r.name,
      isMultiMarket: r.pm.marketCount > 1,
      marketCount: r.pm.marketCount,
      marketName: r.marketName,
      marketId: r.marketId,
      stateCode,
      cityName,
      quadrant7Cell: sc.pm?.quadrant7Cell ?? null,
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
      scorecardHref,
      preferredBreakdown,
      requiredBreakdown,
      excludedBreakdown,
      preferredPassedCount: preferredBreakdown.filter((e) => e.passed).length,
      preferredTotalCount: preferredBreakdown.length,
    };
  });

  const scores = rows.map((r) => r.fitScore);
  return {
    rows,
    summary: {
      totalCandidates,
      matchedCount: rows.length,
      scoreMin: scores.length > 0 ? Math.min(...scores) : null,
      scoreMax: scores.length > 0 ? Math.max(...scores) : null,
      generatedAt,
    },
  };
}

function computeYoY(
  t12: number | null | undefined,
  t24t12: number | null | undefined
): number | null {
  if (typeof t12 !== "number" || typeof t24t12 !== "number" || t24t12 === 0)
    return null;
  return (t12 - t24t12) / t24t12;
}

/** Render a stored FilterValue back to a human-readable string for
 *  the breakdown popover (e.g. between [800, 5000] → "800–5000"). */
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
  const entry = FIELD_REGISTRY[fieldId];
  if (entry?.type === "boolean") return value ? "yes" : "no";
  return String(value);
}
