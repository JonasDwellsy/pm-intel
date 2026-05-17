"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionHead } from "./SectionHead";
import {
  dqChartTheme,
  dqGrid,
  dqTick,
  dqTooltipContentStyle,
  dqTooltipLabelStyle,
} from "@/lib/chart-theme";
import type { ScorecardData } from "@/lib/types";

// v0.6.1 rent trajectory: 6 quarters of absolute mix-adjusted median rent, by
// bedroom mix. The composite-input YoY change lives in rentPerformance and
// renders as the headline number above the chart; the chart itself reports
// the trajectory descriptively (Section 06 of the spec is explicit:
// "reported, not ranked").
export function RentTrajectorySection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const data = scorecard.rentTrajectory.map((r) => ({
    quarter: r.quarter,
    median: r.mixAdjMedian,
    n: r.n,
  }));

  // Derive YoY headline from the trajectory (most recent quarter / same
  // quarter prior year). Prefer rentPerformance.pmYoyChange when present —
  // identical math, but already-computed and authoritative.
  const yoy = scorecard.rentPerformance?.pmYoyChange ?? null;
  const yoyLabel =
    yoy === null
      ? "—"
      : `${yoy >= 0 ? "+" : ""}${(yoy * 100).toFixed(1)}%`;

  return (
    <section id="rent-trajectory" className="dq-section">
      <SectionHead
        num="06"
        title="Mix-adjusted rent trajectory"
        lede="Six-quarter trajectory of median rent, adjusted by the operator's bedroom mix. Reported as descriptive context, not as a composite input — rent level reflects portfolio quality more than operator capability."
      />

      <div className="dq-chart-card">
        <div className="dq-chart-head">
          <div>
            <p className="dq-chart-title">
              Mix-adjusted median rent · trailing 6 quarters
            </p>
            <p className="dq-chart-sub">
              Labels are quarter medians (USD) · n = listings backing each
              quarter
            </p>
          </div>
          <div className="dq-chart-legend">
            <span className="dq-mono">
              Headline YoY{" "}
              <strong
                className={
                  yoy === null
                    ? "text-muted-foreground"
                    : yoy >= 0
                      ? "text-good"
                      : "text-bad"
                }
              >
                {yoyLabel}
              </strong>
            </span>
          </div>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ left: 8, right: 24, top: 32, bottom: 32 }}
            >
              <CartesianGrid {...dqGrid} />
              <XAxis
                dataKey="quarter"
                tick={dqTick}
                axisLine={{ stroke: dqChartTheme.colors.grid }}
                tickLine={false}
              />
              <YAxis
                tick={dqTick}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v) =>
                  typeof v === "number"
                    ? `$${(v / 1000).toFixed(1)}k`
                    : String(v)
                }
              />
              <Tooltip
                contentStyle={dqTooltipContentStyle}
                labelStyle={dqTooltipLabelStyle}
                formatter={(v, name) => {
                  if (typeof v !== "number") return String(v ?? "");
                  return name === "median"
                    ? `$${Math.round(v).toLocaleString("en-US")}`
                    : v;
                }}
              />
              <Bar dataKey="median" radius={[2, 2, 2, 2]}>
                {data.map((d) => (
                  <Cell key={d.quarter} fill={dqChartTheme.colors.primary} />
                ))}
                <LabelList
                  dataKey="median"
                  position="top"
                  formatter={(v) =>
                    typeof v === "number"
                      ? `$${Math.round(v).toLocaleString("en-US")}`
                      : ""
                  }
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: dqChartTheme.fontFamily,
                    fill: dqChartTheme.colors.primary,
                  }}
                />
                <LabelList
                  dataKey="n"
                  position="bottom"
                  formatter={(v) => (v !== undefined ? `n=${v}` : "")}
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    fill: dqChartTheme.colors.muted,
                    fontFamily: dqChartTheme.fontFamily,
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="dq-explainer">
          <em>
            <strong>How to read this chart.</strong> Each bar is{" "}
            {scorecard.pm.name}&apos;s mix-adjusted median rent for that quarter
            — bedroom-mix adjusted to isolate posture from inventory drift. The
            headline YoY above is the percent change from the most recent
            quarter to the same quarter one year prior; that number feeds Rent
            Performance (Section 07). Rent level itself is not in the composite
            (Section 09).
          </em>
        </p>
      </div>
    </section>
  );
}
