import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDays, fmtInt } from "@/lib/format";

type QuadrantStats = {
  count: number;
  medianDomT12: number | null;
};

const QUADRANT_LABELS: Array<{ key: string; row: string; col: string }> = [
  { key: "MF/BTR / Independent", row: "MF / BTR", col: "Independent" },
  { key: "MF/BTR / Institutional", row: "MF / BTR", col: "Institutional" },
  { key: "Scattered Site / Independent", row: "Scattered Site", col: "Independent" },
  { key: "Scattered Site / Institutional", row: "Scattered Site", col: "Institutional" },
];

export function QuadrantSummaryCard({
  summary,
  hybridCount = 0,
}: {
  summary: Record<string, QuadrantStats>;
  hybridCount?: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Operator distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {QUADRANT_LABELS.map((q) => {
            const s = summary[q.key] ?? { count: 0, medianDomT12: null };
            const empty = s.count === 0;
            return (
              <div
                key={q.key}
                className={
                  "rounded-md border p-4 " +
                  (empty
                    ? "border-dashed border-border bg-muted/20 text-muted-foreground"
                    : "border-border bg-card")
                }
              >
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {q.row}
                </div>
                <div className="text-sm font-medium">{q.col}</div>
                <div className="mt-3 flex items-baseline justify-between">
                  <div className="text-2xl font-semibold tabular-nums">
                    {fmtInt(s.count)}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {fmtDays(s.medianDomT12)} median
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {hybridCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Plus {fmtInt(hybridCount)} hybrid operator{hybridCount === 1 ? "" : "s"}{" "}
            straddling two quadrants.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
