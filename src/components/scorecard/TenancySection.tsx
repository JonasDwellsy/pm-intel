"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtNumber, fmtInt, fmtPct } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

export function TenancySection({ scorecard }: { scorecard: ScorecardData }) {
  const t = scorecard.tenancy;

  type Row = {
    asset: string;
    gap: number;
    p25: number;
    p50: number;
    p75: number;
    n: number;
    position: string | null;
    pctMedian: number | null;
    errLow: number;
    errHigh: number;
  };

  const rows: Row[] = [];
  if (t.aptGap !== null && t.aptP25 !== null && t.aptP50 !== null && t.aptP75 !== null) {
    rows.push({
      asset: "Apartments",
      gap: t.aptGap,
      p25: t.aptP25,
      p50: t.aptP50,
      p75: t.aptP75,
      n: t.aptN,
      position: t.aptPosition,
      pctMedian: t.aptPctMedian,
      errLow: t.aptP50 - t.aptP25,
      errHigh: t.aptP75 - t.aptP50,
    });
  }
  if (t.sfrGap !== null && t.sfrP25 !== null && t.sfrP50 !== null && t.sfrP75 !== null) {
    rows.push({
      asset: "Houses",
      gap: t.sfrGap,
      p25: t.sfrP25,
      p50: t.sfrP50,
      p75: t.sfrP75,
      n: t.sfrN,
      position: t.sfrPosition,
      pctMedian: t.sfrPctMedian,
      errLow: t.sfrP50 - t.sfrP25,
      errHigh: t.sfrP75 - t.sfrP50,
    });
  }

  // Chart data places the cohort median bar, with error bars covering p25→p75,
  // and a separate "PM" marker bar in front.
  const chartData = rows.map((r) => ({
    asset: r.asset,
    cohort: r.p50,
    pm: r.gap,
    error: [r.errLow, r.errHigh] as [number, number],
  }));

  return (
    <section id="tenancy" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>Tenancy retention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Median months units stay leased before turning over. Cohort range
            shows the p25–p75 of comparable operators; this PM's value is plotted
            alongside.
          </p>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Total units
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {fmtInt(t.totalUnits)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Multi-episode units
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {fmtInt(t.multiEpisodeUnits)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Multi-episode share
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {fmtPct(t.multiEpisodePct, 0)}
              </p>
            </div>
          </div>

          {chartData.length > 0 ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ left: 8, right: 32, top: 8, bottom: 8 }}
                >
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <XAxis dataKey="asset" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    label={{
                      value: "Months held",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 11, fill: "#64748b" },
                    }}
                  />
                  <Tooltip
                    formatter={(v) =>
                      typeof v === "number" ? `${v.toFixed(1)} mo` : String(v ?? "")
                    }
                  />
                  <Bar dataKey="cohort" name="Cohort median" fill="#cbd5e1">
                    <ErrorBar
                      dataKey="error"
                      width={6}
                      strokeWidth={2}
                      stroke="#475569"
                    />
                  </Bar>
                  <Bar dataKey="pm" name="This PM" fill="#0f172a">
                    {chartData.map((d) => (
                      <Cell
                        key={d.asset}
                        fill={d.pm >= d.cohort ? "#15803d" : "#b91c1c"}
                      />
                    ))}
                    <LabelList
                      dataKey="pm"
                      position="top"
                      formatter={(v) =>
                        typeof v === "number" ? `${v.toFixed(1)}mo` : String(v ?? "")
                      }
                      style={{ fontSize: 11, fill: "#0f172a" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tenancy data available for this asset mix.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((r) => (
              <div
                key={r.asset}
                className="rounded-md border border-border bg-muted/30 p-3 text-sm"
              >
                <div className="font-medium">{r.asset}</div>
                <div className="mt-1 text-muted-foreground">
                  PM {fmtNumber(r.gap, 1)} mo · cohort p25–p75{" "}
                  {fmtNumber(r.p25, 1)}–{fmtNumber(r.p75, 1)} mo · n={fmtInt(r.n)}
                </div>
                {r.position && (
                  <div className="mt-1 text-xs">
                    Position: <span className="font-medium">{r.position}</span>
                    {r.pctMedian !== null && (
                      <> · {fmtInt(r.pctMedian)}% of cohort median</>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
