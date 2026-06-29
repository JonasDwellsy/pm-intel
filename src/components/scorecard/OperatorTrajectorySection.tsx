// v0.22 (3a) — operator trajectory section on the per-market scorecard.
//
// Hand-rolled SVG sparkline (matches the no-chart-lib convention used by
// the coverage map) of the estimated-portfolio series over time, plus a
// compact per-snapshot table for the underlying values + star profile.
// Thin history (≤1 valued point — the norm for newest-market operators
// until the 3b backfill lands) collapses to a "first tracked" line.

import {
  summarizeTrajectory,
  buildSparkline,
  type OperatorTrajectory,
} from "@/lib/operators/trajectory";
import { fmtInt, fmtDate } from "@/lib/format";

const SPARK_W = 560;
const SPARK_H = 96;
const SPARK_PAD = 8;

export function OperatorTrajectorySection({
  trajectory,
}: {
  trajectory: OperatorTrajectory;
}) {
  const { points } = trajectory;
  if (points.length === 0) return null;
  const summary = summarizeTrajectory(trajectory);

  return (
    <section className="rounded-lg border border-grid bg-white p-6">
      <h2 className="dq-eyebrow text-teal">Trajectory</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        How this operator has tracked across Dwellsy IQ refreshes.
      </p>

      {/* Single snapshot → nothing to trend yet. Two or more → show the
          per-refresh detail always (star + eligibility history is
          meaningful even when the estimator can't size the portfolio),
          and add the portfolio sparkline only when ≥2 refreshes carry a
          portfolio value. */}
      {summary.pointCount === 1 ? (
        <p className="mt-4 text-[14px] leading-relaxed text-foreground/80">
          First tracked{" "}
          <span className="font-medium text-navy">
            {summary.firstDate ? fmtDate(summary.firstDate) : "recently"}
          </span>
          . A trend builds with each monthly refresh.
        </p>
      ) : (
        <>
          {summary.hasTrend && (
            <PortfolioTrend trajectory={trajectory} summary={summary} />
          )}
          <SnapshotTable trajectory={trajectory} />
        </>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-2">
        Tracked since{" "}
        {summary.firstDate ? fmtDate(summary.firstDate) : "—"} ·{" "}
        {summary.pointCount}{" "}
        {summary.pointCount === 1 ? "snapshot" : "snapshots"} · modeled on
        current methodology.
      </p>
    </section>
  );
}

function PortfolioTrend({
  trajectory,
  summary,
}: {
  trajectory: OperatorTrajectory;
  summary: ReturnType<typeof summarizeTrajectory>;
}) {
  const spark = buildSparkline(trajectory.points, SPARK_W, SPARK_H, SPARK_PAD);
  const polyline = spark.map((p) => `${p.x},${p.y}`).join(" ");
  const delta = summary.netPortfolioDelta;
  const deltaTone =
    delta === null || delta === 0
      ? "text-navy"
      : delta > 0
      ? "text-good"
      : "text-bad";
  const deltaLabel =
    delta === null
      ? null
      : `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${fmtInt(Math.abs(delta))} units since ${
          summary.firstDate ? fmtDate(summary.firstDate) : "tracking began"
        }`;

  return (
    <>
      {/* Headline: latest estimate + net change */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11.5px] uppercase tracking-wider text-muted-foreground">
          Est. portfolio
        </span>
        <span className="dq-mono text-[22px] font-semibold tabular-nums text-navy">
          {summary.lastPortfolio !== null ? fmtInt(summary.lastPortfolio) : "—"}
        </span>
        {deltaLabel && (
          <span className={`text-[13px] font-medium ${deltaTone}`}>
            {deltaLabel}
          </span>
        )}
      </div>

      {/* Sparkline */}
      <svg
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        role="img"
        aria-label={`Estimated portfolio over ${spark.length} snapshots`}
        className="mt-3 block h-auto w-full max-w-[560px]"
      >
        <polyline
          points={polyline}
          fill="none"
          stroke="#0E7C86"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {spark.map((p) => (
          <circle key={p.date} cx={p.x} cy={p.y} r={2.5} fill="#0E7C86" />
        ))}
      </svg>
    </>
  );
}

function SnapshotTable({ trajectory }: { trajectory: OperatorTrajectory }) {
  return (
    <>
      {/* Per-snapshot detail — star + eligibility history is meaningful
          even when the estimator can't size the portfolio. */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-grid text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="py-1.5 pr-4 font-semibold">Refresh</th>
              <th className="py-1.5 pr-4 text-right font-semibold">Est. portfolio</th>
              <th className="py-1.5 pr-4 text-right font-semibold">Gold</th>
              <th className="py-1.5 pr-4 text-right font-semibold">Silver</th>
              <th className="py-1.5 font-semibold">Ranked</th>
            </tr>
          </thead>
          <tbody>
            {trajectory.points.map((p) => (
              <tr key={p.date} className="border-b border-grid/60">
                <td className="py-1.5 pr-4 text-navy">{fmtDate(p.date)}</td>
                <td className="py-1.5 pr-4 text-right dq-mono tabular-nums text-navy">
                  {p.portfolioPoint !== null ? fmtInt(p.portfolioPoint) : "—"}
                </td>
                <td className="py-1.5 pr-4 text-right dq-mono tabular-nums text-foreground/80">
                  {p.goldCount}
                </td>
                <td className="py-1.5 pr-4 text-right dq-mono tabular-nums text-foreground/80">
                  {p.silverCount}
                </td>
                <td className="py-1.5 text-foreground/70">
                  {p.eligible ? "Yes" : "No"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
