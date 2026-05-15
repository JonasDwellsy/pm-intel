"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScorecardData } from "@/lib/types";

export function TimeContextSection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const series = scorecard.performance.timeSeries.map((p) => ({
    year: p.year,
    pm: p.domDays,
    market: p.marketDomDays,
    gap: p.gapPct,
  }));

  return (
    <section id="time-context" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>Time context — five-year DOM trend</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            How {scorecard.pm.name}'s leasing velocity has tracked the{" "}
            {scorecard.market.name} market year over year.
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={series}
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  label={{
                    value: "Days on market",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "#64748b" },
                  }}
                />
                <Tooltip
                  formatter={(v, name) => {
                    if (typeof v !== "number") return String(v ?? "");
                    return name === "gap" ? `${v}%` : `${v.toFixed(1)} d`;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="pm"
                  name={scorecard.pm.name}
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="market"
                  name={`${scorecard.market.name} market`}
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">
            {series.map((s) => {
              const tone =
                s.gap < 0
                  ? "text-emerald-700"
                  : s.gap > 0
                    ? "text-rose-700"
                    : "text-muted-foreground";
              return (
                <div key={s.year}>
                  <div className="text-muted-foreground">{s.year}</div>
                  <div className={`font-medium tabular-nums ${tone}`}>
                    {s.gap > 0 ? "+" : ""}
                    {s.gap}% gap
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
