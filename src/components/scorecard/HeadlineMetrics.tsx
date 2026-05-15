import { fmtDays, fmtInt } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

type Trend = "good" | "bad" | "neutral";

function Tile({
  eyebrow,
  value,
  unit,
  compare,
  sample,
  trend,
  trendValue,
}: {
  eyebrow: string;
  value: string;
  unit?: string;
  compare?: React.ReactNode;
  sample?: string;
  trend?: Trend;
  trendValue?: string;
}) {
  const trendColor =
    trend === "good"
      ? "text-good"
      : trend === "bad"
        ? "text-bad"
        : "text-muted-foreground";
  return (
    <div className="dq-tile">
      <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-teal">
        {eyebrow}
      </p>
      <p className="mt-3.5 leading-none">
        <span className="dq-tnum text-[36px] font-extrabold tracking-[-0.025em] text-orange">
          {value}
        </span>
        {unit && (
          <span className="text-xl font-semibold text-orange">{unit}</span>
        )}
      </p>
      {compare && (
        <p className="mt-3.5 text-[13px] text-muted-foreground">
          {trend && trendValue && (
            <span className={`mr-1 text-[13px] font-bold ${trendColor}`}>
              {trendValue}
            </span>
          )}
          {compare}
        </p>
      )}
      {sample && (
        <p className="mt-1 text-xs italic text-muted-2">{sample}</p>
      )}
    </div>
  );
}

export function HeadlineMetrics({ scorecard }: { scorecard: ScorecardData }) {
  const { rank, performance, coverage } = scorecard;
  const domGap = performance.domT12 - performance.marketDomT12;
  const domTrend: Trend = domGap < 0 ? "good" : domGap > 0 ? "bad" : "neutral";
  const domTrendValue =
    domGap === 0
      ? "—"
      : domGap < 0
        ? `▼ ${Math.abs(domGap).toFixed(1)}d`
        : `▲ ${domGap.toFixed(1)}d`;

  return (
    <section
      id="headline"
      aria-label="Headline metrics"
      className="dq-section grid grid-cols-2 gap-4 md:grid-cols-4"
    >
      <Tile
        eyebrow="Overall rank"
        value={`#${rank.overall}`}
        unit={` / ${rank.overallTotal}`}
        compare={
          <>
            among <strong className="font-semibold text-navy">{rank.overallTotal}</strong> eligible operators
          </>
        }
        sample={`MSA: ${scorecard.market.name}`}
      />
      <Tile
        eyebrow="Quadrant rank"
        value={rank.quadrant ? `#${rank.quadrant}` : "—"}
        unit={` / ${rank.quadrantTotal}`}
        compare={
          <>
            within <strong className="font-semibold text-navy">{scorecard.pm.quadrant}</strong>
          </>
        }
        sample={`Peer median DOM ${fmtDays(rank.quadrantMedianDomT12)}`}
      />
      <Tile
        eyebrow="Median DOM (T12)"
        value={performance.domT12.toFixed(1)}
        unit=" days"
        compare={
          <>
            vs. market <strong className="font-semibold text-navy">{performance.marketDomT12.toFixed(1)}d</strong>
          </>
        }
        sample={`n = ${fmtInt(performance.domT12N)} listings (T12)`}
        trend={domTrend}
        trendValue={domTrendValue}
      />
      <Tile
        eyebrow="Observed units"
        value={fmtInt(coverage.totalObservedUnits)}
        compare={
          <>
            across <strong className="font-semibold text-navy">{fmtInt(coverage.citiesObserved)}</strong> cities
          </>
        }
        sample={`${fmtInt(coverage.t12Listings)} listings T12 · ${coverage.dataTier.toLowerCase()}`}
      />
    </section>
  );
}
