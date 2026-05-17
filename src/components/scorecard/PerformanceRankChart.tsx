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
import {
  dqChartTheme,
  dqGrid,
  dqTick,
  dqTooltipContentStyle,
  dqTooltipLabelStyle,
} from "@/lib/chart-theme";
import type { ScorecardData } from "@/lib/types";

export function PerformanceRankChart({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const { performance, pm } = scorecard;
  const data = [
    {
      name: pm.name,
      value: performance.domT12,
      kind: "op" as const,
    },
    {
      name: `Peer · ${pm.quadrant}`,
      value: performance.peerQuadrantDomT12,
      kind: "quad" as const,
    },
    {
      name: `${scorecard.market.name} market`,
      value: performance.marketDomT12,
      kind: "other" as const,
    },
  ];

  const colorMap = {
    op: dqChartTheme.colors.accent,
    quad: dqChartTheme.colors.quad,
    other: dqChartTheme.colors.cohort,
  } as const;

  return (
    <div className="dq-chart-card">
      <div className="dq-chart-head">
        <div>
          <p className="dq-chart-title">DOM T12 — peer ranking context</p>
          <p className="dq-chart-sub">
            Lower is faster · operator-of-record in orange
          </p>
        </div>
        <div className="dq-chart-legend">
          <span>
            <span
              className="dq-legend-swatch"
              style={{ background: dqChartTheme.colors.accent }}
            />
            Operator
          </span>
          <span>
            <span
              className="dq-legend-swatch"
              style={{ background: dqChartTheme.colors.quad }}
            />
            Within quadrant
          </span>
          <span>
            <span
              className="dq-legend-swatch"
              style={{ background: dqChartTheme.colors.cohort }}
            />
            Other cohort
          </span>
        </div>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 16, right: 48, top: 12, bottom: 8 }}
          >
            <CartesianGrid {...dqGrid} horizontal={false} />
            <XAxis
              type="number"
              tick={dqTick}
              axisLine={{ stroke: dqChartTheme.colors.grid }}
              tickLine={false}
              unit="d"
            />
            <YAxis
              type="category"
              dataKey="name"
              width={200}
              tick={{ ...dqTick, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.08)" }}
              contentStyle={dqTooltipContentStyle}
              labelStyle={dqTooltipLabelStyle}
              formatter={(v) =>
                typeof v === "number" ? `${v.toFixed(1)} d` : String(v ?? "")
              }
            />
            {performance.peerQuadrantDomT12 !== null && (
              <ReferenceLine
                x={performance.peerQuadrantDomT12}
                stroke={dqChartTheme.colors.teal}
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{
                  value: `Peer quadrant median ${performance.peerQuadrantDomT12.toFixed(1)}d`,
                  position: "top",
                  fill: dqChartTheme.colors.teal,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            )}
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((d) => (
                <Cell key={d.name} fill={colorMap[d.kind]} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v) =>
                  typeof v === "number" ? `${v.toFixed(1)}d` : String(v ?? "")
                }
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  fill: dqChartTheme.colors.primary,
                  fontFamily: dqChartTheme.fontFamily,
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
