import Link from "next/link";
import { PrintScorecardButton } from "@/components/scorecard/PrintScorecardButton";
import { METHODOLOGY_VERSION, DESIGN_VERSION } from "@/lib/version";

type SectionLink = { id: string; label: string; num: string };

// Scorecard TOC. PR #47 retired the paywall — every visitor now
// sees every section, so the prior locked-state styling and lock
// glyph are gone. The action buttons (Print, Compare, Share) move
// out from behind the unlock gate and render unconditionally.
const SECTIONS: SectionLink[] = [
  { id: "synthesis", label: "Synthesis", num: "01" },
  { id: "performance", label: "Performance dimensions", num: "02" },
  { id: "lending-signals", label: "Lending Signals", num: "03" },
  { id: "portfolio", label: "Portfolio characteristics", num: "04" },
  { id: "methodology-footer", label: "Methodology & limits", num: "05" },
];

export function ScorecardSidebar({
  pmSlug,
  compareHref,
}: {
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
          {SECTIONS.map((s) => (
            <Link
              key={s.id}
              href={`#${s.id}`}
              className="-ml-px flex items-baseline gap-3 border-l-2 border-transparent py-2 pl-4 text-[13px] font-medium text-muted-foreground transition-colors hover:border-grid-soft hover:text-navy"
            >
              <span className="dq-mono min-w-[14px] text-[10px] text-muted-2 tracking-[0.04em]">
                {s.num}
              </span>
              <span>{s.label}</span>
            </Link>
          ))}
        </nav>

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

        <div className="mt-6">
          <p className="dq-eyebrow-muted mb-1.5">Methodology</p>
          <p className="dq-mono text-lg font-semibold leading-none text-navy tracking-[-0.01em]">
            {METHODOLOGY_VERSION} · design {DESIGN_VERSION}
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
