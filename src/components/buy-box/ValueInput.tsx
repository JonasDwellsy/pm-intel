"use client";

// Field- and operator-aware value input. The editor builds an
// InputDescriptor (kind + options + suffix) from the field registry
// and passes it here. We switch on kind and render the right
// control — keeps CriterionRow free of input-shape branching.
//
// Storage contract:
//   - text / number / percent → primitive string|number|boolean,
//     or null while the user is mid-edit (cleared input).
//   - between → [number, number] when complete; [n|null, n|null]
//     while either side is mid-edit. Scoring skips incomplete.
//   - enumChips (single) → primitive
//   - enumChips (multi)  → string[]
//   - boolean → boolean
//
// Percent inputs scale on the boundary: user enters "5" for 5%,
// stored value is 0.05. Display does the reverse.
//
// Issue 2 (v0.8.3): number/percent/between inputs now accept an
// empty string as a valid intermediate state — they pass `null`
// to onChange rather than coercing to 0. Saves are blocked
// upstream by isCriterionComplete(). Focus on a 0 selects-all so
// typing replaces immediately.

import * as React from "react";
import type {
  InputDescriptor,
  MarketOption,
} from "@/lib/buy-box/editor-options";
import type { FilterValue } from "@/lib/buy-box/fields";

interface Props {
  descriptor: InputDescriptor;
  value: FilterValue | undefined;
  onChange: (next: FilterValue) => void;
  /** Loaded once by the editor and threaded through; the descriptor
   *  signals via dynamicOptions === "markets" that we need it. */
  marketOptions?: MarketOption[];
}

export function ValueInput({ descriptor, value, onChange, marketOptions }: Props) {
  switch (descriptor.kind) {
    case "text":
      return <TextValue value={value} onChange={onChange} />;
    case "number":
      return <NumberValue value={value} onChange={onChange} suffix={descriptor.suffix} />;
    case "percent":
      return <PercentValue value={value} onChange={onChange} />;
    case "between":
      return (
        <BetweenValue
          value={value}
          onChange={onChange}
          isPercent={descriptor.isDecimalPercent ?? false}
          suffix={descriptor.suffix}
        />
      );
    case "boolean":
      return <BooleanValue value={value} onChange={onChange} />;
    case "enumChips":
      return (
        <EnumChipsValue
          value={value}
          onChange={onChange}
          allowMulti={descriptor.allowMulti ?? false}
          enumOptions={descriptor.enumOptions}
          dynamicOptions={descriptor.dynamicOptions}
          marketOptions={marketOptions}
        />
      );
    default:
      return null;
  }
}

// ─── primitives ────────────────────────────────────────────────────

function TextValue({
  value,
  onChange,
}: {
  value: FilterValue | undefined;
  onChange: (v: FilterValue) => void;
}) {
  const str = typeof value === "string" ? value : "";
  return (
    <input
      type="text"
      value={str}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
      placeholder="Enter a value"
    />
  );
}

function NumberValue({
  value,
  onChange,
  suffix,
}: {
  value: FilterValue | undefined;
  onChange: (v: FilterValue) => void;
  suffix?: string;
}) {
  const display = typeof value === "number" ? String(value) : "";
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={display}
        onChange={(e) => onChange(parseNumberInput(e.target.value))}
        onFocus={selectAllIfZero}
        className={inputClass}
        placeholder="Enter a number"
      />
      {suffix && (
        <span className="text-[12px] text-muted-foreground dq-mono whitespace-nowrap">
          {suffix}
        </span>
      )}
    </div>
  );
}

function PercentValue({
  value,
  onChange,
}: {
  value: FilterValue | undefined;
  onChange: (v: FilterValue) => void;
}) {
  // Storage is 0..1; display is 0..100. Round display to 2 decimals
  // so backstage 0.0500000001 doesn't show up as 5.00000001.
  const displayed =
    typeof value === "number"
      ? String(Math.round(value * 10000) / 100)
      : "";
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        step="0.1"
        value={displayed}
        onChange={(e) => {
          const parsed = parseNumberInput(e.target.value);
          // null passes through unchanged (means "empty"); finite
          // numbers get scaled back into the 0..1 storage domain.
          onChange(parsed === null ? (null as unknown as FilterValue) : ((parsed as number) / 100));
        }}
        onFocus={selectAllIfZero}
        className={inputClass}
        placeholder="Enter a number"
      />
      <span className="text-[12px] text-muted-foreground dq-mono">%</span>
    </div>
  );
}

