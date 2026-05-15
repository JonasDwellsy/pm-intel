import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtPct } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

function Stat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sublabel && (
        <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}

export function PricingSection({ scorecard }: { scorecard: ScorecardData }) {
  const p = scorecard.pricing;
  return (
    <section id="pricing" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat
            label="T12 median premium"
            value={fmtPct(p.t12MedianPremium, 1, true)}
            sublabel="vs comparable units"
          />
          <Stat
            label="% above market by ≥10%"
            value={fmtPct(p.t12PctAbove10)}
          />
          <Stat
            label="% below market by ≥10%"
            value={fmtPct(p.t12PctBelow10)}
          />
          <Stat
            label="Concession rate (T12)"
            value={fmtPct(p.t12ConcessionRate)}
            sublabel={`Market: ${fmtPct(p.marketConcessionT12)}`}
          />
        </CardContent>
      </Card>
    </section>
  );
}
