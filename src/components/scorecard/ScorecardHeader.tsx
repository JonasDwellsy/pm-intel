import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import type { ScorecardData } from "@/lib/types";

export function ScorecardHeader({ scorecard }: { scorecard: ScorecardData }) {
  const stateSlug = stateCodeToSlug(scorecard.market.state);
  const cityKebab = citySlug(scorecard.market.name);

  return (
    <header className="border-b border-grid pb-8">
      <nav
        aria-label="Breadcrumb"
        className="mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground"
      >
        <Link href="/property-managers" className="hover:text-navy">
          Markets
        </Link>
        <span className="text-muted-2">/</span>
        <Link
          href={`/property-managers/${stateSlug}/${cityKebab}`}
          className="hover:text-navy"
        >
          {scorecard.market.fullName}
        </Link>
        <span className="text-muted-2">/</span>
        <span>Property managers</span>
      </nav>

      <div className="flex flex-col-reverse items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="dq-eyebrow">Property manager scorecard</p>
          <h1 className="dq-h1 mt-2">{scorecard.pm.name}</h1>
          <p className="mt-3 text-[15px] font-medium text-muted-foreground">
            {scorecard.market.fullName}
            <span className="mx-1.5 text-muted-2">·</span>
            Submarket: MSA-level
          </p>
        </div>
        <div className="flex flex-col items-start gap-2.5 md:items-end">
          <span className="dq-methodology-badge dq-tnum">
            Methodology v{scorecard.methodologyVersion.replace(/^v/, "")}
            <span className="text-muted-2">·</span>
            Data as of {fmtDate(scorecard.dataAsOf)}
          </span>
          <Link
            href={`/claim/${scorecard.pm.slug}`}
            className="text-[13px] font-medium text-teal hover:text-teal-700"
          >
            Claim this profile →
          </Link>
        </div>
      </div>
    </header>
  );
}
