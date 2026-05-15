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
import type { ScorecardData } from "@/lib/types";

export function PerformanceRankChart({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const { performance, pm } = scorecard;
  const data = [
    { name: pm.name, value: performance.domT12, kind: "pm" as const },
    {
      name: `Peer · ${pm.quadrant.split(" / ").join(" / ")}`,
      value: performance.peerQuadrantDomT12,
      kind: "peer" as const,
    },
    {
      name: `Market · ${scorecard.market.name}`,
      value: performance.marketDomT12,
      kind: "market" as const,
    },
  ];

  const pmFaster = performance.domT12 < performance.marketDomT12;
  const pmColor = pmFaster ? "#15803d" : "#b91c1c"; // green-700 vs red-700
  const colors: Record<typeof data[number]["kind"], string> = {
    pm: pmColor,
    peer: "#64748b", // slate-500
    market: "#94a3b8", // slate-400
  };

  return (
    <div>
      <p className="mb-2 text-sm font-medium">DOM T12 (days) — context</p>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 16, right: 32, top: 8, bottom: 8 }}
          >
            <CartesianGrid horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={170}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.1)" }}
              formatter={(v) =>
                typeof v === "number" ? `${v.toFixed(1)} d` : String(v ?? "")
              }
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((d) => (
                <Cell key={d.name} fill={colors[d.kind]} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v) =>
                  typeof v === "number" ? `${v.toFixed(1)}d` : String(v ?? "")
                }
                style={{ fontSize: 12, fill: "#0f172a" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
