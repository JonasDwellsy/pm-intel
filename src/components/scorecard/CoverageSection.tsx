import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtInt, fmtDate } from "@/lib/format";
import type { ScorecardData } from "@/lib/types";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-base font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function CoverageSection({ scorecard }: { scorecard: ScorecardData }) {
  const c = scorecard.coverage;
  return (
    <section id="coverage" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>Coverage</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat label="First listing" value={fmtDate(c.firstListing)} />
          <Stat label="Months on platform" value={fmtInt(c.monthsOnPlatform)} />
          <Stat label="Lifetime listings" value={fmtInt(c.lifetimeListings)} />
          <Stat label="Lifetime URUs" value={fmtInt(c.urusLifetime)} />
          <Stat label="T12 listings" value={fmtInt(c.t12Listings)} />
          <Stat label="T12 URUs" value={fmtInt(c.urusT12)} />
          <Stat label="T6 listings" value={fmtInt(c.t6Listings)} />
          <Stat label="Active listings" value={fmtInt(c.activeListings)} />
          <Stat
            label="Institutional"
            value={`${fmtInt(c.institutionalUnits)} units · ${fmtInt(c.institutionalBuildings)} bldgs`}
          />
          <Stat
            label="Small MF"
            value={`${fmtInt(c.smallMfUnits)} units · ${fmtInt(c.smallMfBuildings)} bldgs`}
          />
          <Stat label="Unit-level (large MF)" value={fmtInt(c.unitLevelCount)} />
          <Stat label="SFR" value={fmtInt(c.sfrCount)} />
          <Stat
            label="Total observed units"
            value={fmtInt(c.totalObservedUnits)}
          />
          <Stat label="Cities observed" value={fmtInt(c.citiesObserved)} />
          <Stat label="Data tier" value={c.dataTier} />
        </CardContent>
      </Card>
    </section>
  );
}
