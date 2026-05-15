import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtNumber, fmtInt } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

export function CoverageConfidenceSection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const s = scorecard.selectionBias;
  const tone =
    s.ratio >= 0.85 && s.ratio <= 1.5
      ? "default"
      : s.ratio > 1.5
        ? "secondary"
        : "outline";

  return (
    <section id="coverage-confidence" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>Coverage confidence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Whether the observed Dwellsy listing volume matches what would be
            expected for a portfolio of this size and composition. A ratio near
            1.0 means we likely see the full book; far below 1.0 means the
            scorecard may be partial.
          </p>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Buildings tracked
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {fmtInt(s.buildings)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Observed intensity
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {fmtNumber(s.observed, 2)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Expected intensity
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {fmtNumber(s.expected, 2)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Ratio
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {fmtNumber(s.ratio, 2)}×
              </p>
            </div>
          </div>
          <div>
            <Badge variant={tone}>{s.assessment}</Badge>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
