import { fmtDate, fmtDays, fmtInt } from "@/lib/format";
import type { MarketSummary } from "@/lib/types";

export function MarketHero({
  market,
  methodologyVersion,
  dataAsOf,
}: {
  market: MarketSummary;
  methodologyVersion: string;
  dataAsOf: string;
}) {
  return (
    <header className="border-b border-border pb-6">
      <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span>Methodology {methodologyVersion}</span>
        <span aria-hidden>·</span>
        <span>Data as of {fmtDate(dataAsOf)}</span>
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">
        Property managers in {market.city}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{market.fullName}</p>
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">Eligible operators:</span>{" "}
          <span className="font-medium tabular-nums">
            {fmtInt(market.operatorCountEligible)}
          </span>
          <span className="text-muted-foreground">
            {" "}/ {fmtInt(market.operatorCountTotal)} total
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Median DOM (T12):</span>{" "}
          <span className="font-medium tabular-nums">
            {fmtDays(market.medianDomT12)}
          </span>
        </div>
      </div>
    </header>
  );
}
