"use client";

import * as React from "react";

export type PillOption<T extends string = string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value?: T;
  onChange: (v: T) => void;
  onBlur?: () => void;
  options: ReadonlyArray<PillOption<T>>;
  ariaLabel?: string;
  /** Special value treated as "no selection" (e.g. "" or "none"). */
  emptyValue?: T;
};

// Single-select pill group — visually a row of dq-pill chips, behaves as a
// radio. Wraps onto multiple rows on narrow viewports.
export function PillSelector<T extends string>({
  value,
  onChange,
  onBlur,
  options,
  ariaLabel,
  emptyValue,
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-2"
    >
      {options.map((opt) => {
        const isActive =
          value === opt.value || (emptyValue !== undefined && !value && opt.value === emptyValue);
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            onBlur={onBlur}
            className={
              "inline-flex h-[38px] items-center rounded-full border px-4 text-[14px] font-medium transition-colors duration-150 " +
              (isActive
                ? "border-navy bg-navy text-white"
                : "border-grid bg-white text-navy hover:border-navy/60")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
