import { fmtDate, fmtDays, fmtInt } from "@/lib/format";
import type { MarketSummary } from "@/lib/types";

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "default" | "warn";
}) {
  return (
    <div>
      <p className="dq-eyebrow-muted mb-2">{label}</p>
      <p
        className="dq-mono text-[32px] font-medium leading-none tracking-[-0.01em] text-navy"
      >
        {value}
      </p>
      <p
        className={
          "mt-2 text-xs " +
          (tone === "warn" ? "text-orange" : "text-muted-foreground")
        }
      >
        {sub}
      </p>
    </div>
  );
}

// Submarket descriptor — shape mirrors LoadedMarket.submarket but kept inline
// here so MarketHero stays decoupled from the market-data module. When
// `submarket` is non-null the entire hero block reframes from MSA-level to
// submarket-level: H1 swaps to the submarket name, the subtitle counts the
// submarket-matched operators, the Market Snapshot stats show submarket
// totals, and the intro paragraph opens with submarket framing inside the
// parent MSA. When null, the hero renders exactly as the pre-filter design.
export function MarketHero({
  market,
  methodologyVersion,
  dataAsOf,
  submarket,
}: {
  market: MarketSummary;
  methodologyVersion: string;
  dataAsOf: string;
  submarket?: {
    displayName: string;
    matchedOperatorCount: number;
  } | null;
}) {
  const domVsNational = market.medianDomT12 - 22.5; // rough national baseline; tone-only
  const domWarn = domVsNational > 0;
  const domSub = `${domWarn ? "+" : "−"}${Math.abs(domVsNational).toFixed(1)}d vs national`;
  const filtered = submarket ?? null;

  return (
    <section className="grid items-start gap-12 lg:grid-cols-[1.25fr_1fr]">
      <div>
        <p className="dq-eyebrow mb-4">Property manager intelligence</p>
        {filtered ? (
          <>
            <h1 className="dq-h1">Property Managers in {filtered.displayName}</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              within {market.fullName}
            </p>
          </>
        ) : (
          <h1 className="dq-h1">
            Property Managers in <br />
            {market.fullName}
          </h1>
        )}
        <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {filtered ? (
            <span>
              <span className="dq-mono font-medium text-navy">
                {fmtInt(filtered.matchedOperatorCount)}
              </span>{" "}
              operators with footprint in {filtered.displayName}
            </span>
          ) : (
            <>
              <span>
                <span className="dq-mono font-medium text-navy">
                  {fmtInt(market.operatorCountTotal)}
                </span>{" "}
                operators
              </span>
              <span className="text-muted-2">·</span>
              <span>
                <span className="dq-mono font-medium text-navy">
                  {fmtInt(market.operatorCountEligible)}
                </span>{" "}
                with full ranking
              </span>
            </>
          )}
          <span className="text-muted-2">·</span>
          <span>Trailing 12 months</span>
          <span className="text-muted-2">·</span>
          <span>
            Methodology{" "}
            <span className="dq-mono font-medium text-navy">
              v{methodologyVersion.replace(/^v/, "")}
            </span>
          </span>
        </p>
        <p className="mt-6 max-w-[580px] text-[17px] leading-[1.55] text-foreground/85">
          {filtered ? (
            <>
              Dwellsy IQ ranks every property manager actively leasing units in{" "}
              {filtered.displayName} (within the {market.fullName}). Each
              operator is observed via first-party listing intake, classified
              into one of four portfolio-and-posture quadrants, and scored on
              time-to-lease, rent posture, listing quality, and tenancy
              retention.
            </>
          ) : (
            <>
              Dwellsy IQ ranks every property manager actively leasing units in{" "}
              {market.city}. Each operator is observed via first-party listing
              intake, classified into one of four portfolio-and-posture
              quadrants, and scored on time-to-lease, rent posture, listing
              quality, and tenancy retention.
            </>
          )}
        </p>
      </div>

      <aside className="rounded-lg border border-grid bg-white p-7 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <p className="dq-eyebrow-muted">
            {filtered ? `${filtered.displayName} snapshot` : "Market snapshot"}
          </p>
          <p className="dq-mono text-[11px] uppercase text-muted-foreground tracking-wide">
            {fmtDate(dataAsOf)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-7 gap-y-6">
          {filtered ? (
            <>
              {/* Filtered total === filtered eligible in our data (every PM
                  in the DB carries rankOverall — there are no observed-but-
                  unranked PMs in the v0.6.2 footprint). We surface the
                  matched count under "operators with footprint" so the
                  semantic is honest ("operators we score that touch this
                  submarket"). */}
              <Stat
                label="Operators with footprint"
                value={fmtInt(filtered.matchedOperatorCount)}
                sub={`scored, with units in ${filtered.displayName}`}
              />
              <Stat
                label="Eligible for ranking"
                value={fmtInt(filtered.matchedOperatorCount)}
                sub="≥30 listings, T6M"
              />
              <Stat
                label="MSA-level DOM"
                value={fmtDays(market.medianDomT12)}
                sub={`${domSub} (market context)`}
                tone={domWarn ? "warn" : "default"}
              />
              <Stat
                label="Methodology"
                value={`v${methodologyVersion.replace(/^v/, "")}`}
                sub="published with this market"
              />
            </>
          ) : (
            <>
              <Stat
                label="Total operators"
                value={fmtInt(market.operatorCountTotal)}
                sub="observed in MSA"
              />
              <Stat
                label="Eligible for ranking"
                value={fmtInt(market.operatorCountEligible)}
                sub="≥30 listings, T6M"
              />
              <Stat
                label="MSA median DOM"
                value={fmtDays(market.medianDomT12)}
                sub={domSub}
                tone={domWarn ? "warn" : "default"}
              />
              <Stat
                label="Methodology"
                value={`v${methodologyVersion.replace(/^v/, "")}`}
                sub="published with this market"
              />
            </>
          )}
        </div>
      </aside>
    </section>
  );
}
