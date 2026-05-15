"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
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

export function TimeContextSection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const series = scorecard.performance.timeSeries.map((p) => ({
    year: p.year,
    op: p.domDays,
    market: p.marketDomDays,
    gap: p.gapPct,
  }));

  return (
    <section id="time-context" className="dq-section">
      <SectionHead
        num="05"
        title="Performance in time context — DOM"
        lede={`How ${scorecard.pm.name}'s leasing velocity has tracked the ${scorecard.market.name} market year over year.`}
      />

      <div className="dq-chart-card">
        <div className="dq-chart-head">
          <div>
            <p className="dq-chart-title">DOM trajectory · five-year</p>
            <p className="dq-chart-sub">
              Operator vs. MSA market median, by listing year
            </p>
          </div>
          <div className="dq-chart-legend">
            <span>
              <span
                className="dq-legend-line"
                style={{ background: dqChartTheme.colors.accent }}
              />
              {scorecard.pm.name}
            </span>
            <span style={{ color: dqChartTheme.colors.primary }}>
              <span className="dq-legend-line dq-legend-line-dashed" />
              {scorecard.market.name} market
            </span>
          </div>
        </div>

        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={series}
              margin={{ left: 8, right: 24, top: 12, bottom: 8 }}
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
                unit="d"
                width={36}
              />
              <Tooltip
                contentStyle={dqTooltipContentStyle}
                labelStyle={dqTooltipLabelStyle}
                formatter={(v, name) => {
                  if (typeof v !== "number") return String(v ?? "");
                  if (name === "gap") return `${v}%`;
                  return `${v.toFixed(1)} d`;
                }}
              />
              <Line
                type="monotone"
                dataKey="op"
                name={scorecard.pm.name}
                stroke={dqChartTheme.colors.accent}
                strokeWidth={2.2}
                dot={{ r: 4.5, fill: dqChartTheme.colors.accent, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="market"
                name={`${scorecard.market.name} market`}
                stroke={dqChartTheme.colors.primary}
                strokeWidth={1.6}
                strokeDasharray="4 4"
                dot={{
                  r: 3.5,
                  fill: "#FFFFFF",
                  stroke: dqChartTheme.colors.primary,
                  strokeWidth: 1.6,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="dq-chart-sub-axis">Gap to market</p>
        <div className="h-32 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={series}
              margin={{ left: 8, right: 24, top: 8, bottom: 0 }}
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
                width={36}
              />
              <ReferenceLine y={0} stroke={dqChartTheme.colors.primary} strokeWidth={1} />
              <Tooltip
                contentStyle={dqTooltipContentStyle}
                labelStyle={dqTooltipLabelStyle}
                formatter={(v) => (typeof v === "number" ? `${v}%` : String(v ?? ""))}
              />
              <Bar dataKey="gap" radius={[2, 2, 0, 0]}>
                {series.map((s) => (
                  <Cell
                    key={s.year}
                    fill={
                      s.gap <= 0
                        ? dqChartTheme.colors.good
                        : dqChartTheme.colors.accent
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
