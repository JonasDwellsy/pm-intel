// Editor-side metadata: market label loader + field→input-control
// mapping. Lives next to the field registry but is intentionally
// separate so the registry stays a pure runtime contract (no I/O,
// no UI hints).
//
// The editor reads two things from this module:
//   - listMarketOptions(): the closed-set option list for the
//     `marketIds` field. Sourced from prisma.market at render time
//     so editor stays current as markets are added.
//   - inputKindFor(field, operator): the value-input variant the
//     row UI should render — drives which control component
//     (EnumChipsInput, NumberInput, BetweenInput, BooleanToggle,
//     PercentInput, TextInput) gets mounted.
//
// inputKind values are picked so the editor never has to look at the
// field registry directly: pass field + operator, get an input kind +
// the prebuilt option list (when applicable) + an optional suffix
// (e.g. "%" for percent fields).

import { prisma } from "@/lib/prisma";
import {
  FIELD_REGISTRY,
  type FieldRegistryEntry,
  type FilterOperator,
} from "./fields";

export interface MarketOption {
  id: string;
  label: string;
}

export async function listMarketOptions(): Promise<MarketOption[]> {
  const rows = await prisma.market.findMany({
    select: { id: true, fullName: true, city: true, state: true },
    orderBy: { city: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.fullName ?? `${r.city}, ${r.state}`,
  }));
}

// ─── input-kind mapping ───────────────────────────────────────────

export type InputKind =
  /** Single-value primitive matching the field type (string/number).
   *  Used for `eq`/`ne`/`contains` on non-enum fields. */
  | "text"
  | "number"
  /** Number input that displays as a percentage (×100 on display,
   *  /100 on save). The stored value is a 0..1 decimal. */
  | "percent"
  /** Two number inputs for `between` operator. */
  | "between"
  /** Yes/No toggle for boolean fields. */
  | "boolean"
  /** Multi-select chip group for `in`/`notIn` on enum fields, or
   *  single-pick for `eq`/`ne` on enum fields. The editor disables
   *  multi-select for `eq`/`ne`. */
  | "enumChips";

export interface InputDescriptor {
  kind: InputKind;
  /** Closed-set option list for enum-style inputs. Empty when the
   *  options are dynamic (markets — the editor fetches via
   *  listMarketOptions()). */
  enumOptions?: string[];
  /** Whether the field carries a dynamic option list (marketIds).
   *  The editor uses this to pick the right loader. */
  dynamicOptions?: "markets";
  /** Optional suffix rendered next to the input ("%", "units",
   *  "months", etc.). UX hint only. */
  suffix?: string;
  /** Help text for value entry — appears under the input. */
  hint?: string;
  /** True for fields that store 0..1 decimals but display as
   *  percentages (concessionRate, listingTrajectoryYoY, etc.). */
  isDecimalPercent?: boolean;
  /** Allow-multi for the editor's enumChips mode. False for
   *  eq/ne operators (single value), true for in/notIn. */
  allowMulti?: boolean;
}

/** Fields whose stored value is a 0..1 decimal but should be entered
 *  and displayed as a percentage. */
const DECIMAL_PERCENT_FIELDS = new Set<string>([
  "concessionRate",
  "concessionTrajectory",
  "listingTrajectoryYoY",
  "rentPerformanceYoY",
]);

/** Per-field suffix hints. Keep terse — the input is small. */
const SUFFIX_BY_FIELD: Record<string, string | undefined> = {
  marketCount: "markets",
  topCityConcentration: "%",
  estimatedPortfolioPoint: "units",
  estimatedPortfolioLow: "units",
  estimatedPortfolioHigh: "units",
  urusT12: "URUs",
  monthsOnPlatform: "months",
  daysOnMarketT12: "days",
};

export function inputDescriptorFor(
  fieldId: string,
  operator: FilterOperator
): InputDescriptor {
  const entry = FIELD_REGISTRY[fieldId];
  if (!entry) return { kind: "text" };

  // `between` always renders two numbers, regardless of field type
  // (it only makes sense on numeric fields anyway).
  if (operator === "between") {
    return {
      kind: "between",
      suffix: SUFFIX_BY_FIELD[fieldId],
      isDecimalPercent: DECIMAL_PERCENT_FIELDS.has(fieldId),
      hint: DECIMAL_PERCENT_FIELDS.has(fieldId)
        ? "Enter as a percentage (e.g. 5 for 5%)."
        : undefined,
    };
  }

  // `in` / `notIn` only make sense on enum fields — the editor
  // limits operator choices via validOperators, so we trust that
  // here.
  if (operator === "in" || operator === "notIn") {
    return enumDescriptor(entry, true);
  }

  // `eq` / `ne` on enum fields → single-pick chips. On other
  // fields, fall through to the primitive input.
  if ((operator === "eq" || operator === "ne") && entry.type === "enum") {
    return enumDescriptor(entry, false);
  }
  if ((operator === "eq" || operator === "ne") && entry.type === "boolean") {
    return { kind: "boolean" };
  }

  // Primitive input. Percent fields get the percent variant; the
  // input scales the user-entered number into a decimal on save.
  if (entry.type === "number") {
    if (DECIMAL_PERCENT_FIELDS.has(fieldId)) {
      return {
        kind: "percent",
        suffix: "%",
        isDecimalPercent: true,
        hint: "Enter as a percentage (e.g. 5 for 5%).",
      };
    }
    return { kind: "number", suffix: SUFFIX_BY_FIELD[fieldId] };
  }

  // string fields (`name`, `canonicalOperatorId`): plain text.
  return { kind: "text" };
}

function enumDescriptor(
  entry: FieldRegistryEntry,
  allowMulti: boolean
): InputDescriptor {
  if (entry.id === "marketIds") {
    return { kind: "enumChips", dynamicOptions: "markets", allowMulti };
  }
  return {
    kind: "enumChips",
    enumOptions: entry.enumOptions ?? [],
    allowMulti,
  };
}

// ─── operator-label helpers ───────────────────────────────────────

/** Human label for the operator picker in the editor. */
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: "is",
  ne: "is not",
  in: "is one of",
  notIn: "is not one of",
  gte: "is at least",
  lte: "is at most",
  between: "is between",
  contains: "contains",
};
