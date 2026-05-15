import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScorecardData } from "@/lib/types";
import { QuadrantGrid } from "./QuadrantGrid";

export function WhyThisQuadrantSection({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  return (
    <section id="why-this-quadrant" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>Why this quadrant</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[1fr_320px]">
          <p className="text-sm leading-relaxed">
            {scorecard.classificationRationale}
          </p>
          <div>
            <QuadrantGrid
              quadrant={scorecard.pm.quadrant}
              hybrid={scorecard.pm.hybrid}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
