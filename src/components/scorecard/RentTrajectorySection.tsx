"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
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

export function RentTrajectorySection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const data = scorecard.rentTrajectory.map((r) => ({
    year: r.year,
    premium: r.premiumPct,
    n: r.n,
  }));

  return (
    <section id="rent-trajectory" className="dq-section">
      <SectionHead
        num="06"
        title="Mix-adjusted rent trajectory"
        lede="Median rent premium (or discount) versus comparable units, year by year. Labels show observed listings each year."
      />

      <div className="dq-chart-card">
        <div className="dq-chart-head">
          <div>
            <p className="dq-chart-title">Rent premium vs. comparable units</p>
            <p className="dq-chart-sub">
              Mix-adjusted to peer cohort · zero line is the market reference
            </p>
          </div>
          <div className="dq-chart-legend">
            <span>
              <span
                className="dq-legend-swatch"
                style={{ background: dqChartTheme.colors.good }}
              />
              Premium
            </span>
            <span>
              <span
                className="dq-legend-swatch"
                style={{ background: dqChartTheme.colors.bad }}
              />
              Discount
            </span>
          </div>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ left: 8, right: 24, top: 24, bottom: 24 }}
            >
              <CartesianGrid {...dqGrid} />
              <XAxis
                dataKey="year"
                tick={dqTick}
                axisLine={{ stroke: dqChartTheme.colors.grid }}
                tickLine={false}
              />
              <YAxis
                tick={dqTick}
                axisLine={false}
                tickLine={false}
                unit="%"
                width={42}
              />
              <ReferenceLine
                y={0}
                stroke={dqChartTheme.colors.primary}
                strokeWidth={1}
              />
              <Tooltip
                contentStyle={dqTooltipContentStyle}
                labelStyle={dqTooltipLabelStyle}
                formatter={(v, name) => {
                  if (typeof v !== "number") return String(v ?? "");
                  return name === "premium" ? `${v.toFixed(1)}%` : v;
                }}
              />
              <Bar dataKey="premium" radius={[2, 2, 2, 2]}>
                {data.map((d) => (
                  <Cell
                    key={d.year}
                    fill={
                      d.premium >= 0
                        ? dqChartTheme.colors.good
                        : dqChartTheme.colors.bad
                    }
                  />
                ))}
                <LabelList
                  dataKey="premium"
                  position="top"
                  formatter={(v) =>
                    typeof v === "number"
                      ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%`
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
                  formatter={(v) =>
                    v !== undefined ? `n=${v}` : ""
                  }
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
            <strong>How to read this chart.</strong> Bars are positive when{" "}
            {scorecard.pm.name}'s median rent exceeds the cohort median for
            matched units of comparable size, vintage, and amenity profile, and
            negative when it sits below. Magnitude is mix-adjusted, so the
            value isolates pricing posture from unit-mix effects.
          </em>
        </p>
      </div>
    </section>
  );
}
