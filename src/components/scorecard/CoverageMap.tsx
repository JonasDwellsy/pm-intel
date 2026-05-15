import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScorecardData } from "@/lib/types";

export function CoverageMap({ scorecard }: { scorecard: ScorecardData }) {
  const { geographicCoverage } = scorecard;
  return (
    <section id="geography" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>Geographic coverage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed">{geographicCoverage.citiesText}</p>
          <div className="aspect-[3/1] w-full rounded-md border border-dashed border-border bg-muted/30">
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {geographicCoverage.coverageMapPoints.length === 0
                ? "Coverage map renders here (lat/lon data not yet wired)"
                : `${geographicCoverage.coverageMapPoints.length} mapped points`}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
