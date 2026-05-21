"use client";

// Field- and operator-aware value input. The editor builds an
// InputDescriptor (kind + options + suffix) from the field registry
// and passes it here. We switch on kind and render the right
// control — keeps CriterionRow free of input-shape branching.
//
// Storage contract: value is whatever shape the evaluator expects.
//   - text / number / percent → primitive string|number|boolean
//   - between → [number, number]
//   - enumChips (single) → primitive
//   - enumChips (multi)  → string[]
//   - boolean → boolean
//
// Percent inputs scale on the boundary: user enters "5" for 5%,
// stored value is 0.05. Display does the reverse.

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
  const num = typeof value === "number" ? value : "";
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={num}
        onChange={(e) => {
          const n = e.target.value === "" ? 0 : Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className={inputClass}
        placeholder="0"
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
    typeof value === "number" ? Math.round(value * 10000) / 100 : "";
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        step="0.1"
        value={displayed}
        onChange={(e) => {
          const n = e.target.value === "" ? 0 : Number(e.target.value);
          onChange(Number.isFinite(n) ? n / 100 : 0);
        }}
        className={inputClass}
        placeholder="0"
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
  const pair = Array.isArray(value) && value.length === 2 ? (value as [number, number]) : [0, 0];
  const scale = (n: number) => (isPercent ? Math.round(n * 10000) / 100 : n);
  const unscale = (n: number) => (isPercent ? n / 100 : n);
  const labelSuffix = isPercent ? "%" : suffix;
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={scale(pair[0])}
        onChange={(e) => {
          const n = e.target.value === "" ? 0 : Number(e.target.value);
          onChange([unscale(n), pair[1]] as FilterValue);
        }}
        className={inputClass + " w-[88px]"}
      />
      <span className="text-[12px] text-muted-foreground">and</span>
      <input
        type="number"
        value={scale(pair[1])}
        onChange={(e) => {
          const n = e.target.value === "" ? 0 : Number(e.target.value);
          onChange([pair[0], unscale(n)] as FilterValue);
        }}
        className={inputClass + " w-[88px]"}
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
        return (
          <button
            key={opt.label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.val)}
            className={
              "px-3 py-1 text-[13px] font-medium transition-colors " +
              (i === 0 ? "rounded-l-lg" : "rounded-r-lg border-l border-grid ") +
              (active ? "bg-navy text-white" : "bg-white text-navy hover:bg-surface-soft")
            }
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

const inputClass =
  "h-8 rounded-md border border-grid bg-white px-2 text-[13.5px] text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20";
