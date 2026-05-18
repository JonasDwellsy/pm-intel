"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  METRIC_DEFINITIONS,
  type MetricKey,
} from "@/lib/metric-definitions";

// Phase G (Layer 6B) — centralized "i" icon modal infrastructure. One
// provider wraps the scorecard tree, owns the "which metric is open" state,
// and renders a single <dialog> element. Every InfoIcon across Layers 1-5
// calls into this context to open the modal for its metric key.
//
// Uses the native HTML <dialog> element with .showModal() so we get free
// focus trap, ESC-to-close, and backdrop click handling — much smaller than
// rolling our own with manual focus management. Reasonable browser support
// in the deploy target (Chrome 37+, Firefox 98+, Safari 15.4+).

interface MetricInfoContext {
  open: (key: MetricKey) => void;
  close: () => void;
  isOpen: boolean;
  currentKey: MetricKey | null;
}

const Ctx = createContext<MetricInfoContext | null>(null);

export function useMetricInfo(): MetricInfoContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useMetricInfo must be used inside <MetricInfoProvider>"
    );
  }
  return ctx;
}

export function MetricInfoProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentKey, setCurrentKey] = useState<MetricKey | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const open = useCallback((key: MetricKey) => {
    setCurrentKey(key);
  }, []);

  const close = useCallback(() => {
    setCurrentKey(null);
  }, []);

  // Open / close the native <dialog> when state changes. The dialog's own
  // close event (ESC / backdrop) also resets state via onClose.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (currentKey && !dialog.open) {
      dialog.showModal();
    } else if (!currentKey && dialog.open) {
      dialog.close();
    }
  }, [currentKey]);

  const isOpen = currentKey !== null;
  const def = currentKey ? METRIC_DEFINITIONS[currentKey] : null;

  return (
    <Ctx.Provider value={{ open, close, isOpen, currentKey }}>
      {children}
      <dialog
        ref={dialogRef}
        onClose={close}
        onClick={(e) => {
          // Backdrop click = clicks landing on the dialog element itself
          // (not its inner content). Closes the modal.
          if (e.target === dialogRef.current) close();
        }}
        aria-labelledby="metric-info-title"
        className="dq-metric-info-dialog"
      >
        {def && (
          <article
            className="relative max-h-[85vh] w-[min(640px,100vw)] overflow-y-auto rounded-[16px] bg-white p-7 shadow-xl max-md:h-[100vh] max-md:max-h-none max-md:w-screen max-md:rounded-none max-md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-grid pb-4">
              <div className="min-w-0">
                <p className="dq-eyebrow-muted mb-1">Methodology</p>
                <h2
                  id="metric-info-title"
                  className="text-[22px] font-bold leading-tight tracking-[-0.014em] text-navy"
                >
                  {def.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close methodology details"
                className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-soft hover:text-navy"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            </header>

            <div className="mt-5 space-y-5">
              {/* Definition */}
              <section>
                <p className="dq-eyebrow-muted mb-1.5">Definition</p>
                <p className="text-[15px] leading-[1.6] text-foreground text-pretty">
                  {def.definition}
                </p>
              </section>

              {/* Formula */}
              {def.formula && (
                <section>
                  <p className="dq-eyebrow-muted mb-1.5">Formula</p>
                  <pre className="dq-mono whitespace-pre-wrap rounded-md border border-grid bg-surface-soft p-3 text-[12.5px] leading-[1.55] text-navy">
                    {def.formula}
                  </pre>
                  {def.variableDefs && def.variableDefs.length > 0 && (
                    <ul className="mt-2.5 space-y-1 text-[12.5px] leading-[1.5] text-muted-foreground">
                      {def.variableDefs.map((v) => (
                        <li key={v.symbol} className="flex gap-2">
                          <code className="dq-mono shrink-0 text-navy">
                            {v.symbol}
                          </code>
                          <span>— {v.meaning}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {/* Cohort scope */}
              <section>
                <p className="dq-eyebrow-muted mb-1.5">Cohort scope</p>
                <p className="text-[13.5px] leading-[1.55] text-foreground">
                  {def.cohortScope}
                </p>
              </section>

              {/* Caveats */}
              {def.caveats.length > 0 && (
                <section>
                  <p className="dq-eyebrow-muted mb-1.5">Caveats</p>
                  <ul className="space-y-1.5">
                    {def.caveats.map((c, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-[13px] leading-[1.55] text-foreground"
                      >
                        <span
                          aria-hidden
                          className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-orange"
                        />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Methodology link */}
              {def.methodologyHref && (
                <section className="border-t border-grid pt-4">
                  <Link
                    href={def.methodologyHref}
                    onClick={close}
                    className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-teal transition-colors hover:text-teal-700"
                  >
                    Read full methodology
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </Link>
                </section>
              )}
            </div>
          </article>
        )}
      </dialog>
    </Ctx.Provider>
  );
}
