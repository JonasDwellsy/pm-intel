import Link from "next/link";
import { DownloadPdfLink } from "@/components/analytics/DownloadPdfLink";

type SectionLink = { id: string; label: string; num: string };

const FREE_SECTIONS: SectionLink[] = [
  { id: "headline", label: "Headline metrics", num: "01" },
  { id: "paywall", label: "Paywall", num: "02" },
];

const UNLOCKED_SECTIONS: SectionLink[] = [
  { id: "headline", label: "Headline metrics", num: "01" },
  { id: "coverage", label: "Coverage universe", num: "02" },
  { id: "geography", label: "Geographic coverage", num: "03" },
  { id: "performance", label: "Operating performance", num: "04" },
  { id: "time-context", label: "Time context — DOM", num: "05" },
  { id: "rent-trajectory", label: "Rent trajectory", num: "06" },
  { id: "pricing", label: "Pricing posture", num: "07" },
  { id: "listing-quality", label: "Listing quality", num: "08" },
  { id: "coverage-confidence", label: "Coverage confidence", num: "09" },
  { id: "tenancy", label: "Tenancy", num: "10" },
  { id: "why-this-quadrant", label: "Why this quadrant", num: "11" },
];

export function ScorecardSidebar({
  isUnlocked,
  pmSlug,
}: {
  isUnlocked: boolean;
  pmSlug: string;
}) {
  const items = isUnlocked ? UNLOCKED_SECTIONS : FREE_SECTIONS;
  return (
    <aside aria-label="On this page" className="hidden lg:block">
      <div className="sticky top-[88px]">
        <p className="dq-eyebrow-muted mb-3.5">On this page</p>
        <nav className="flex flex-col border-l border-grid">
          {items.map((s) => (
            <Link
              key={s.id}
              href={`#${s.id}`}
              className="-ml-px flex items-baseline gap-3 border-l-2 border-transparent py-2 pl-4 text-[13px] font-medium text-muted-foreground transition-colors hover:text-navy hover:border-grid-soft"
            >
              <span className="dq-mono min-w-[14px] text-[10px] text-muted-2 tracking-[0.04em]">
                {s.num}
              </span>
              <span>{s.label}</span>
            </Link>
          ))}
        </nav>

        {isUnlocked && (
          <div className="mt-6 flex flex-col gap-2.5 border-b border-grid pb-6">
            <DownloadPdfLink pmSlug={pmSlug} />
            <Link
              href={`/property-managers`}
              className="inline-flex h-9 w-full items-center justify-center rounded-md border border-navy bg-white px-4 text-[13px] font-semibold text-navy transition-colors hover:bg-navy-soft"
            >
              Compare with similar PMs
            </Link>
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
            v0.3.4
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Data as of <span className="font-semibold text-navy">Mar 5, 2026</span>
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
