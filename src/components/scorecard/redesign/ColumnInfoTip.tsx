"use client";

// Lightweight "i" info popover for table column headers (Properties section).
// Distinct from MetricInfoModal (a full keyed dialog for scored metrics): this
// is a short free-text description anchored to the header cell.
//
// Portaled to <body> so the table's `overflow-x-auto` wrapper can't clip it
// (overflow-x:auto computes overflow-y to auto, so an in-flow popover would be
// clipped/scrolled). Positioned under the trigger via getBoundingClientRect and
// clamped to the viewport. Opens on hover / focus / click (touch + keyboard),
// dismisses on pointer-leave, blur, Escape, outside pointer-down, and scroll.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const POPOVER_WIDTH = 260;
const MARGIN = 8;

export function ColumnInfoTip({
  label,
  description,
}: {
  /** Column name, shown bold at the top of the popover. */
  label: string;
  /** One- to two-sentence plain-English description of the column. */
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipId = useId();

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Anchor below the icon, left-aligned to it, clamped to the viewport so it
    // never runs off the right edge (rightmost columns) or the left.
    const left = Math.min(
      Math.max(MARGIN, r.left),
      window.innerWidth - POPOVER_WIDTH - MARGIN
    );
    setPos({ top: r.bottom + 6, left });
  }, []);

  const doOpen = useCallback(() => {
    clearCloseTimer();
    place();
    setOpen(true);
  }, [place]);

  // Grace delay so moving the pointer from the icon into the popover doesn't
  // close it (they're separated by a 6px gap).
  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    const onDown = (e: PointerEvent) => {
      // Outside click: close if the pointer isn't on the trigger. The popover
      // itself stops propagation, so a click inside it won't reach here.
      if (!triggerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // capture so we still hear scrolls on the table's own scroll container.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={doOpen}
        onMouseLeave={scheduleClose}
        onFocus={doOpen}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // Open-only, never toggle: a mouse click is preceded by mouseenter
          // (which already opened it), so toggling here would immediately close
          // it. preventDefault/stopPropagation keep the click off the column's
          // sort control. Dismissal is via mouseleave / blur / Escape / outside
          // pointer-down — which also covers tap-outside on touch.
          e.preventDefault();
          e.stopPropagation();
          doOpen();
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "14px",
          height: "14px",
          flexShrink: 0,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.5)",
          background: "transparent",
          color: "rgba(255,255,255,0.85)",
          fontSize: "9px",
          fontWeight: 700,
          fontStyle: "italic",
          lineHeight: 1,
          cursor: "pointer",
          padding: 0,
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        i
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={tipId}
            role="tooltip"
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: POPOVER_WIDTH,
              zIndex: 1000,
              background: "#fff",
              color: "#2a3547",
              border: "1px solid #e2e7ef",
              borderRadius: "9px",
              boxShadow: "0 10px 30px rgba(15,31,63,0.18)",
              padding: "11px 13px",
              textAlign: "left",
              fontFamily:
                "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            }}
          >
            <div
              style={{
                fontSize: "12.5px",
                fontWeight: 700,
                color: "#0f1f3f",
                marginBottom: "3px",
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: "12px", lineHeight: 1.5, color: "#5b6577" }}>
              {description}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
