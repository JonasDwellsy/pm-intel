// v0.8 — Watch List field registry.
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
// record. The v0.8 portfolio estimator's output lives at
// scorecard.portfolioEstimate = {status, point, low, high, cohort,
// methodologyVersion} (baked at seed time in prisma/seed.ts; the
// low/high turnover band is seeded as of v0.8.1).

import type { ScorecardData } from "@/lib/types";
import { managementModelLabel } from "@/lib/management-model/resolve";
import { SIZE_BANDS, sizeBandFor } from "@/lib/operator-size-bands";

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
  | [number, number]
  // Editor in-flight shapes. The watch-list editor lets a number input
  // be cleared (Issue 2), and a `between` pair can be partially
  // filled in. `null` and `[null, null]` mark "user hasn't entered
  // anything yet" — the scoring path skips these via
  // isCriterionComplete() so they don't drop the live match count.
  | null
  | [number | null, number | null];

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
  /** Keep this field OUT of the builder's field picker while still
   *  evaluating it. Used to retire a field without changing what saved
   *  watch lists return: a client list built on a precise portfolio
   *  threshold keeps matching exactly the operators it always did, but
   *  no NEW list can be built that way. Silently changing a saved list's
   *  meaning is worse than carrying a hidden field. */
  hiddenFromBuilder?: boolean;
  /** Ordinal number fields whose legal values are a fixed, ordered set
   *  (today: the size bands). The editor renders a labelled select
   *  instead of a free-text number box, and stores the option's numeric
   *  value — so gte/lte/between keep working and "at least this size"
   *  stays expressible, which a label multi-select can't do. */
  ordinalOptions?: Array<{ value: number; label: string }>;
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

// ─── the registry ──────────────────────────────────────────────────

