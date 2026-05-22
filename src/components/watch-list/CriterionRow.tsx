"use client";

// One row in the editor's criterion list. Three layers compose it:
//
//   [ field ▾ ]  [ operator ▾ ]  [ value input ]  [ weight  ]  [ × ]
//
// Field picker shows fields grouped by category. Operator picker
// only shows operators valid for the picked field. Value input
// hands off to ValueInput.tsx, which switches on InputDescriptor.
// Weight column is only rendered for preferred criteria — the
// parent passes `layer` so we know which controls to mount.

import * as React from "react";
import {
  FIELD_REGISTRY,
  listFieldsByCategory,
  type FilterCriterion,
  type FilterOperator,
  type WeightedCriterion,
} from "@/lib/watch-list/fields";
import {
  inputDescriptorFor,
  OPERATOR_LABELS,
  type MarketOption,
} from "@/lib/watch-list/editor-options";
import { ValueInput } from "./ValueInput";
import { FieldInfo } from "./FieldInfo";

export type Layer = "required" | "preferred" | "excluded";

interface Props {
  layer: Layer;
  criterion: FilterCriterion | WeightedCriterion;
  marketOptions: MarketOption[];
  onChange: (next: FilterCriterion | WeightedCriterion) => void;
  onRemove: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  geographic: "Geographic",
  scale: "Scale",
  asset: "Asset class",
  trajectory: "Trajectory & quality",
  operator: "Operator characteristics",
};

export function CriterionRow({
  layer,
  criterion,
  marketOptions,
  onChange,
  onRemove,
}: Props) {
  const fieldEntry = FIELD_REGISTRY[criterion.field];
  const groups = React.useMemo(() => listFieldsByCategory(), []);
  const validOps = fieldEntry?.validOperators ?? [];

  function handleFieldChange(newFieldId: string) {
    const newEntry = FIELD_REGISTRY[newFieldId];
    if (!newEntry) return;
    // Reset operator to the field's first valid operator + clear value
    // — types might be incompatible across the swap.
    const nextOp = newEntry.validOperators[0];
    const next: FilterCriterion = {
      field: newFieldId,
      operator: nextOp,
      value: defaultValueFor(nextOp),
    };
    onChange(layer === "preferred" ? { ...next, weight: weightOf(criterion, 0.2) } : next);
  }

  function handleOperatorChange(newOp: FilterOperator) {
    const next: FilterCriterion = {
      field: criterion.field,
      operator: newOp,
      value: defaultValueFor(newOp),
    };
    onChange(layer === "preferred" ? { ...next, weight: weightOf(criterion, 0.2) } : next);
  }

  const descriptor = fieldEntry
    ? inputDescriptorFor(criterion.field, criterion.operator)
    : null;

  return (
    <div className="grid grid-cols-[minmax(180px,1fr)_minmax(130px,160px)_minmax(220px,2fr)_auto_auto] items-start gap-3 rounded-md border border-grid bg-white px-3 py-2.5">
      {/* Field picker + info icon */}
      <div className="flex items-center gap-1.5">
        <select
          value={criterion.field}
          onChange={(e) => handleFieldChange(e.target.value)}
          className="h-8 min-w-0 flex-1 rounded-md border border-grid bg-white px-2 text-[13.5px] text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
        >
        {(["geographic", "scale", "asset", "trajectory", "operator"] as const).map((cat) => (
          <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
            {groups[cat].map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </optgroup>
        ))}
        </select>
        <FieldInfo fieldId={criterion.field} />
      </div>

      {/* Operator picker */}
      <select
        value={criterion.operator}
        onChange={(e) => handleOperatorChange(e.target.value as FilterOperator)}
        className="h-8 rounded-md border border-grid bg-white px-2 text-[13.5px] text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
      >
        {validOps.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </select>

      {/* Value */}
      <div>
        {descriptor && (
          <ValueInput
            descriptor={descriptor}
            value={criterion.value}
            onChange={(v) =>
              onChange(
                layer === "preferred"
                  ? { ...(criterion as WeightedCriterion), value: v }
                  : { ...criterion, value: v }
              )
            }
            marketOptions={marketOptions}
          />
        )}
      </div>

      {/* Weight (preferred only) */}
      {layer === "preferred" ? (
        <div className="flex items-center gap-1">
          <label className="text-[11px] text-muted-foreground dq-mono uppercase tracking-wider">
            wt
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={(criterion as WeightedCriterion).weight ?? 0.2}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange({
                ...(criterion as WeightedCriterion),
                weight: Number.isFinite(n) ? n : 0,
              });
            }}
            className="h-8 w-[64px] rounded-md border border-grid bg-white px-2 text-[13.5px] text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 text-right"
          />
        </div>
      ) : (
        <span />
      )}

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove criterion"
        className="h-8 w-8 rounded-md border border-grid bg-white text-muted-foreground hover:border-bad hover:text-bad transition-colors"
      >
        ×
      </button>
    </div>
  );
}

function defaultValueFor(op: FilterOperator): FilterCriterion["value"] {
  // Issue 5 (v0.8.3): defaults are "no value picked yet" so a freshly
  // added row doesn't immediately evaluate as "must equal 0" or
  // "must equal an empty string". isCriterionComplete treats these
  // as incomplete and the scoring engine skips them.
  switch (op) {
    case "between":
      return [null, null];
    case "in":
    case "notIn":
      return [];
    case "gte":
    case "lte":
      return null;
    case "eq":
    case "ne":
    case "contains":
      return "";
    default:
      return "";
  }
}

function weightOf(c: FilterCriterion | WeightedCriterion, fallback: number): number {
  return "weight" in c && typeof c.weight === "number" ? c.weight : fallback;
}