function BetweenValue({
  value,
  onChange,
  isPercent,
  suffix,
}: {
  value: FilterValue | undefined;
  onChange: (v: FilterValue) => void;
  isPercent: boolean;
  suffix?: string;
}) {
  // The pair may have null on either side while the user is mid-edit.
  // Default to [null, null] when the value isn't an array yet.
  const pair: [number | null, number | null] =
    Array.isArray(value) && value.length === 2
      ? [
          typeof value[0] === "number" ? (value[0] as number) : null,
          typeof value[1] === "number" ? (value[1] as number) : null,
        ]
      : [null, null];

  // Scale to display units (0..1 storage → 0..100 display for
  // percent fields, identity otherwise).
  const scale = (n: number | null) =>
    n === null ? "" : isPercent ? String(Math.round(n * 10000) / 100) : String(n);
  const unscale = (raw: string): number | null => {
    const parsed = parseNumberInput(raw);
    if (parsed === null) return null;
    return isPercent ? (parsed as number) / 100 : (parsed as number);
  };
  const labelSuffix = isPercent ? "%" : suffix;
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={scale(pair[0])}
        onChange={(e) =>
          onChange([unscale(e.target.value), pair[1]] as unknown as FilterValue)
        }
        onFocus={selectAllIfZero}
        className={inputClass + " w-[88px]"}
        placeholder="min"
      />
      <span className="text-[12px] text-muted-foreground">and</span>
      <input
        type="number"
        value={scale(pair[1])}
        onChange={(e) =>
          onChange([pair[0], unscale(e.target.value)] as unknown as FilterValue)
        }
        onFocus={selectAllIfZero}
        className={inputClass + " w-[88px]"}
        placeholder="max"
      />
      {labelSuffix && (
        <span className="text-[12px] text-muted-foreground dq-mono whitespace-nowrap">
          {labelSuffix}
        </span>
      )}
    </div>
  );
}

function BooleanValue({
  value,
  onChange,
}: {
  value: FilterValue | undefined;
  onChange: (v: FilterValue) => void;
}) {
  const v = typeof value === "boolean" ? value : false;
  return (
    <div role="radiogroup" className="inline-flex rounded-lg border border-grid bg-white">
      {[
        { label: "Yes", val: true },
        { label: "No", val: false },
      ].map((opt, i) => {
        const active = v === opt.val;
        // Issue 3 (v0.8.3): the previous implementation concatenated
        // "rounded-l-lg" + "bg-navy text-white" with no separating
        // space, producing the invalid class "rounded-l-lgbg-navy"
        // and rendering selected Yes as white-on-white. Build the
        // class list with explicit join so the bug can't reappear.
        const classes = [
          "px-3 py-1 text-[13px] font-medium transition-colors",
          i === 0 ? "rounded-l-lg" : "rounded-r-lg border-l border-grid",
          active
            ? "bg-navy text-white"
            : "bg-white text-navy hover:bg-surface-soft",
        ].join(" ");
        return (
          <button
            key={opt.label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.val)}
            className={classes}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function EnumChipsValue({
  value,
  onChange,
  allowMulti,
  enumOptions,
  dynamicOptions,
  marketOptions,
}: {
  value: FilterValue | undefined;
  onChange: (v: FilterValue) => void;
  allowMulti: boolean;
  enumOptions?: string[];
  dynamicOptions?: "markets";
  marketOptions?: MarketOption[];
}) {
  const opts: Array<{ id: string; label: string }> =
    dynamicOptions === "markets"
      ? (marketOptions ?? []).map((m) => ({ id: m.id, label: m.label }))
      : (enumOptions ?? []).map((s) => ({ id: s, label: s }));

  // Normalize selection into a Set<string>. Single-select stores
  // primitive; multi-select stores string[].
  const selected = new Set<string>(
    allowMulti
      ? Array.isArray(value)
        ? (value as string[])
        : []
      : typeof value === "string"
      ? [value]
      : []
  );

  function toggle(id: string) {
    if (allowMulti) {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange(Array.from(next) as FilterValue);
    } else {
      onChange(id as FilterValue);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((opt) => {
        const active = selected.has(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            className={
              "rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors " +
              (active
                ? "border-navy bg-navy text-white"
                : "border-grid bg-white text-navy hover:border-navy/60")
            }
          >
            {opt.label}
          </button>
        );
      })}
      {opts.length === 0 && (
        <span className="text-[12px] text-muted-foreground italic">
          No options available
        </span>
      )}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────

/** Parse a raw text-input value into a number, or null when empty.
 *  Treats whitespace-only input as empty. Returns null for non-numeric
 *  text so the caller can fall back to its incomplete-state path. */
function parseNumberInput(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Issue 2 (v0.8.3): when a number input shows "0", focusing should
 *  select-all so the user's first keystroke replaces it instead of
 *  appending. The blank case is naturally fine (caret in an empty
 *  field is already the right behaviour). */
function selectAllIfZero(e: React.FocusEvent<HTMLInputElement>) {
  if (e.target.value === "0") e.target.select();
}

const inputClass =
  "h-8 rounded-md border border-grid bg-white px-2 text-[13.5px] text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20";
