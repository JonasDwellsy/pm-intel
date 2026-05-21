// v0.8 — Buy Box field registry.
//
// One row per filterable field. Each entry pins:
//   - The stored id (what gets serialized into the criterion JSON).
//   - The human label and category (used by the editor UI in PR #2).
//   - The runtime accessor (getValueFromPM) that turns a PMRecord
//     into the concrete value the evaluator compares against.
//   - The list of operators that make sense for the field's data
//     type (the editor uses this to render the right control).
//   - Enum options (for fields with a closed value set, e.g.
//     quadrant7Cell — drives a multi-select in the editor).
//
// PMRecord is the shape the evaluator + scoring layer operate on.
// It's the parsed scorecard JSON plus a few row-level fields from
// the PM table (claimed, marketCount) that don't live inside the
// stored scorecard blob. apply.ts builds this shape from the
// database before iterating with the evaluator.
//
// Field paths verified against the live seed JSON shape — every
// getValueFromPM below pulls from a path that exists on a real PM
// record in src/data/scorecard_data.json. The v0.7 portfolio
// estimator's output lives at scorecard.portfolioEstimate (baked
// at seed time per buildScorecard in prisma/seed.ts).

import type { ScorecardData } from "@/lib/types";

// ─── operator types ────────────────────────────────────────────────

export type FilterOperator =
  | "eq"
  | "ne"
  | "in"
  | "notIn"
  | "gte"
  | "lte"
  | "between"
  | "contains";

export type FilterValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | [number, number];

export interface FilterCriterion {
  field: string;
  operator: FilterOperator;
  value: FilterValue;
}

export interface WeightedCriterion extends FilterCriterion {
  /** 0..1 — relative weight of this preferred criterion in the fit
   *  score. Normalized against the total weight of all preferred
   *  criteria at scoring time, so absolute values don't have to sum
   *  to anything particular. */
  weight: number;
}

// ─── PMRecord (the shape filters evaluate against) ─────────────────

/** The merged view of a PM that the evaluator operates on. apply.ts
 *  builds this from the prisma row + the parsed scorecardData JSON.
 *  Field paths match the getValueFromPM accessors below. */
export interface PMRecord {
  // Identity / row-level
  slug: string;
  name: string;
  marketId: string;
  /** From the PM table row — NOT in scorecardData. apply.ts injects. */
  claimed: boolean;
  /** Count of distinct covered markets this canonical operator appears
   *  in. apply.ts derives by looking up the canonical entity. */
  marketCount: number;

  // Pulled from the parsed scorecardData blob
  scorecard: ScorecardData;
}

// ─── field categories ──────────────────────────────────────────────

export type FieldCategory =
  | "geographic"
  | "scale"
  | "asset"
  | "trajectory"
  | "operator";

export type FieldType = "string" | "number" | "boolean" | "enum";

export interface FieldRegistryEntry {
  id: string;
  label: string;
  description: string;
  category: FieldCategory;
  type: FieldType;
  /** Operators allowed by the editor. Evaluator will still happily
   *  apply any operator at runtime if a client sneaks one through —
   *  this is editor-side guard rails, not a hard constraint. */
  validOperators: FilterOperator[];
  /** Pull the underlying value off a PMRecord. Returning null / undefined
   *  is allowed; the evaluator treats those as "criterion fails by
   *  default" per the spec. */
  getValueFromPM: (pm: PMRecord) => string | number | boolean | string[] | null | undefined;
  /** Closed-set option list for enum fields (e.g. quadrant7Cell). The
   *  editor renders a multi-select keyed on these; ignored at runtime. */
  enumOptions?: string[];
}

// ─── helper accessors ──────────────────────────────────────────────

/** Year-over-year listing trajectory derived from t12 vs t24t12.
 *  Returns null when the prior window is missing or zero (a "newly
 *  in coverage" operator can't have a meaningful YoY value yet). */
function listingTrajectoryYoY(pm: PMRecord): number | null {
  const t12 = pm.scorecard.t12ListingsCount;
  const t24 = pm.scorecard.t24t12ListingsCount;
  if (typeof t12 !== "number" || typeof t24 !== "number" || t24 === 0) return null;
  return (t12 - t24) / t24;
}

