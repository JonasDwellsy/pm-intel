"use client";

// "How is the fit score calculated?" — small inline disclosure
// that opens a modal explaining the three-layer waterfall. Keeps
// the results page header clean while making the algorithm
// transparent to institutional users.

import * as React from "react";

export function MethodologyDisclosure() {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-teal hover:text-teal-700 hover:underline"
      >
        <span aria-hidden className="inline-block h-4 w-4 rounded-full border border-current text-center text-[10px] leading-[14px]">
          ?
        </span>
        How is the fit score calculated?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-navy/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[520px] max-w-[calc(100%-2rem)] rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <div>
                <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
                  Methodology
                </p>
                <h2 className="mt-1 text-[20px] font-semibold text-navy">
                  Fit score calculation
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-[20px] leading-none text-muted-foreground hover:text-navy"
              >
                ×
              </button>
            </div>

            <p className="mt-4 text-[13.5px] text-foreground/80">
              Every operator is evaluated in three layers. The first two are
              hard filters; the third drives the 0–100 fit score.
            </p>

            <ol className="mt-4 space-y-3">
              <li className="rounded-md border border-grid bg-surface-soft p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block size-2 rounded-full bg-muted-2" />
                  <h3 className="text-[13.5px] font-semibold text-navy">
                    1. Excluded
                  </h3>
                </div>
                <p className="mt-1 text-[12.5px] text-foreground/80">
                  If any excluded criterion matches, the operator is removed
                  from results entirely — a hard veto.
                </p>
              </li>
              <li className="rounded-md border border-grid bg-surface-soft p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block size-2 rounded-full bg-bad" />
                  <h3 className="text-[13.5px] font-semibold text-navy">
                    2. Required
                  </h3>
                </div>
                <p className="mt-1 text-[12.5px] text-foreground/80">
                  If any required criterion fails, the operator is removed.
                  Operators only proceed to scoring after passing every
                  required criterion.
                </p>
              </li>
              <li className="rounded-md border border-grid bg-surface-soft p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block size-2 rounded-full bg-orange" />
                  <h3 className="text-[13.5px] font-semibold text-navy">
                    3. Preferred (weighted)
                  </h3>
                </div>
                <p className="mt-1 text-[12.5px] text-foreground/80">
                  Each preferred criterion carries a weight. The fit score is:
                </p>
                <p className="dq-mono mt-2 text-[12px] text-navy">
                  sum(weight × 100 for passing criteria) / sum(all weights)
                </p>
                <p className="mt-2 text-[12.5px] text-foreground/80">
                  Weights normalize automatically — absolute values don&rsquo;t
                  have to sum to 1. The result is rounded to a whole number
                  between 0 and 100.
                </p>
              </li>
            </ol>

            <p className="mt-4 text-[12px] text-muted-foreground">
              Edge case: when a watch list has no preferred criteria, every
              passing operator scores 100 (no preferences to differentiate
              between them).
            </p>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-9 rounded-md bg-navy px-4 text-[13px] font-semibold text-white hover:bg-navy-700"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
