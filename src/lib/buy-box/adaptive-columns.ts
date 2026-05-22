// Single source of truth for the adaptive-column resolver used by
// the in-app results table AND the v0.12 Excel export. Both
// surfaces walk the buy box's required/preferred/excluded
// criteria, drop any field already covered by an always-on
// column (Operator / Market / 7-Cell / Est. Portfolio / URUs T12 /
// Fit Score), and surface the remainder in the order they appear
// in the buy box.

import {
  FIELD_REGISTRY,
  type FieldRegistryEntry,
  type FilterCriterion,
  type WeightedCriterion,
} from "./fields";

/** Field ids that already drive an always-on table column. Any
 *  criterion referencing one of these is omitted from the adaptive
 *  set so the export / table doesn't render two parallel columns
 *  for the same field. */
export const ALWAYS_ON_FIELD_IDS: ReadonlySet<string> = new Set([
  "quadrant7Cell",
  "estimatedPortfolioPoint",
  "estimatedPortfolioLow",
  "estimatedPortfolioHigh",
  "urusT12",
  "marketIds",
  "marketCount",
]);

export interface AdaptiveColumn {
  /** Field id from FIELD_REGISTRY. */
  fieldId: string;
  /** Resolved registry entry; consumers use `.label` + `.type` +
   *  `.getValueFromPM`. Pre-bound here so consumers don't have to
   *  re-lookup. */
  entry: FieldRegistryEntry;
}

/** Walk required → preferred → excluded criteria, drop always-on
 *  fields + duplicates, and return the resolved registry entries
 *  in the order they should appear as columns. Unknown field ids
 *  (a criterion referencing a deleted field) are silently
 *  skipped so a stale buy box doesn't crash the export. */
export function resolveAdaptiveColumns(buyBox: {
  requiredCriteria: FilterCriterion[];
  preferredCriteria: WeightedCriterion[];
  excludedCriteria: FilterCriterion[];
}): AdaptiveColumn[] {
  const seen = new Set<string>(ALWAYS_ON_FIELD_IDS);
  const columns: AdaptiveColumn[] = [];
  const all = [
    ...buyBox.requiredCriteria,
    ...buyBox.preferredCriteria,
    ...buyBox.excludedCriteria,
  ];
  for (const c of all) {
    if (seen.has(c.field)) continue;
    seen.add(c.field);
    const entry = FIELD_REGISTRY[c.field];
    if (!entry) continue;
    columns.push({ fieldId: c.field, entry });
  }
  return columns;
}
