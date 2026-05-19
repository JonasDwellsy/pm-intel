import { fmtDate, fmtDays, fmtInt } from "@/lib/format";
import type { MarketSummary } from "@/lib/types";

// v0.6.3 headline reframe (Methodology_v0.6.3_Patches.md) — the four-tile
// Market Snapshot is now the market intelligence surface, not the
// methodology-meta surface:
//
//   1. Active operators (≥3 listings T12)      — Patch 1
//   2. Eligible for ranking (≥30 listings T12) — Patch 2 label fix
//   3. MSA median DOM                          — unchanged
//   4. Rent growth T12 vs national             — Patch 3 (replaces Methodology)
//
// Under a submarket filter (?submarket=<slug>) tiles 1 and 2 transform to
// submarket scope; tiles 3 and 4 stay MSA-scoped with explicit annotations,
// because v0.6.3 doesn't compute submarket-level DOM or rent growth
// (listing-level geography work is v0.7 backlog).
//
// The subheader strip ("X operators · Y with full ranking · Trailing 12
// months · Methodology vZ") is removed — every datum it carried is
// duplicated in the tiles below. Methodology version moves to the page
// footer (which already exists, see MarketView MethodologyFooter).

function Stat({
  label,
  value,
  sub,
  benchmark,
  benchmarkTone = "neutral",
  annotation,
}: {
  label: string;
  value: string;
  sub: string;
  /** Optional benchmark line — surfaced below `sub` in a distinct color
   *  (good = green, bad = orange, neutral = muted). Used by the DOM and
   *  rent-growth tiles to carry "vs national" comparisons. */
  benchmark?: string;
  benchmarkTone?: "good" | "bad" | "neutral";
  /** Optional scope annotation (e.g. "[MSA-wide context]") rendered in a
   *  small muted line below the sub/benchmark. Used by the submarket-
   *  filtered DOM + rent-growth tiles to be honest that those values
   *  remain MSA-scoped despite the filter. */
  annotation?: string;
}) {
  // v0.6.3 polish — sub line always renders in neutral muted. The legacy
  // `tone` prop coupled the sub line to the same color as the value, but
  // now that we surface the benchmark line separately with its own
  // benchmark-tone color the sub line ended up reading the SAME orange/
  // green as the benchmark below it — confusing visual hierarchy. Value
  // stays navy; benchmark carries the color signal alone.
  return (
    <div>
      <p className="dq-eyebrow-muted mb-2">{label}</p>
      <p
        className="dq-mono text-[32px] font-medium leading-none tracking-[-0.01em] text-navy"
      >
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
      {annotation && (
        <p className="mt-1 text-[11px] italic text-muted-2">{annotation}</p>
      )}
    </div>
  );
}

