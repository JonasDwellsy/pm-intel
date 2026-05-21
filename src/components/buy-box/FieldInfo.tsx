"use client";

// Small (?) info icon that opens a tooltip with the field's
// description from the registry. Hover-driven on desktop, tap-
// driven on touch (the click handler covers both — touch devices
// don't dispatch hover events but do click on tap).
//
// Outside-click closes. Escape closes. Positioned below the icon
// with a max width so long descriptions wrap rather than blow out
// the row layout.

import * as React from "react";
import { FIELD_REGISTRY } from "@/lib/buy-box/fields";

interface Props {
  fieldId: string;
}

export function FieldInfo({ fieldId }: Props) {
  const entry = FIELD_REGISTRY[fieldId];
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!entry) return null;

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={`What is ${entry.label}?`}
        aria-expanded={open}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-grid bg-white text-[10px] font-semibold leading-none text-muted-foreground hover:border-teal hover:text-teal"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-5 z-30 w-[280px] -translate-x-1/2 rounded-md border border-grid bg-white p-3 text-left text-[12px] leading-snug text-foreground/85 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block text-[11.5px] font-semibold text-navy">
            {entry.label}
          </span>
          <span className="mt-1 block text-[12px] text-foreground/75">
            {entry.description}
          </span>
        </span>
      )}
    </span>
  );
}
