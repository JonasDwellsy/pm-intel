// v0.8 — Filter evaluator.
//
// One function: evaluateCriterion(pm, criterion) → boolean.
//
// Spec behavior:
//   - Look up the criterion's field in the registry to pull the
//     underlying value off the PM.
//   - Apply the criterion's operator against the configured value.
//   - Return true on match, false on miss.
//   - null / undefined PM values fail by default. The MVP does not
//     ship the `allowNull` escape hatch the spec mentioned —
//     deferred to v2 per the spec note.
//   - Unknown field id → return false (treat as a no-match rather
//     than throw, so a stale saved watch list doesn't crash the whole
//     apply pass).
//
// Type coercion: the evaluator is permissive on the comparison side.
// `eq` between "10" and 10 will NOT match (strict equality) — the
// editor is responsible for storing the right primitive type.
// `gte/lte/between` coerce both sides to Number, so a stringly-typed
// numeric value will still compare correctly; non-numeric strings
// produce NaN and the comparison returns false.

import {
  type FilterCriterion,
  type FilterValue,
  type PMRecord,
  getPMValueForField,
} from "./fields";

export function evaluateCriterion(
  pm: PMRecord,
  criterion: FilterCriterion
): boolean {
  const pmValue = getPMValueForField(pm, criterion.field);
  if (pmValue === null || pmValue === undefined) return false;
  // Editor in-flight: a fresh "+ Add criterion" row carries null
  // until the user picks a value. Scoring already skips these via
  // isCriterionComplete; this guard protects callers that hit the
  // evaluator directly.
  if (criterion.value === null || criterion.value === undefined) return false;

  switch (criterion.operator) {
    case "eq":
      return pmValue === criterion.value;
    case "ne":
      return pmValue !== criterion.value;
    case "in":
      return Array.isArray(criterion.value) && includesPrimitive(
        criterion.value as Array<string | number | boolean>,
        pmValue as string | number | boolean
      );
    case "notIn":
      return Array.isArray(criterion.value) && !includesPrimitive(
        criterion.value as Array<string | number | boolean>,
        pmValue as string | number | boolean
      );
    case "gte":
      return numericCompare(pmValue, criterion.value, (a, b) => a >= b);
    case "lte":
      return numericCompare(pmValue, criterion.value, (a, b) => a <= b);
    case "between": {
      if (!Array.isArray(criterion.value) || criterion.value.length !== 2)
        return false;
      const [min, max] = criterion.value as [number, number];
      return (
        numericCompare(pmValue, min, (a, b) => a >= b) &&
        numericCompare(pmValue, max, (a, b) => a <= b)
      );
    }
    case "contains":
      // Substring match against the string-coerced PM value. Useful for
      // `name contains "Pure"` style filters in excluded criteria.
      return String(pmValue)
        .toLowerCase()
        .includes(String(criterion.value).toLowerCase());
    default:
      return false;
  }
}

function includesPrimitive(
  haystack: Array<string | number | boolean>,
  needle: string | number | boolean
): boolean {
  return haystack.includes(needle);
}

function numericCompare(
  pmValue: unknown,
  configured: FilterValue | number,
  cmp: (a: number, b: number) => boolean
): boolean {
  const a = Number(pmValue);
  const b = Number(configured);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return cmp(a, b);
}