/** Concession trajectory — placeholder until the data layer carries a
 *  pre-computed delta. v0.6.4 Patch 2 only shipped the spot-rate; the
 *  trajectory comparison waits on a second data window. Returns null
 *  so the criterion fails-by-default until the upstream field lands. */
function concessionTrajectory(_pm: PMRecord): number | null {
  return null;
}

// ─── the registry ──────────────────────────────────────────────────

export const FIELD_REGISTRY: Record<string, FieldRegistryEntry> = {
  // ── Geographic ────────────────────────────────────────────────
  marketIds: {
    id: "marketIds",
    label: "Markets",
    description: "Which of the covered MSAs the operator appears in.",
    category: "geographic",
    type: "enum",
    validOperators: ["eq", "ne", "in", "notIn"],
    getValueFromPM: (pm) => pm.marketId,
    // Editor populates from prisma.market.findMany at render time;
    // listing the slug shape here keeps the contract explicit.
  },
  marketCount: {
    id: "marketCount",
    label: "Market count",
    description: "How many distinct covered markets this operator appears in (canonical roll-up).",
    category: "geographic",
    type: "number",
    validOperators: ["eq", "ne", "gte", "lte", "between"],
    getValueFromPM: (pm) => pm.marketCount,
  },
  topCityConcentration: {
    id: "topCityConcentration",
    label: "Top city concentration",
    description: "Share of the operator's inventory in their single biggest city (0-100).",
    category: "geographic",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) =>
      pm.scorecard.geographicCoverage?.topCities?.[0]?.pct ?? null,
  },

  // ── Scale ─────────────────────────────────────────────────────
  estimatedPortfolioPoint: {
    id: "estimatedPortfolioPoint",
    label: "Estimated portfolio size (point)",
    description: "v0.7 portfolio size point estimate in total managed units.",
    category: "scale",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.portfolioEstimate?.point ?? null,
  },
  estimatedPortfolioLow: {
    id: "estimatedPortfolioLow",
    label: "Estimated portfolio size (P25, conservative)",
    description: "Bottom of the v0.7 portfolio confidence band.",
    category: "scale",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.portfolioEstimate?.low ?? null,
  },
  estimatedPortfolioHigh: {
    id: "estimatedPortfolioHigh",
    label: "Estimated portfolio size (P75, optimistic)",
    description: "Top of the v0.7 portfolio confidence band.",
    category: "scale",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.portfolioEstimate?.high ?? null,
  },
  urusT12: {
    id: "urusT12",
    label: "URUs (T12)",
    description: "Raw distinct units observed in the trailing 12 months — pre-estimator signal.",
    category: "scale",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.coverage?.urusT12 ?? null,
  },
  portfolioEstimateConfidence: {
    id: "portfolioEstimateConfidence",
    label: "Portfolio estimate confidence",
    description: "Calibration confidence tier on the estimator output.",
    category: "scale",
    type: "enum",
    validOperators: ["eq", "ne", "in", "notIn"],
    getValueFromPM: (pm) => pm.scorecard.portfolioEstimate?.confidence ?? null,
    enumOptions: ["Low", "Medium", "High"],
  },

  // ── Asset ─────────────────────────────────────────────────────
  quadrant7Cell: {
    id: "quadrant7Cell",
    label: "7-cell classification",
    description: "Dwellsy 7-cell operator taxonomy.",
    category: "asset",
    type: "enum",
    validOperators: ["eq", "ne", "in", "notIn"],
    getValueFromPM: (pm) => pm.scorecard.pm.quadrant7Cell ?? null,
    enumOptions: [
      "SFR Independent",
      "SFR Institutional",
      "Small MF/BTR Independent",
      "Small MF/BTR Institutional",
      "Large MF/BTR Independent",
      "Large MF/BTR Institutional",
      "Hybrid",
    ],
  },
  institutional: {
    id: "institutional",
    label: "Institutional flag",
    description: "Whether the operator classifies as institutional (scale axis).",
    category: "asset",
    type: "boolean",
    validOperators: ["eq", "ne"],
    getValueFromPM: (pm) => pm.scorecard.pm.institutional ?? null,
  },
  hybrid: {
    id: "hybrid",
    label: "Hybrid flag",
    description: "Whether the operator mixes asset classes (Hybrid 7-cell cell).",
    category: "asset",
    type: "boolean",
    validOperators: ["eq", "ne"],
    getValueFromPM: (pm) => pm.scorecard.pm.hybrid ?? null,
  },

  // ── Trajectory / Quality ──────────────────────────────────────
  listingTrajectoryYoY: {
    id: "listingTrajectoryYoY",
    label: "Listing trajectory YoY",
    description: "Year-over-year change in listing count — positive means growing share.",
    category: "trajectory",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => listingTrajectoryYoY(pm),
  },
  concessionRate: {
    id: "concessionRate",
    label: "Concession rate",
    description: "Share of T12 listings that mention concessions (0-1 decimal).",
    category: "trajectory",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.concessionRate ?? null,
  },
  concessionTrajectory: {
    id: "concessionTrajectory",
    label: "Concession trajectory",
    description: "Period-over-period change in concession rate. Returns null until the data layer carries a delta window.",
    category: "trajectory",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => concessionTrajectory(pm),
  },
  daysOnMarketT12: {
    id: "daysOnMarketT12",
    label: "Days on market (T12)",
    description: "Median days to lease, trailing 12 months.",
    category: "trajectory",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.performance?.domT12 ?? null,
  },
  rentPerformanceYoY: {
    id: "rentPerformanceYoY",
    label: "Rent performance YoY",
    description: "Operator-level YoY rent change vs cohort.",
    category: "trajectory",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.rentPerformance?.pmYoyChange ?? null,
  },

  // ── Operator characteristics ──────────────────────────────────
  monthsOnPlatform: {
    id: "monthsOnPlatform",
    label: "Months on platform",
    description: "How long Dwellsy has been tracking this operator — tenure / stability proxy.",
    category: "operator",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.coverage?.monthsOnPlatform ?? null,
  },
  claimed: {
    id: "claimed",
    label: "Profile claimed",
    description: "Whether the operator has claimed and verified their Dwellsy IQ profile.",
    category: "operator",
    type: "boolean",
    validOperators: ["eq", "ne"],
    getValueFromPM: (pm) => pm.claimed,
  },
  canonicalOperatorId: {
    id: "canonicalOperatorId",
    label: "Canonical operator",
    description: "Multi-market canonical entity id. Use with notIn to exclude all PMs under a given canonical operator.",
    category: "operator",
    type: "string",
    validOperators: ["eq", "ne", "in", "notIn"],
    getValueFromPM: (pm) => pm.scorecard.canonicalOperatorId ?? null,
  },
  name: {
    id: "name",
    label: "Operator name",
    description: "Display name. Useful for `contains` substring matching in excluded criteria.",
    category: "operator",
    type: "string",
    validOperators: ["eq", "ne", "contains"],
    getValueFromPM: (pm) => pm.name,
  },
};

/** Convenience for the evaluator: look up a field by id and call its
 *  accessor. Returns undefined when the field id isn't in the
 *  registry — caller decides whether that's a soft fail or an error. */
export function getPMValueForField(
  pm: PMRecord,
  fieldId: string
): string | number | boolean | string[] | null | undefined {
  const entry = FIELD_REGISTRY[fieldId];
  if (!entry) return undefined;
  return entry.getValueFromPM(pm);
}

/** All registry entries grouped by category — used by the future
 *  editor UI to render the field picker. */
export function listFieldsByCategory(): Record<FieldCategory, FieldRegistryEntry[]> {
  const out: Record<FieldCategory, FieldRegistryEntry[]> = {
    geographic: [],
    scale: [],
    asset: [],
    trajectory: [],
    operator: [],
  };
  for (const entry of Object.values(FIELD_REGISTRY)) {
    out[entry.category].push(entry);
  }
  return out;
}