// Format a decimal rent-growth value (e.g. 0.0023 → "+0.2%") for the
// market-rent-growth headline tile. Falls back to "—" when null.
function fmtRentGrowthPct(decimal: number | null | undefined): string {
  if (decimal === null || decimal === undefined) return "—";
  const pct = decimal * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

// Format the pre-computed pp delta (already in percentage-point units in
// the seed JSON; do not multiply by 100). Returns "+0.6pp vs national" or
// "−1.2pp vs national" or "at national" when within the neutral band.
function fmtRentGrowthDelta(
  pp: number | null | undefined
): { text: string; tone: "good" | "bad" | "neutral" } {
  if (pp === null || pp === undefined)
    return { text: "vs national: —", tone: "neutral" };
  const abs = Math.abs(pp);
  // Patch 3 spec: green if delta > +0.2pp, orange if delta < −0.2pp,
  // neutral within the ±0.2pp band ("at national" reads more honestly
  // than spurious +0.0pp signals at the granularity we display).
  if (abs <= 0.2) return { text: "at national", tone: "neutral" };
  const sign = pp > 0 ? "+" : "−";
  return {
    text: `${sign}${abs.toFixed(1)}pp vs national`,
    tone: pp > 0 ? "good" : "bad",
  };
}

export function MarketHero({
  market,
  methodologyVersion,
  dataAsOf,
  submarket,
}: {
  market: MarketSummary;
  /** Retained for the (now-stripped) subheader-strip era; surfaced in the
   *  methodology footer downstream. Kept on the prop API so callers don't
   *  need to be refactored simultaneously with this component. */
  methodologyVersion: string;
  dataAsOf: string;
  submarket?: {
    displayName: string;
    matchedOperatorCount: number;
    eligibleWithFootprint: number;
    activeOperatorCount: number | null;
  } | null;
}) {
  // methodologyVersion is still part of the prop API (the page wiring passes
  // it through) but the v0.6.3 redesign moves the version stamp to the
  // footer. This `void` suppresses the "unused variable" lint while keeping
  // the prop available for downstream tweaks.
  void methodologyVersion;
  const domVsNational = market.medianDomT12 - 22.5; // rough national baseline; tone-only
  const domWarn = domVsNational > 0;
  const domSub = `${domWarn ? "+" : "−"}${Math.abs(domVsNational).toFixed(1)}d vs national`;
  const filtered = submarket ?? null;
  const rentGrowth = fmtRentGrowthPct(market.marketRentGrowthT12);
  const rentDelta = fmtRentGrowthDelta(market.marketRentGrowthDeltaVsNationalPp);

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

        {/* v0.6.3: the subheader strip ("X operators · Y with full ranking
            · Trailing 12 months · Methodology vZ") is removed. Every datum
            it carried is duplicated in the Market Snapshot tiles or the
            page footer, and stripping it tightens the hero. */}

        <p className="mt-6 max-w-[580px] text-[17px] leading-[1.55] text-foreground/85">
          {filtered ? (
            <>
              Dwellsy IQ identifies the operators worth knowing in{" "}
              {filtered.displayName} (within the {market.fullName}). Find
              property managers with proven lease velocity, stable rent
              trajectories, and durable tenant retention. Filter by portfolio
              composition and ownership posture. Every ranking is grounded in
              first-party listing data and computed against same-cohort peers,
              not a single market-wide average.
            </>
          ) : (
            <>
              Dwellsy IQ identifies the operators worth knowing in{" "}
              {market.fullName}. Find property managers with proven lease
              velocity, stable rent trajectories, and durable tenant retention.
              Filter by portfolio composition and ownership posture. Every
              ranking is grounded in first-party listing data and computed
              against same-cohort peers, not a single market-wide average.
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
              {/* Tile 1 — Active operators IN <Submarket>. Sourced from
                  market.activeOperatorCountBySubmarket via the loadMarketView
                  resolver. Falls back to em-dash if the slug is missing from
                  the seed's per-submarket bucket map. */}
              <Stat
                label={`Active operators in ${filtered.displayName}`}
                value={
                  filtered.activeOperatorCount === null
                    ? "—"
                    : fmtInt(filtered.activeOperatorCount)
                }
                sub={`≥3 listings T12 in ${filtered.displayName}`}
              />
              {/* Tile 2 — Eligible WITH <Submarket> footprint. Spec: count
                  of MSA-eligible (≥30 T12) operators whose
                  t12ListingsBySubmarket[slug] > 0. Computed server-side in
                  loadMarketView. */}
              {/* v0.6.3 polish — label shortened from "Eligible with X
                  footprint" to "Eligible in X" so longer submarket names
                  (e.g. Orange Park) no longer wrap the chip onto a second
                  line. Same underlying count (server-side
                  eligibleWithFootprint from t12ListingsBySubmarket). */}
              <Stat
                label={`Eligible in ${filtered.displayName}`}
                value={fmtInt(filtered.eligibleWithFootprint)}
                sub="≥30 listings T12 in MSA"
              />
              {/* Tile 3 — MSA median DOM. Value unchanged; the submarket
                  filter doesn't (yet) carry submarket-level DOM. Annotation
                  flags the MSA scope so the number reads as market context
                  rather than a Mesa-specific stat. */}
              <Stat
                label="MSA median DOM"
                value={fmtDays(market.medianDomT12)}
                sub="median across ranked operators"
                benchmark={domSub}
                benchmarkTone={domWarn ? "bad" : "good"}
                annotation="[MSA-wide context]"
              />
              {/* Tile 4 — Rent growth T12. Same as Tile 3 — MSA-scoped under
                  a submarket filter because v0.6.3 doesn't compute submarket-
                  level rent growth. Honest annotation about scope; v0.7
                  candidate for true submarket-level computation. */}
              <Stat
                label="Rent growth T12"
                value={rentGrowth}
                sub="median across ranked operators"
                benchmark={rentDelta.text}
                benchmarkTone={rentDelta.tone}
                annotation="[MSA-wide; submarket-level in roadmap]"
              />
            </>
          ) : (
            <>
              {/* Tile 1 — Active operators (≥3 listings T12). Replaces the
                  legacy "Total operators · observed in MSA" tile. The
                  v0.6.2 total-operator denominator was dominated by one-off
                  landlords; ≥3 T12 is the defensible "real operator" floor.
                  Patch 1, Methodology_v0.6.3_Patches.md §1. */}
              <Stat
                label="Active operators"
                value={
                  market.activeOperatorCount === null ||
                  market.activeOperatorCount === undefined
                    ? "—"
                    : fmtInt(market.activeOperatorCount)
                }
                sub="≥3 listings T12"
              />
              {/* Tile 2 — Eligible for ranking. Same numeric value as v0.6.2
                  but Patch 2 corrects the sublabel from "T6M" to "T12"
                  (production was always T12; the T6M label was drift). */}
              <Stat
                label="Eligible for ranking"
                value={fmtInt(market.operatorCountEligible)}
                sub="≥30 listings, T12"
              />
              {/* Tile 3 — MSA median DOM. Unchanged from v0.6.2; kept as a
                  market velocity signal alongside the new rent-direction
                  signal in Tile 4. */}
              <Stat
                label="MSA median DOM"
                value={fmtDays(market.medianDomT12)}
                sub="median across ranked operators"
                benchmark={domSub}
                benchmarkTone={domWarn ? "bad" : "good"}
              />
              {/* Tile 4 — Rent growth T12. Replaces the legacy "Methodology
                  · vX.Y.Z" tile (methodology version moves to footer).
                  Value: market-level median YoY across ranked operators.
                  Benchmark: pre-computed pp delta vs the single national
                  median. Patch 3, Methodology_v0.6.3_Patches.md §3. */}
              <Stat
                label="Rent growth T12"
                value={rentGrowth}
                sub="median across ranked operators"
                benchmark={rentDelta.text}
                benchmarkTone={rentDelta.tone}
              />
            </>
          )}
        </div>
      </aside>
    </section>
  );
}
