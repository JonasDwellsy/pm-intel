import Link from "next/link";
import { fmtDays, fmtInt } from "@/lib/format";
import type { StateMarketSummary } from "@/lib/state-data";

// v0.6.3 Patch 5 — MSA card for the state landing grid. Each card is a
// mini MarketHero block: MSA name + state sublabel + 4 tile metrics
// (active operators / eligible / median DOM / rent growth T12), each with
// the same shapes the MarketHero hero tiles render. The entire card is
// clickable to the market landing page.
//
// Grid layout is owned by the parent state page (StatePage): 1 column on
// mobile, 2 on md, 3 on lg+. A 5-MSA state (Tennessee) lays out 3+2 on lg.
// Single-MSA states render one card sitting left-aligned within the grid.

function MiniStat({
  label,
  value,
  benchmark,
  benchmarkTone = "neutral",
}: {
  label: string;
  value: string;
  benchmark?: string;
  benchmarkTone?: "good" | "bad" | "neutral";
}) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-2">
        {label}
      </p>
      <p className="dq-mono mt-1 text-[18px] font-medium leading-none text-navy tracking-[-0.01em]">
        {value}
      </p>
      {benchmark && (
        <p
          className={
            "mt-0.5 text-[11px] font-medium " +
            (benchmarkTone === "good"
              ? "text-good"
              : benchmarkTone === "bad"
                ? "text-orange"
                : "text-muted-foreground")
          }
        >
          {benchmark}
        </p>
      )}
    </div>
  );
}

function fmtRentGrowthPct(decimal: number | null): string {
  if (decimal === null) return "—";
  const pct = decimal * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

// Same ±0.2pp neutral band as MarketHero — small deltas don't render as a
// directional signal so the cards don't broadcast noise.
function fmtRentDelta(
  pp: number | null
): { text: string; tone: "good" | "bad" | "neutral" } {
  if (pp === null) return { text: "vs national: —", tone: "neutral" };
  const abs = Math.abs(pp);
  if (abs <= 0.2) return { text: "at national", tone: "neutral" };
  const sign = pp > 0 ? "+" : "−";
  return {
    text: `${sign}${abs.toFixed(1)}pp vs national`,
    tone: pp > 0 ? "good" : "bad",
  };
}

export function MarketCard({
  market,
  stateSlug,
  stateName,
}: {
  market: StateMarketSummary;
  stateSlug: string;
  stateName: string;
}) {
  const href = `/property-managers/${stateSlug}/${market.citySlug}`;
  const rentGrowth = fmtRentGrowthPct(market.marketRentGrowthT12);
  const rentDelta = fmtRentDelta(market.marketRentGrowthDeltaVsNationalPp);

  return (
    <Link
      href={href}
      aria-label={`View ${market.city} market`}
      className="group block rounded-lg border border-grid bg-white p-5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgb(15_31_63_/_0.18),_0_2px_6px_rgb(15_31_63_/_0.06)]"
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[22px] font-semibold leading-tight text-navy tracking-[-0.012em]">
            {market.city}
          </h3>
          <p className="mt-0.5 text-[11.5px] uppercase tracking-[0.1em] text-muted-2">
            {stateName}
          </p>
        </div>
        <span className="dq-mono whitespace-nowrap text-[11px] font-medium text-muted-foreground">
          {market.fullName.replace(`${market.city}, `, "")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        <MiniStat
          label="Active operators"
          value={
            market.activeOperatorCount === null
              ? "—"
              : fmtInt(market.activeOperatorCount)
          }
        />
        <MiniStat
          label="Eligible"
          value={fmtInt(market.operatorCountEligible)}
        />
        <MiniStat
          label="Median DOM T12"
          value={fmtDays(market.medianDomT12)}
        />
        <MiniStat
          label="Rent growth T12"
          value={rentGrowth}
          benchmark={rentDelta.text}
          benchmarkTone={rentDelta.tone}
        />
      </div>

      <p className="mt-5 text-[13px] font-semibold text-teal group-hover:text-teal-700 group-hover:underline">
        View market →
      </p>
    </Link>
  );
}
