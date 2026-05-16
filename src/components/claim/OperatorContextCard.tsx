import Link from "next/link";
import { QuadrantBadge } from "./QuadrantBadge";

// "Operator on file" card — confirms which PM this claim flow is for, what
// quadrant the operator sits in, and surfaces the three top scorecard metrics
// (overall rank, within-quadrant rank, median DOM T12M). Lives on cream and
// uses the warm-cream surface palette.

type RankBlock = { rank: number; of: number };

export function OperatorContextCard({
  name,
  market,
  quadrant,
  rankOverall,
  rankQuadrant,
  medianDomT12,
  scorecardHref,
}: {
  name: string;
  market: string;
  quadrant: string;
  rankOverall: RankBlock | null;
  rankQuadrant: RankBlock | null;
  medianDomT12: number | null;
  scorecardHref: string;
}) {
  return (
    <section
      aria-label="Operator on file"
      className="mt-14 rounded-[14px] border bg-cream-quiet px-8 py-7 max-md:mt-9 max-md:px-5 max-md:py-6"
      style={{ borderColor: "var(--color-warm-grid)" }}
    >
      {/* Top row: name + market, quadrant badge */}
      <div className="flex items-start justify-between gap-4 max-md:flex-col max-md:gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold leading-tight tracking-[-0.014em] text-navy">
            {name}
          </h2>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{market}</p>
        </div>
        <QuadrantBadge quadrant={quadrant} className="shrink-0 max-md:whitespace-normal" />
      </div>

      {/* Stats row */}
      <div
        className="mt-5 grid grid-cols-3 gap-6 border-t pt-5 max-md:grid-cols-1 max-md:gap-4"
        style={{ borderColor: "var(--color-warm-grid)" }}
      >
        <Stat
          label="Overall rank"
          value={
            rankOverall ? (
              <RankWithDenom rank={rankOverall.rank} of={rankOverall.of} />
            ) : (
              "—"
            )
          }
        />
        <Stat
          label="Within quadrant"
          value={
            rankQuadrant ? (
              <RankWithDenom rank={rankQuadrant.rank} of={rankQuadrant.of} />
            ) : (
              "—"
            )
          }
        />
        <Stat
          label="Median DOM · T12M"
          value={
            medianDomT12 !== null ? (
              <>
                <span className="dq-tnum">{medianDomT12.toFixed(1)}</span>
                <span className="ml-1 text-[14px] font-medium text-muted-foreground">
                  days
                </span>
              </>
            ) : (
              "—"
            )
          }
        />
      </div>

      <Link
        href={scorecardHref}
        className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-teal transition-colors hover:text-teal-700"
      >
        View your current scorecard
        <ArrowRight size={13} />
      </Link>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="dq-tnum mt-1.5 text-[19px] font-semibold text-navy">
        {value}
      </div>
    </div>
  );
}

function RankWithDenom({ rank, of }: { rank: number; of: number }) {
  return (
    <span>
      {rank}
      <span className="ml-1 font-medium text-muted-foreground">of {of}</span>
    </span>
  );
}

function ArrowRight({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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
  );
}
