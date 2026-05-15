import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

export function ScorecardHeader({ scorecard }: { scorecard: ScorecardData }) {
  return (
    <header className="border-b border-border pb-6">
      <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span>Methodology {scorecard.methodologyVersion}</span>
        <span aria-hidden>·</span>
        <span>Data as of {fmtDate(scorecard.dataAsOf)}</span>
        <span aria-hidden>·</span>
        <span>Tier: {scorecard.coverage.dataTier}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {scorecard.pm.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {scorecard.market.fullName}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{scorecard.pm.quadrant}</Badge>
            {scorecard.pm.hybrid && <Badge variant="outline">Hybrid</Badge>}
          </div>
        </div>

        <Link
          href={`/claim/${scorecard.pm.slug}`}
          className={buttonVariants({ variant: "outline" })}
        >
          Claim this profile
        </Link>
      </div>
    </header>
  );
}
