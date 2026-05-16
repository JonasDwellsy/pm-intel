"use client";

import * as React from "react";

export type RadioCardOption<T extends string = string> = {
  value: T;
  title: string;
  description?: string;
};

type Props<T extends string> = {
  name: string;
  value?: T;
  onChange: (v: T) => void;
  onBlur?: () => void;
  options: ReadonlyArray<RadioCardOption<T>>;
  columns?: 1 | 2 | 3;
  ariaLabel?: string;
  required?: boolean;
};

// Tile-style radio group: each option is a clickable card with a dot indicator,
// title, and short description. Used for the property-type selector and any
// other "pick one from a small set with explainer copy" pattern.
export function RadioCardGroup<T extends string>({
  name,
  value,
  onChange,
  onBlur,
  options,
  columns = 2,
  ariaLabel,
  required,
}: Props<T>) {
  const cols =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
        ? "sm:grid-cols-3"
        : "sm:grid-cols-2";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-required={required ? "true" : undefined}
      className={`grid gap-2.5 ${cols}`}
    >
      {options.map((opt) => {
        const checked = value === opt.value;
        return (
          <label
            key={opt.value}
            className={
              "relative flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3.5 pl-12 transition-colors duration-150 " +
              (checked
                ? "border-navy bg-navy-soft shadow-[0_0_0_1px_var(--color-navy)]"
                : "border-grid bg-white hover:border-navy/40")
            }
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={checked}
              onChange={() => onChange(opt.value)}
              onBlur={onBlur}
              className="sr-only"
              required={required}
            />
            {/* Custom dot indicator */}
            <span
              aria-hidden
              className={
                "absolute left-[18px] top-[18px] flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] " +
                (checked
                  ? "border-navy bg-white"
                  : "border-[#C8CDD6] bg-white")
              }
            >
              {checked && (
                <span className="h-2 w-2 rounded-full bg-navy" />
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-semibold leading-tight tracking-[-0.005em] text-navy">
                {opt.title}
              </span>
              {opt.description && (
                <span className="mt-1 text-[12.5px] leading-[1.4] text-muted-foreground">
                  {opt.description}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
