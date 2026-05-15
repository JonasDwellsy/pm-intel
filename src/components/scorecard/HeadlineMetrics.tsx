import { Card, CardContent } from "@/components/ui/card";
import { fmtDays, fmtInt } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

function KPI({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        {sublabel && (
          <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function HeadlineMetrics({ scorecard }: { scorecard: ScorecardData }) {
  const { rank, performance, coverage } = scorecard;
  const domGap = performance.domT12 - performance.marketDomT12;
  const domGapLabel =
    domGap === 0
      ? "matches market"
      : domGap > 0
        ? `${domGap.toFixed(1)}d slower than market`
        : `${Math.abs(domGap).toFixed(1)}d faster than market`;

  return (
    <section
      id="headline"
      aria-label="Headline metrics"
      className="grid grid-cols-2 gap-4 md:grid-cols-4"
    >
      <KPI
        label="Overall rank"
        value={`#${rank.overall} / ${rank.overallTotal}`}
        sublabel={`MSA-wide (${scorecard.market.name})`}
      />
      <KPI
        label="Quadrant rank"
        value={
          rank.quadrant
            ? `#${rank.quadrant} / ${rank.quadrantTotal}`
            : `— / ${rank.quadrantTotal}`
        }
        sublabel={scorecard.pm.quadrant}
      />
      <KPI
        label="Days on market (T12)"
        value={fmtDays(performance.domT12)}
        sublabel={domGapLabel}
      />
      <KPI
        label="Observed units"
        value={fmtInt(coverage.totalObservedUnits)}
        sublabel={`${coverage.citiesObserved} cities · ${fmtInt(coverage.t12Listings)} listings T12`}
      />
    </section>
  );
}
