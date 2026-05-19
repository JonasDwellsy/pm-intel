import { fmtDate, fmtDays, fmtInt } from "@/lib/format";
import type { StateView } from "@/lib/state-data";

// v0.6.3 Patch 5 — state landing page hero. Mirrors the MarketHero
// 4-tile snapshot pattern so the state level reads as a natural rollup of
// the market level. Tiles 1+2 are summed counts, tiles 3+4 are operator-
// weighted medians with a "vs national" benchmark line. The Stat helper
// is a local copy of MarketHero's — kept inline rather than extracted to
// a shared module because the two heroes may diverge in v0.7 work
// (statewide quadrant grid, statewide top-operators list).

function Stat({
  label,
  value,
  sub,
  benchmark,
  benchmarkTone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  benchmark?: string;
  benchmarkTone?: "good" | "bad" | "neutral";
}) {
  return (
    <div>
      <p className="dq-eyebrow-muted mb-2">{label}</p>
      <p className="dq-mono text-[32px] font-medium leading-none tracking-[-0.01em] text-navy">
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
      {benchmark && (
        <p
          className={
            "mt-1 text-[11.5px] font-medium " +
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

// Format the operator-weighted state rent growth decimal (e.g. 0.0162 →
// "+1.6%") and the pp delta vs national (e.g. 0.78 → "+0.8pp vs national")
// using the same conventions MarketHero applies. ±0.2pp band collapses to
// "at national" so spurious noise doesn't render as a directional signal.
function fmtRentGrowthPct(decimal: number | null): string {
  if (decimal === null) return "—";
  const pct = decimal * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function fmtRentGrowthDelta(
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

function fmtDomDelta(
  d: number | null
): { text: string; tone: "good" | "bad" | "neutral" } {
  if (d === null) return { text: "vs national: —", tone: "neutral" };
  const abs = Math.abs(d);
  // Same ±0.2-units neutral band logic as rent — small DOM swings within
  // 0.5 days aren't meaningfully different and shouldn't render in color.
  // Below-national DOM (faster) is good; above-national (slower) is bad.
  if (abs <= 0.5) return { text: "at national", tone: "neutral" };
  const sign = d > 0 ? "+" : "−";
  return {
    text: `${sign}${abs.toFixed(1)}d vs national`,
    tone: d > 0 ? "bad" : "good",
  };
}

export function StateHero({ view }: { view: StateView }) {
  const { stateName, markets, aggregates, intro, dataAsOf } = view;
  const n = markets.length;
  // v0.6.4 Patch 1 — sublabel surfaces the dedup'd-across-markets-in-
  // state semantic so prospects don't see Invitation Homes counted in
  // both Nashville + Memphis + Clarksville. For single-MSA states the
  // dedup is a no-op but the sublabel still reads cleanly.
  const acrossMarkets =
    n === 1
      ? `Across 1 market in ${stateName}`
      : `Dedup'd across ${n} markets in ${stateName}`;
  const rentGrowth = fmtRentGrowthPct(aggregates.stateRentGrowthT12);
  const rentDelta = fmtRentGrowthDelta(
    aggregates.stateRentGrowthDeltaVsNationalPp
  );
  const domDelta = fmtDomDelta(aggregates.stateMedianDomDeltaVsNationalD);

  return (
    <section className="grid items-start gap-12 lg:grid-cols-[1.25fr_1fr]">
      <div>
        <p className="dq-eyebrow mb-4">Property manager intelligence</p>
        <h1 className="dq-h1">Property Managers in {stateName}</h1>
        <p className="mt-6 max-w-[640px] text-[17px] leading-[1.55] text-foreground/85">
          {intro}
        </p>
      </div>

      <aside className="rounded-lg border border-grid bg-white p-7 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <p className="dq-eyebrow-muted">{stateName} snapshot</p>
          <p className="dq-mono text-[11px] uppercase text-muted-foreground tracking-wide">
            {fmtDate(dataAsOf)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-7 gap-y-6">
          {/* Tile 1 — Active operators across the state. Sum of MSA-level
              activeOperatorCount; multi-market operators may be counted
              once per MSA they appear in (v0.7 dedup backlog). */}
          <Stat
            label="Active operators"
            value={fmtInt(aggregates.stateActiveOperatorCount)}
            sub={acrossMarkets}
          />
          {/* Tile 2 — Eligible for ranking. Same double-count caveat as
              Tile 1; uses operatorCountEligible (≥30 T12) summed across
              MSAs in state. */}
          <Stat
            label="Eligible for ranking"
            value={fmtInt(aggregates.stateEligibleOperatorCount)}
            sub={acrossMarkets}
          />
          {/* Tile 3 — Operator-weighted median DOM. Pools every ranked
              operator across in-state MSAs and takes the median of T12 DOM.
              Benchmark line is delta vs national median DOM (computed at
              runtime by pooling across all 7 MSAs). */}
          <Stat
            label="Median DOM T12"
            value={
              aggregates.stateMedianDomT12 === null
                ? "—"
                : fmtDays(aggregates.stateMedianDomT12)
            }
            sub="median across ranked operators"
            benchmark={domDelta.text}
            benchmarkTone={domDelta.tone}
          />
          {/* Tile 4 — Operator-weighted median rent growth. Pools every
              ranked operator's pmYoyChange across in-state MSAs. Benchmark
              line uses the pre-computed national rent growth from the seed
              (identical across all 7 markets). */}
          <Stat
            label="Rent growth T12"
            value={rentGrowth}
            sub="median across ranked operators"
            benchmark={rentDelta.text}
            benchmarkTone={rentDelta.tone}
          />
        </div>
      </aside>
    </section>
  );
}
