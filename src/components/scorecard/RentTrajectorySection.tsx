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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <section id="rent-trajectory" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>Rent trajectory</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Median rent premium (or discount) vs comparable units, year by year.
            Bar labels show the number of listings each year.
          </p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  formatter={(v, name) => {
                    if (typeof v !== "number") return String(v ?? "");
                    return name === "premium" ? `${v.toFixed(1)}%` : v;
                  }}
                />
                <ReferenceLine y={0} stroke="#64748b" />
                <Bar dataKey="premium" radius={[4, 4, 0, 0]}>
                  {data.map((d) => (
                    <Cell
                      key={d.year}
                      fill={d.premium >= 0 ? "#15803d" : "#b91c1c"}
                    />
                  ))}
                  <LabelList
                    dataKey="n"
                    position="top"
                    formatter={(v) => (v !== undefined ? `n=${v}` : "")}
                    style={{ fontSize: 10, fill: "#64748b" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
