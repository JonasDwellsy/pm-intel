// Criterion-completeness helper. A criterion is "complete" when
// its field, operator, and value are all set and the value is
// shape-correct for the operator (e.g. between needs a [num, num]
// pair, in/notIn need a non-empty array). Incomplete criteria are
// silently skipped by the evaluator + scoring engine so that
// adding a fresh empty row in the editor doesn't drop the match
// count to zero before the user finishes configuring it.
//
// The editor also calls this on save to block persistence — saving
// an empty placeholder criterion would surprise the user the next
// time they apply the buy box.

import {
  FIELD_REGISTRY,
  type FilterCriterion,
  type FilterOperator,
  type FilterValue,
} from "./fields";

export function isCriterionComplete(c: FilterCriterion): boolean {
  if (!c) return false;
  if (typeof c.field !== "string" || c.field.length === 0) return false;
  if (!FIELD_REGISTRY[c.field]) return false;
  if (typeof c.operator !== "string" || c.operator.length === 0) return false;
  return isValueComplete(c.operator as FilterOperator, c.value);
}

function isValueComplete(op: FilterOperator, value: FilterValue | undefined): boolean {
  if (value === undefined || value === null) return false;

  switch (op) {
    case "between":
      // Pair of finite numbers, both filled. The editor stores
      // partial state as [null, null] / [n, null] while the user
      // is mid-edit; both elements must be finite numbers before
      // we treat the criterion as complete.
      if (!Array.isArray(value) || value.length !== 2) return false;
      return (
        typeof value[0] === "number" &&
        Number.isFinite(value[0]) &&
        typeof value[1] === "number" &&
        Number.isFinite(value[1])
      );
    case "in":
    case "notIn":
      // Non-empty array — an empty multi-select isn't a real filter.
      return Array.isArray(value) && value.length > 0;
    case "eq":
    case "ne":
    case "contains":
      // Primitive — empty string or empty array doesn't count.
      if (typeof value === "string") return value.length > 0;
      if (typeof value === "boolean") return true;
      if (typeof value === "number") return Number.isFinite(value);
      if (Array.isArray(value)) return value.length > 0;
      return false;
    case "gte":
    case "lte":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return false;
  }
}

/** Returns only the criteria that are fully specified. Identity-safe
 *  for the common-case all-complete buy box (returns the original
 *  array when nothing is filtered out). */
export function filterComplete<T extends FilterCriterion>(criteria: T[]): T[] {
  let allComplete = true;
  for (const c of criteria) {
    if (!isCriterionComplete(c)) {
      allComplete = false;
      break;
    }
  }
  if (allComplete) return criteria;
  return criteria.filter(isCriterionComplete);
}
