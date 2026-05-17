import { SectionHead } from "./SectionHead";
import type { ScorecardData } from "@/lib/types";

// Cohort comparison bar: signed delta against the MSA cohort median YoY rent
// change. Negative values (lagging peers) render in rose; positive (pushing
// rents faster than peers) render in good-green. Pure SVG so it renders the
// same on server, client, and PDF screenshots.
function CohortBar({
  pmYoy,
  cohortYoy,
  pmName,
}: {
  pmYoy: number;
  cohortYoy: number;
  pmName: string;
}) {
  const W = 880;
  const H = 200;
  const padL = 60;
  const padR = 60;
  const innerW = W - padL - padR;
  const trackY = 90;
  const trackH = 36;
  const minY = -0.15; // -15%
  const maxY = 0.15; // +15%
  const xOf = (v: number) =>
    padL +
    ((Math.max(minY, Math.min(maxY, v)) - minY) / (maxY - minY)) * innerW;

  const zeroX = xOf(0);
  const cohortX = xOf(cohortYoy);
  const pmX = xOf(pmYoy);

  const positive = pmYoy >= cohortYoy;
  const fill = positive ? "#3E7C3E" : "#C97B70";

  return (
    <div className="rounded-lg border border-grid bg-white p-7">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        aria-label={`Rent performance vs cohort median`}
      >
        {/* Track */}
        <rect
          x={padL}
          y={trackY}
          width={innerW}
          height={trackH}
          fill="#F2F5F8"
          stroke="#D5DBE3"
          strokeWidth={1}
        />
        {/* Cohort median band — vertical tick + label */}
        <g>
          <line
            x1={cohortX}
            x2={cohortX}
            y1={trackY - 6}
            y2={trackY + trackH + 6}
            stroke="#0F1F3F"
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
          <text
            x={cohortX}
            y={trackY - 12}
            textAnchor="middle"
            fill="#0F1F3F"
            fontSize="11"
            fontWeight={600}
          >
            Cohort median {(cohortYoy * 100).toFixed(1)}%
          </text>
        </g>
        {/* Operator pin */}
        <g>
          <line
            x1={pmX}
            x2={pmX}
            y1={trackY - 18}
            y2={trackY + trackH + 16}
            stroke={fill}
            strokeWidth={2.5}
          />
          <circle
            cx={pmX}
            cy={trackY + trackH / 2}
            r={9}
            fill={fill}
            stroke="#FFFFFF"
            strokeWidth={2.5}
          />
          <text
            x={pmX}
            y={trackY + trackH + 32}
            textAnchor="middle"
            fill={positive ? "#27562B" : "#843225"}
            fontSize="12"
            fontWeight={700}
          >
            {pmName} · {(pmYoy * 100 >= 0 ? "+" : "") +
              (pmYoy * 100).toFixed(1)}%
          </text>
        </g>
        {/* Zero baseline */}
        <line
          x1={zeroX}
          x2={zeroX}
          y1={trackY}
          y2={trackY + trackH}
          stroke="#8A92A2"
          strokeWidth={1}
        />
        {/* Axis ticks */}
        {[-0.1, -0.05, 0, 0.05, 0.1, 0.15].map((t) => (
          <g key={t}>
            <line
              x1={xOf(t)}
              x2={xOf(t)}
              y1={trackY + trackH}
              y2={trackY + trackH + 4}
              stroke="#8A92A2"
            />
            <text
              x={xOf(t)}
              y={trackY + trackH + 50}
              textAnchor="middle"
              fill="#8A92A2"
              fontSize="10"
              fontFamily="var(--font-mono), monospace"
            >
              {`${t > 0 ? "+" : ""}${(t * 100).toFixed(0)}%`}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function RentPerformanceSection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const rp = scorecard.rentPerformance;
  if (!rp) return null;

  const cohortYoy = rp.cohortMedianYoyChange ?? 0;
  const deltaPct = (rp.delta * 100).toFixed(1);
  const deltaSigned = rp.delta >= 0 ? `+${deltaPct}%` : `${deltaPct}%`;
  const stateChip =
    rp.state === "positive"
      ? { className: "dq-pill-green", label: "Pushing rents faster than peers" }
      : rp.state === "negative"
        ? { className: "dq-pill-rose", label: "Lagging peers" }
        : { className: "dq-pill-navy-soft", label: "At peer pace" };

  return (
    <section id="rent-performance" className="dq-section">
      <SectionHead
        num="07"
        title="Rent performance"
        lede={`How ${scorecard.pm.name}'s mix-adjusted YoY rent change compares to the MSA cohort median over the same period. Isolates pricing capability from inherited portfolio quality.`}
      />

      <CohortBar
        pmYoy={rp.pmYoyChange}
        cohortYoy={cohortYoy}
        pmName={scorecard.pm.name}
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className={`dq-pill ${stateChip.className}`}>
          {stateChip.label}
        </span>
        <span className="text-[13px] text-muted-foreground">
          Delta to cohort median{" "}
          <strong className="dq-mono dq-tnum text-navy">{deltaSigned}</strong> ·
          MSA cohort percentile{" "}
          <strong className="dq-mono dq-tnum text-navy">
            {rp.percentileRank.toFixed(0)}
          </strong>
        </span>
      </div>

      <table className="dq-table mt-7">
        <thead>
          <tr>
            <th>Signal</th>
            <th className="num">Value</th>
            <th>Read</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{scorecard.pm.name} · YoY rent change</td>
            <td className="num">
              <strong>
                {rp.pmYoyChange >= 0 ? "+" : ""}
                {(rp.pmYoyChange * 100).toFixed(2)}%
              </strong>
            </td>
            <td className="text-muted-foreground">
              Mix-adjusted by bedroom mix
            </td>
          </tr>
          <tr>
            <td>MSA cohort · median YoY</td>
            <td className="num">
              {(cohortYoy * 100 >= 0 ? "+" : "") +
                (cohortYoy * 100).toFixed(2)}
              %
            </td>
            <td className="text-muted-foreground">
              Median across all eligible PMs in {scorecard.market.name}
            </td>
          </tr>
          <tr>
            <td>Delta</td>
            <td className="num">
              <strong
                className={
                  rp.delta >= 0 ? "dq-val-good" : "dq-val-bad"
                }
              >
                {deltaSigned}
              </strong>
            </td>
            <td className="text-muted-foreground">
              {rp.delta >= 0
                ? "Pricing skill above cohort norm"
                : "Pricing trailing cohort norm"}
            </td>
          </tr>
          <tr>
            <td>MSA cohort percentile</td>
            <td className="num">
              <strong>{rp.percentileRank.toFixed(1)}</strong>
            </td>
            <td className="text-muted-foreground">
              Input to composite ranking at 10% weight
            </td>
          </tr>
        </tbody>
      </table>

      <aside className="dq-callout-soft">
        <p className="dq-callout-tag">Honest limitation</p>
        <p>
          The metric controls for bedroom mix but not for submarket exposure,
          mid-window mix shift, or capital events (renovations). v0.7 is
          targeted for a same-unit-controlled refinement that would remove the
          mix-shift confound and likely justify a heavier weight at that
          point. We weight Rent Performance at 10% of the composite for this
          reason.
        </p>
      </aside>
    </section>
  );
}
