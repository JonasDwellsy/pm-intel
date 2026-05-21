import Link from "next/link";
import { PrintScorecardButton } from "@/components/scorecard/PrintScorecardButton";

type SectionLink = { id: string; label: string; num: string };

// Single source of truth for the scorecard's TOC. Both unlocked and
// paywalled readers see the same 5 sections. The old FREE_SECTIONS
// list surfaced "Paywall" as a content entry which read as a section
// label rather than the UX state it actually is. Now: paywalled
// readers see locks on the 4 gated sections, the unlock CTA is what
// happens when they click one, and "Paywall" stops masquerading as
// content.
const SECTIONS: SectionLink[] = [
  { id: "synthesis", label: "Synthesis", num: "01" },
  { id: "performance", label: "Performance dimensions", num: "02" },
  { id: "lending-signals", label: "Lending Signals", num: "03" },
  { id: "portfolio", label: "Portfolio characteristics", num: "04" },
  { id: "methodology-footer", label: "Methodology & limits", num: "05" },
];

// Lock glyph for the paywalled rows. Inline SVG — matches the project
// pattern; lucide-react was removed in PR #26 for being unused.
function LockGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function ScorecardSidebar({
  isUnlocked,
  pmSlug,
  compareHref,
}: {
  isUnlocked: boolean;
  pmSlug: string;
  /** Resolved compare URL when the operator has at least one ranked
   *  peer; null on the rare edge case (single-ranked-operator market)
   *  where peer comparison wouldn't be meaningful. Computed server-side
   *  by the scorecard route handler. */
  compareHref: string | null;
}) {
  return (
    <aside aria-label="On this page" className="hidden lg:block">
      <div className="sticky top-[88px]">
        <p className="dq-eyebrow-muted mb-3.5">On this page</p>
        <nav className="flex flex-col border-l border-grid">
          {SECTIONS.map((s) => {
            // Only Synthesis (the first section) is visible at the
            // paywalled access level; the other four sit behind the
            // unlock CTA. Locked rows still render in the TOC so the
            // visitor sees the full scope of what unlocking gets them
            // — they're just visually muted and route to the paywall
            // block instead of an anchor they can't reach.
            const locked = !isUnlocked && s.id !== "synthesis";
            const href = locked ? "#paywall" : `#${s.id}`;
            const baseClass =
              "-ml-px flex items-baseline gap-3 border-l-2 border-transparent py-2 pl-4 text-[13px] font-medium transition-colors";
            const stateClass = locked
              ? "text-muted-2 hover:text-muted-foreground"
              : "text-muted-foreground hover:text-navy hover:border-grid-soft";
            return (
              <Link
                key={s.id}
                href={href}
                aria-disabled={locked || undefined}
                className={`${baseClass} ${stateClass}`}
              >
                <span className="dq-mono min-w-[14px] text-[10px] text-muted-2 tracking-[0.04em]">
                  {s.num}
                </span>
                <span className="flex items-center gap-1.5">
                  {s.label}
                  {locked && <LockGlyph />}
                </span>
              </Link>
            );
          })}
        </nav>

        {isUnlocked && (
          <div className="mt-6 flex flex-col gap-2.5 border-b border-grid pb-6">
            <PrintScorecardButton pmSlug={pmSlug} />
            {compareHref && (
              <Link
                href={compareHref}
                className="inline-flex h-9 w-full items-center justify-center rounded-md border border-navy bg-white px-4 text-[13px] font-semibold text-navy transition-colors hover:bg-navy-soft"
              >
                Compare with similar PMs
              </Link>
            )}
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 self-start px-1 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-navy"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Share scorecard
            </button>
          </div>
        )}

        <div className="mt-6">
          <p className="dq-eyebrow-muted mb-1.5">Methodology</p>
          <p className="dq-mono text-lg font-semibold leading-none text-navy tracking-[-0.01em]">
            v0.7 · design v1.0
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Data as of{" "}
            <span className="font-semibold text-navy">May 17, 2026</span>
          </p>
          <Link
            href="/methodology"
            className="mt-2.5 inline-block text-xs font-semibold text-teal hover:text-teal-700"
          >
            How scoring works →
          </Link>
        </div>
      </div>
    </aside>
  );
}
