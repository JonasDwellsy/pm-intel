// v0.22 — cross-market trajectory on the operator-level page.
//
// The per-market scorecard has OperatorTrajectorySection (single
// operator). This is its aggregate sibling: it rolls the operator's
// member markets up per quarter — total estimated portfolio (summed) and
// footprint (markets present) over time — so a reader sees whether the
// operator is both growing and expanding. Reuses the shared pure helpers
// (summarizeTrajectory / buildSparkline) so it stays consistent with the
// per-market view.

import {
  summarizeTrajectory,
  buildSparkline,
  type OperatorAggregateTrajectory,
} from "@/lib/operators/trajectory";
import { fmtInt, fmtDate } from "@/lib/format";

const SPARK_W = 560;
const SPARK_H = 96;
const SPARK_PAD = 8;

export function OperatorAggregateTrajectorySection({
  trajectory,
}: {
  trajectory: OperatorAggregateTrajectory;
}) {
  const { points } = trajectory;
  if (points.length === 0) return null;
  // AggregateTrajectoryPoint extends TrajectoryPoint, so the shared
  // summary/sparkline helpers work directly on the rolled-up series.
  const summary = summarizeTrajectory({ pmSlug: "aggregate", points });

  return (
    <section className="mt-6 rounded-lg border border-grid bg-white p-6">
      <h2 className="dq-eyebrow text-teal">Trajectory</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Total estimated portfolio and market footprint across this
        operator&rsquo;s markets, over successive Dwellsy IQ refreshes.
      </p>

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
          {summary.hasTrend && <PortfolioTrend points={points} summary={summary} />}
          <SnapshotTable points={points} />
        </>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-2">
        Tracked since{" "}
        {summary.firstDate ? fmtDate(summary.firstDate) : "—"} ·{" "}
        {summary.pointCount}{" "}
        {summary.pointCount === 1 ? "snapshot" : "snapshots"} · summed across
        member markets · modeled on current methodology.
      </p>
    </section>
  );
}

function PortfolioTrend({
  points,
  summary,
}: {
  points: OperatorAggregateTrajectory["points"];
  summary: ReturnType<typeof summarizeTrajectory>;
}) {
  const spark = buildSparkline(points, SPARK_W, SPARK_H, SPARK_PAD);
  const polyline = spark.map((p) => `${p.x},${p.y}`).join(" ");
  const delta = summary.netPortfolioDelta;
  const tone =
    delta === null || delta === 0
      ? "text-navy"
      : delta > 0
      ? "text-good"
      : "text-bad";
  const label =
    delta === null
      ? null
      : `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${fmtInt(Math.abs(delta))} units since ${
          summary.firstDate ? fmtDate(summary.firstDate) : "tracking began"
        }`;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11.5px] uppercase tracking-wider text-muted-foreground">
          Total est. portfolio
        </span>
        <span className="dq-mono text-[22px] font-semibold tabular-nums text-navy">
          {summary.lastPortfolio !== null ? fmtInt(summary.lastPortfolio) : "—"}
        </span>
        {label && <span className={`text-[13px] font-medium ${tone}`}>{label}</span>}
      </div>
      <svg
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        role="img"
        aria-label={`Total estimated portfolio over ${spark.length} snapshots, oldest on the left, newest on the right`}
        className="mt-3 block h-auto w-full"
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
      {/* Axis endpoints make the time direction explicit. */}
      {spark.length > 0 && (
        <div className="mt-1 flex w-full items-center justify-between text-[10.5px] text-muted-2">
          <span>{fmtDate(spark[0].date)}</span>
          <span className="uppercase tracking-wider">older → newer</span>
          <span>{fmtDate(spark[spark.length - 1].date)}</span>
        </div>
      )}
    </>
  );
}

function SnapshotTable({
  points,
}: {
  points: OperatorAggregateTrajectory["points"];
}) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[460px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-grid text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="py-1.5 pr-4 font-semibold">Refresh</th>
            <th className="py-1.5 pr-4 text-right font-semibold">Total est. portfolio</th>
            <th className="py-1.5 pr-4 text-right font-semibold">Markets present</th>
            <th className="py-1.5 pr-4 text-right font-semibold">Gold</th>
            <th className="py-1.5 text-right font-semibold">Silver</th>
          </tr>
        </thead>
        <tbody>
          {/* Newest first — most recent refresh at the top. (The sparkline
              above stays chronological.) */}
          {[...points].reverse().map((p) => (
            <tr key={p.date} className="border-b border-grid/60">
              <td className="py-1.5 pr-4 text-navy">{fmtDate(p.date)}</td>
              <td className="py-1.5 pr-4 text-right dq-mono tabular-nums text-navy">
                {p.portfolioPoint !== null ? fmtInt(p.portfolioPoint) : "—"}
              </td>
              <td className="py-1.5 pr-4 text-right dq-mono tabular-nums text-foreground/80">
                {p.marketsPresent}
              </td>
              <td className="py-1.5 pr-4 text-right dq-mono tabular-nums text-foreground/80">
                {p.goldCount}
              </td>
              <td className="py-1.5 text-right dq-mono tabular-nums text-foreground/80">
                {p.silverCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