export const FIELD_REGISTRY: Record<string, FieldRegistryEntry> = {
  // ── Geographic ────────────────────────────────────────────────
  marketIds: {
    id: "marketIds",
    label: "Markets",
    description: "The MSAs where the operator has listings. Multi-select.",
    category: "geographic",
    type: "enum",
    validOperators: ["eq", "ne", "in", "notIn"],
    getValueFromPM: (pm) => pm.marketId,
    // Editor populates from prisma.market.findMany at render time;
    // listing the slug shape here keeps the contract explicit.
  },
  marketCount: {
    id: "marketCount",
    label: "Number of markets",
    description: "How many distinct markets the operator appears in (1 = single-market).",
    category: "geographic",
    type: "number",
    validOperators: ["eq", "ne", "gte", "lte", "between"],
    getValueFromPM: (pm) => pm.marketCount,
  },
  topCityConcentration: {
    id: "topCityConcentration",
    label: "Density in primary city",
    description:
      "What share of the operator's units sits in their largest city. Higher = more focused; lower = scattered across multiple cities.",
    category: "geographic",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) =>
      pm.scorecard.geographicCoverage?.topCities?.[0]?.pct ?? null,
  },

  // ── Scale ─────────────────────────────────────────────────────
  portfolioSizeBand: {
    id: "portfolioSizeBand",
    label: "Estimated size band",
    description:
      "The operator's estimated managed-unit band (<50 through 1,600+). Calibration against operator-reported counts showed the point estimate runs materially low for apartment-heavy operators, and that the residual is coverage — units never listed with Dwellsy — which no multiplier recovers. Filtering by band states a claim the data supports; filtering by an exact number does not.",
    category: "scale",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    // The STORED value is the band's index, not its label or its unit
    // count — that is what keeps the comparison ordinal, so "at least
    // 400–800" is one selection rather than four ticked boxes.
    ordinalOptions: SIZE_BANDS.map((b, i) => ({ value: i, label: b.label })),
    // Banding the point (which sizeBandFor display-rounds first) is also
    // what keeps the filter honest: comparing the RAW point meant a list
    // set to "at least 1,600" excluded an operator at 1,599.4 whose
    // scorecard, PDF, and peer table all read "1,600+".
    getValueFromPM: (pm) => {
      const band = sizeBandFor(pm.scorecard.portfolioEstimate?.point);
      return band ? SIZE_BANDS.indexOf(band) : null;
    },
  },
  estimatedPortfolioPoint: {
    id: "estimatedPortfolioPoint",
    label: "Estimated portfolio (median)",
    description:
      "Estimated total managed units (point estimate). Derived from observed URUs T12 via the unit-type turnover model (house URUs × 3.3 + apartment URUs × 2.6). Superseded by Estimated size band; retained so saved watch lists keep matching what they always matched.",
    category: "scale",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    hiddenFromBuilder: true,
    getValueFromPM: (pm) => pm.scorecard.portfolioEstimate?.point ?? null,
  },
  estimatedPortfolioLow: {
    id: "estimatedPortfolioLow",
    label: "Portfolio estimate (low end)",
    description:
      "Conservative estimate of total managed units — the low end of the turnover-range band (slower-turnover multipliers). Retired from the builder: the size band already states the uncertainty, and offering both invites two contradictory precision claims.",
    category: "scale",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    hiddenFromBuilder: true,
    getValueFromPM: (pm) => pm.scorecard.portfolioEstimate?.low ?? null,
  },
  estimatedPortfolioHigh: {
    id: "estimatedPortfolioHigh",
    label: "Portfolio estimate (high end)",
    description:
      "Optimistic estimate of total managed units — the high end of the turnover-range band (faster-turnover multipliers). Retired from the builder: the size band already states the uncertainty, and offering both invites two contradictory precision claims.",
    category: "scale",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    hiddenFromBuilder: true,
    getValueFromPM: (pm) => pm.scorecard.portfolioEstimate?.high ?? null,
  },
  urusT12: {
    id: "urusT12",
    label: "Unique units listed (last 12 months)",
    description:
      "Distinct units that the operator listed at least once during the trailing 12 months. Dwellsy's identity layer collapses re-listings of the same unit.",
    category: "scale",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.coverage?.urusT12 ?? null,
  },

  // ── Asset ─────────────────────────────────────────────────────
  quadrant7Cell: {
    id: "quadrant7Cell",
    label: "Operator type",
    description:
      "The operator's asset-class + scale category in Dwellsy's 7-cell taxonomy (SFR Independent, SFR Institutional, Small/Large MF/BTR Independent/Institutional, Hybrid).",
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
  managementModel: {
    id: "managementModel",
    label: "Management model",
    description:
      "Whether the operator likely manages third-party properties (hireable), owns its own, or is undetermined. Inferred — see methodology.",
    category: "asset",
    type: "enum",
    validOperators: ["eq", "ne", "in", "notIn"],
    getValueFromPM: (pm) =>
      managementModelLabel(pm.scorecard.managementModel?.model ?? "unknown"),
    enumOptions: ["Third-party manager", "Owner-operator (likely)", "Unknown"],
  },
  institutional: {
    id: "institutional",
    label: "Institutional operator?",
    description:
      "Whether the operator classifies as institutional (managed by a fund or REIT, vs an independent operator).",
    category: "asset",
    type: "boolean",
    validOperators: ["eq", "ne"],
    getValueFromPM: (pm) => pm.scorecard.pm.institutional ?? null,
  },
  hybrid: {
    id: "hybrid",
    label: "Mixed-asset operator?",
    description:
      "Whether the operator manages a mix of asset classes (SFR + MF, etc.) rather than a pure-play single asset class.",
    category: "asset",
    type: "boolean",
    validOperators: ["eq", "ne"],
    getValueFromPM: (pm) => pm.scorecard.pm.hybrid ?? null,
  },

  // ── Trajectory / Quality ──────────────────────────────────────
  listingTrajectoryYoY: {
    id: "listingTrajectoryYoY",
    label: "Footprint growth (year-over-year)",
    description:
      "Year-over-year growth in the operator's listing volume. Positive = growing footprint; negative = shrinking.",
    category: "trajectory",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => listingTrajectoryYoY(pm),
  },
  concessionRate: {
    id: "concessionRate",
    label: "Concession frequency",
    description:
      "Share of the operator's listings that include a concession (free month, waived fee, etc.) in the trailing 12 months.",
    category: "trajectory",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.concessionRate ?? null,
  },
  daysOnMarketT12: {
    id: "daysOnMarketT12",
    label: "Lease-up speed (median DOM)",
    description:
      "Median number of days the operator's units sit on market before leasing. Lower typically indicates stronger demand or better pricing.",
    category: "trajectory",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.performance?.domT12 ?? null,
  },
  rentPerformanceYoY: {
    id: "rentPerformanceYoY",
    label: "Rent performance vs market (YoY)",
    description:
      "Operator's year-over-year rent growth minus the same-type cohort median, as a decimal (e.g. 0.02 = +2 pp; positive = beating the market, negative = lagging).",
    category: "trajectory",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.rentPerformance?.delta ?? null,
  },
  retention18Pct: {
    id: "retention18Pct",
    label: "Tenant retention (% reaching 1.5 yrs)",
    description:
      "Share of the operator's tenancies that reach 18 months (Kaplan-Meier survival). Higher = stickier tenants. No value for operators whose retention is suppressed for insufficient turnover data.",
    category: "trajectory",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.tenancy?.retention18Pct ?? null,
  },
  marketingScore: {
    id: "marketingScore",
    label: "Marketing score",
    description:
      "Listing-quality / marketing-discipline score (0–100): a weighted blend of completeness, amenities, description richness, and photos.",
    category: "trajectory",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.marketing?.compositeScore ?? null,
  },

  // ── Operator characteristics ──────────────────────────────────
  monthsOnPlatform: {
    id: "monthsOnPlatform",
    label: "Platform tenure",
    description:
      "How many months Dwellsy has been tracking this operator. Longer tenure typically means more data confidence.",
    category: "operator",
    type: "number",
    validOperators: ["gte", "lte", "between"],
    getValueFromPM: (pm) => pm.scorecard.coverage?.monthsOnPlatform ?? null,
  },
  claimed: {
    id: "claimed",
    label: "Verified profile",
    description:
      "Whether the operator has verified their own profile via the Dwellsy claim flow.",
    category: "operator",
    type: "boolean",
    validOperators: ["eq", "ne"],
    getValueFromPM: (pm) => pm.claimed,
  },
  canonicalOperatorId: {
    id: "canonicalOperatorId",
    label: "Parent brand",
    description:
      "The unified parent brand for multi-market operators. E.g., 'Pure Property Management of Tennessee' and 'Pure Property Management of Arizona' share one canonical operator.",
    category: "operator",
    type: "string",
    validOperators: ["eq", "ne", "in", "notIn"],
    getValueFromPM: (pm) => pm.scorecard.canonicalOperatorId ?? null,
  },
  name: {
    id: "name",
    label: "Operator name",
    description:
      "Display name. Useful for `contains` substring matching in excluded criteria.",
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
    // Retired fields stay in the registry so saved watch lists keep
    // evaluating, but never appear in the builder's picker — nobody can
    // create a NEW list on a precise portfolio number.
    if (entry.hiddenFromBuilder) continue;
    out[entry.category].push(entry);
  }
  return out;
}
