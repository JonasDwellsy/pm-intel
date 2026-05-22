// Human-readable rendering of a single FilterCriterion. Used by
// the v0.12 Excel export's Summary sheet to produce sentence-form
// criterion lines ("Operator type is SFR Independent",
// "Footprint growth (year-over-year) is at least 0%"). Pure —
// safe to call from a server component or a client export module.
//
// The pieces it composes already exist in the codebase:
//   - FIELD_REGISTRY[id].label       → the field's display name
//   - OPERATOR_LABELS[operator]      → the operator phrase ("is",
//                                      "is at least", "between",
//                                      "contains", ...)
//   - renderCriterionValue()         → value-side formatting
//                                      (handles arrays, between,
//                                      decimal-percent fields)
// This module composes them into one string + adds the preferred-
// criterion weight callout, since that's an export-specific need.

import {
  FIELD_REGISTRY,
  type FilterCriterion,
  type WeightedCriterion,
} from "./fields";
import { OPERATOR_LABELS } from "./editor-options";

/** Fields whose stored value is a 0..1 decimal but should display
 *  as a percentage. Mirrors the editor-options.ts DECIMAL_PERCENT_
 *  FIELDS set; kept private here to avoid an export from that
 *  module just for one consumer. */
const DECIMAL_PERCENT_FIELDS = new Set<string>([
  "concessionRate",
  "concessionTrajectory",
  "listingTrajectoryYoY",
  "rentPerformanceYoY",
]);

/** Render the value side of a criterion. Handles arrays
 *  (in / notIn), between pairs, decimal-percent display, and
 *  boolean Yes/No. Returns "—" for null / undefined. */
function renderValue(criterion: FilterCriterion): string {
  const v = criterion.value;
  const fieldId = criterion.field;
  const isPercent = DECIMAL_PERCENT_FIELDS.has(fieldId);

  const scalePct = (n: number) => Math.round(n * 10000) / 100; // 0.05 → 5

  if (v === null || v === undefined) return "—";

  // Between → [low, high] (with possible null in either slot)
  if (criterion.operator === "between" && Array.isArray(v)) {
    const [a, b] = v as [number | null, number | null];
    const fmt = (n: number | null) => {
      if (n === null) return "—";
      return isPercent ? `${scalePct(n)}%` : String(n);
    };
    return `${fmt(a)} and ${fmt(b)}`;
  }

  // in / notIn → array of values; join with commas
  if (Array.isArray(v)) {
    return (v as Array<string | number>).map(String).join(", ");
  }

  // Boolean fields render as Yes / No.
  const entry = FIELD_REGISTRY[fieldId];
  if (entry?.type === "boolean") return v ? "yes" : "no";

  // Numeric percent field.
  if (typeof v === "number" && isPercent) return `${scalePct(v)}%`;

  return String(v);
}

/** Compose a one-line human-readable description of a criterion.
 *  Format: "{Field label} {operator phrase} {value}".
 *
 *  When a weight is present (preferred criteria), an optional
 *  ` (weight: 0.30)` suffix is appended so the Summary sheet
 *  shows the relative pull of each preferred criterion. */
export function formatCriterion(criterion: FilterCriterion | WeightedCriterion): string {
  const entry = FIELD_REGISTRY[criterion.field];
  const fieldLabel = entry?.label ?? criterion.field;
  const opLabel = OPERATOR_LABELS[criterion.operator] ?? criterion.operator;
  const value = renderValue(criterion);
  const base = `${fieldLabel} ${opLabel} ${value}`;
  const weight = "weight" in criterion && typeof criterion.weight === "number"
    ? criterion.weight
    : null;
  if (weight !== null) {
    return `${base} (weight: ${weight})`;
  }
  return base;
}
