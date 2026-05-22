"use client";

// Fit score cell on the results table. Two responsibilities:
//
//   1. Renders the score as a tier-colored chip (≥80 green,
//      60-79 amber, <60 gray). The chip is the headline number
//      the institutional user scans for.
//   2. Opens a per-row popover on click showing the breakdown —
//      every preferred criterion (label, weight%, pass/fail,
//      contribution) plus required/excluded entries when present.
//
// Click trigger (not hover-only) so the popover works on touch
// devices. Closes on outside click or Escape.

import * as React from "react";
import type { BreakdownEntryVM } from "@/lib/watch-list/results-view";

interface Props {
  fitScore: number;
  operatorName: string;
  preferred: BreakdownEntryVM[];
  required: BreakdownEntryVM[];
  excluded: BreakdownEntryVM[];
  preferredPassedCount: number;
  preferredTotalCount: number;
}

export function FitScoreBadge({
  fitScore,
  operatorName,
  preferred,
  required,
  excluded,
  preferredPassedCount,
  preferredTotalCount,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const tier = scoreTier(fitScore);

  // Outside click + Escape close.
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

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Fit score ${fitScore} — click to see breakdown`}
        className={
          "inline-flex h-8 min-w-[44px] items-center justify-center rounded-md px-2 text-[14px] font-semibold tabular-nums transition-colors " +
          tierClasses(tier)
        }
      >
        {fitScore}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`Fit score breakdown for ${operatorName}`}
          className="absolute right-0 top-9 z-30 w-[360px] rounded-lg border border-grid bg-white p-4 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-baseline justify-between border-b border-grid pb-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Fit score
              </div>
              <div className="mt-0.5 text-[20px] font-semibold text-navy tabular-nums">
                {fitScore} <span className="text-[14px] text-muted-foreground">/ 100</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-[18px] leading-none text-muted-foreground hover:text-navy"
            >
              ×
            </button>
          </header>

          {preferred.length > 0 && (
            <section className="mt-3">
              <div className="flex items-center justify-between">
                <h3 className="dq-eyebrow text-orange-700">Preferred</h3>
                <span className="dq-mono text-[11px] text-muted-foreground">
                  {preferredPassedCount} / {preferredTotalCount} passed
                </span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {preferred.map((e, i) => (
                  <li
                    key={`pref-${e.field}-${i}`}
                    className="grid grid-cols-[16px_1fr_auto] items-center gap-2"
                  >
                    <span
                      className={
                        "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold " +
                        (e.passed
                          ? "bg-good-soft text-good"
                          : "bg-rose-soft text-bad")
                      }
                      aria-hidden
                    >
                      {e.passed ? "✓" : "×"}
                    </span>
                    <span className="text-[12.5px] text-navy">
                      {e.label}
                      <span className="text-muted-foreground">
                        {" "}
                        ({e.operatorLabel})
                      </span>
                    </span>
                    <span className="dq-mono text-[11.5px] text-muted-foreground tabular-nums whitespace-nowrap">
                      {e.weightPct !== null ? `${e.weightPct}%` : "—"}
                      {" · "}
                      <span className={e.passed ? "text-good" : "text-muted-2"}>
                        +
                        {e.contribution !== null
                          ? Math.round(e.contribution)
                          : 0}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {required.length > 0 && (
            <section className="mt-3">
              <h3 className="dq-eyebrow text-bad">Required</h3>
              <ul className="mt-2 space-y-1.5">
                {required.map((e, i) => (
                  <li
                    key={`req-${e.field}-${i}`}
                    className="grid grid-cols-[16px_1fr] items-center gap-2"
                  >
                    <span
                      className={
                        "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold " +
                        (e.passed
                          ? "bg-good-soft text-good"
                          : "bg-rose-soft text-bad")
                      }
                      aria-hidden
                    >
                      {e.passed ? "✓" : "×"}
                    </span>
                    <span className="text-[12.5px] text-navy">
                      {e.label}
                      <span className="text-muted-foreground">
                        {" "}
                        ({e.operatorLabel})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {excluded.length > 0 && (
            <section className="mt-3">
              <h3 className="dq-eyebrow text-muted-foreground">Excluded</h3>
              <ul className="mt-2 space-y-1.5">
                {excluded.map((e, i) => (
                  <li
                    key={`exc-${e.field}-${i}`}
                    className="grid grid-cols-[16px_1fr] items-center gap-2"
                  >
                    <span
                      className={
                        "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold " +
                        (e.passed
                          ? "bg-rose-soft text-bad"
                          : "bg-good-soft text-good")
                      }
                      aria-hidden
                    >
                      {e.passed ? "!" : "✓"}
                    </span>
                    <span className="text-[12.5px] text-navy">
                      {e.label}
                      <span className="text-muted-foreground">
                        {" "}
                        ({e.operatorLabel})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className="mt-3 border-t border-grid pt-2 text-[11px] text-muted-foreground">
            {preferred.length === 0
              ? "No preferred criteria — score reflects hard-filter pass only."
              : `${preferredPassedCount} of ${preferredTotalCount} preferred criteria passed.`}
          </footer>
        </div>
      )}
    </div>
  );
}

type Tier = "high" | "mid" | "low";
function scoreTier(s: number): Tier {
  if (s >= 80) return "high";
  if (s >= 60) return "mid";
  return "low";
}
function tierClasses(t: Tier): string {
  switch (t) {
    case "high":
      return "bg-good-soft text-good hover:bg-good-soft/80 border border-good/20";
    case "mid":
      return "bg-orange-soft text-orange-700 hover:bg-orange-soft/80 border border-orange/20";
    case "low":
      return "bg-grid-soft text-muted-foreground hover:bg-surface-soft border border-grid";
  }
}
