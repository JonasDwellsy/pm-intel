"use client";

import Link from "next/link";
import {
  CartesianGrid,
  ComposedChart,
  Bar,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  Cell,
} from "recharts";
import { CoverageMapClient } from "@/components/scorecard/CoverageMapClient";
import type { MarketFootprintPill } from "@/lib/cross-market";
import type { CohortRentTrajectory } from "@/lib/cohort-rent-trajectory";
import type { PricingTierSignal } from "@/lib/lending-signals";
import type { ShareTrajectoryView } from "@/lib/share-trajectory";
import {
  formatConcessionSample,
  uniquePatternLabels,
  type ConcessionContext,
} from "@/lib/concession-context";
import type { ScorecardData, StarLevel } from "@/lib/types";
import { fmtInt, fmtNumber } from "@/lib/format";
import { citySlug, stateCodeToSlug, submarketSlug } from "@/lib/slugify";
import { InfoIcon } from "@/components/scorecard/InfoIcon";
import { LayerSectionHeader } from "@/components/scorecard/LayerSectionHeader";
import type { MetricKey } from "@/lib/metric-definitions";
import {
  dqChartTheme,
  dqGrid,
  dqTick,
  dqTooltipContentStyle,
  dqTooltipLabelStyle,
} from "@/lib/chart-theme";

// Layer 5 — Portfolio Characteristics (Scorecard_Design_Spec_v1.0.md
// Section 3, Layer 5). Six subsections rendered only when relevant data is
// present:
//
//   5A — Coverage Map with auto-generated narrative annotation
//        (generatedText.mapNarrativeAnnotation from v0.6.2 Patch 8)
//   5B — Geographic Spread Analysis (top cities + concentration)
//   5C — Cross-Market Presence (only renders for operators in 2+ markets)
//   5D — Portfolio Composition (community stats + house/apartment split for
//        operators with both-asset visibility)
//   5E — Rent Trajectory (Descriptive) — operator's trajectory overlaid with
//        cohort median trajectory; explicitly labeled descriptive, not
//        composite-feeding
//   5F — Pricing Data — median rent by BR bucket + ranges. v0.6.2 doesn't
//        seed BR-bucketed rent data, so this subsection renders a placeholder
//        with explicit "Pricing-by-BR data lands in v0.7" copy.

const DEFAULT_ACCENT = "#D97834";

type Operator = "sfr" | "mfbtr" | "hybrid";

function classify(scorecard: ScorecardData): Operator {
  const q = (scorecard.pm.quadrant7Cell ?? "").toLowerCase();
  if (q.startsWith("sfr")) return "sfr";
  if (q.startsWith("small mf") || q.startsWith("large mf")) return "mfbtr";
  if (q.startsWith("hybrid")) return "hybrid";
  return "hybrid";
}

export function PortfolioLayer({
  scorecard,
  crossMarketPresence,
  cohortRentTrajectory,
  pricingTier,
  shareTrajectory,
  concessionContext,
}: {
  scorecard: ScorecardData;
  crossMarketPresence: MarketFootprintPill[];
  cohortRentTrajectory: CohortRentTrajectory | null;
  pricingTier: PricingTierSignal | null;
  shareTrajectory: ShareTrajectoryView | null;
  concessionContext: ConcessionContext;
}) {
  const opType = classify(scorecard);
  const isMultiMarket = crossMarketPresence.length > 1;
  // Subsection visibility — the only thing the wrapper needs to know per
  // operator. Subsections no longer render a "5A · / 5B · /..." numbered
  // prefix; the internal "Layer 5" vocabulary isn't surfaced anywhere
  // user-facing and the numbering read as orphaned. Each subsection now
  // shows just its eyebrow descriptor + title.
  const hasGeographic =
    (scorecard.geographicCoverage.topCities?.length ?? 0) > 0;
  const hasRentTrajectory =
    Array.isArray(scorecard.rentTrajectory) &&
    scorecard.rentTrajectory.length > 0;

  return (
    <section
      id="portfolio"
      aria-label="Portfolio Characteristics"
      className="dq-section space-y-12"
    >
      <LayerSectionHeader
        num="04"
        title="Portfolio characteristics"
        metricKey="section-portfolio"
        lede="Geographic footprint, portfolio composition, rent trajectory, and pricing context. Subsections render only when the operator has qualifying data."
      />

      <CoverageMapAnnotated scorecard={scorecard} />
      {hasGeographic && (
        <GeographicSpreadSection scorecard={scorecard} opType={opType} />
      )}
      {isMultiMarket && (
        <CrossMarketPresenceSection rows={crossMarketPresence} />
      )}
      <PortfolioCompositionSection scorecard={scorecard} opType={opType} />
      {hasRentTrajectory && (
        <RentTrajectoryDescriptive
          scorecard={scorecard}
          overlay={cohortRentTrajectory}
        />
      )}
      {/* v0.6.4 Patch 2 — concession activity. Renders only when the
          focal operator has a non-null concessionRate (i.e. they were
          present in the classifier CSV input). Positioned between rent
          trajectory and share trajectory per Patch 2 spec — concession
          activity is a present-tense signal of demand/supply stress,
          which reads naturally between the rolling rent picture and the
          longer-arc share trajectory. */}
      {concessionContext.rate !== null && (
        <ConcessionActivitySection ctx={concessionContext} />
      )}
      {/* v0.6.3 Patch 6 — share-trajectory section, sandwiched between
          rent trajectory and pricing data per spec. Null guard handles
          back-compat with any pre-Patch-6 PM whose t12/t24 counts didn't
          flow through to the loader. */}
      {shareTrajectory && (
        <ShareTrajectorySection view={shareTrajectory} />
      )}
      <PricingDataSection scorecard={scorecard} pricingTier={pricingTier} />
    </section>
  );
}

// --- 5A — Coverage Map with Narrative Annotation ---

function CoverageMapAnnotated({ scorecard }: { scorecard: ScorecardData }) {
  const { geographicCoverage, market } = scorecard;
  const accentColor = scorecard.pm.accentColor ?? DEFAULT_ACCENT;
  const annotation = scorecard.generatedText?.mapNarrativeAnnotation;

  return (
    <article id="geography" className="dq-section">
      <SubsectionHeader
        eyebrow="Coverage map"
        title="Where the portfolio sits"
      />
      {annotation && (
        <p className="mt-3 max-w-[780px] text-[15px] leading-[1.6] text-foreground text-pretty">
          {annotation}
        </p>
      )}
      <div className="mt-4">
        <CoverageMapClient
          coveragePoints={geographicCoverage.coverageMapPoints ?? []}
          backdropPoints={geographicCoverage.msaBackdropPoints ?? []}
          mapBounds={geographicCoverage.mapBounds}
          accentColor={accentColor}
          fallbackCity={market.name}
          fallbackMsa={market.fullName}
        />
      </div>
    </article>
  );
}

// --- 5B — Geographic Spread Analysis ---

function GeographicSpreadSection({
  scorecard,
  opType,
}: {
  scorecard: ScorecardData;
  opType: Operator;
}) {
  const cities = scorecard.geographicCoverage.topCities ?? [];
  if (cities.length === 0) return null;
  const total = scorecard.coverage.totalObservedUnits ?? scorecard.coverage.urusT12;
  const top3 = cities.slice(0, 3).reduce((s, c) => s + c.pct, 0);
  // Submarket links route to the operator's primary-market landing page with
  // a ?submarket= filter applied. stateSlug + citySlug match the route shape
  // generated by listMarketRouteParams in market-data.ts.
  const marketBaseHref = `/property-managers/${stateCodeToSlug(scorecard.market.state)}/${citySlug(scorecard.market.name)}`;

  // Heavier treatment for SFR operators per spec (geographic spread carries
  // more decision weight); MF/BTR gets a lighter community-level breakdown.
  const heading =
    opType === "sfr"
      ? "Submarket footprint"
      : opType === "mfbtr"
        ? "Community-level breakdown"
        : "Submarket + community mix";

  return (
    <article id="geographic-spread" className="dq-section">
      <SubsectionHeader
        eyebrow="Geographic spread"
        title={heading}
        metricKey="section-geographic-spread"
      />
      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
        {/* Top cities bar list */}
        <div>
          <p className="dq-eyebrow-muted mb-2.5">Top observed submarkets</p>
          <ul className="overflow-hidden rounded-md border border-grid bg-white">
            {cities.slice(0, 7).map((c, i) => {
              const widthPct = c.pct;
              const estUnits = Math.round((total * c.pct) / 100);
              const submarketHref = `${marketBaseHref}?submarket=${submarketSlug(c.name)}`;
              return (
                <li
                  key={c.name}
                  className="relative flex items-center gap-3 border-b border-grid-soft px-4 py-2 last:border-b-0"
                >
                  <span className="w-[14px] text-[11px] font-semibold text-muted-2">
                    {i + 1}
                  </span>
                  <Link
                    href={submarketHref}
                    aria-label={`See operators with footprint in ${c.name}`}
                    className="min-w-0 flex-[2_2_0] truncate text-[13.5px] font-medium text-navy hover:text-teal hover:underline focus-visible:text-teal focus-visible:underline focus-visible:outline-none"
                  >
                    {c.name}
                  </Link>
                  <div className="relative flex-[3_3_0]">
                    <div className="h-[6px] rounded-full bg-grid-soft" />
                    <div
                      className="absolute top-0 h-[6px] rounded-full bg-teal"
                      style={{ width: `${Math.max(2, widthPct)}%` }}
                    />
                  </div>
                  <span className="dq-tnum w-[70px] shrink-0 text-right text-[13px] font-semibold text-navy">
                    {c.pct}%
                  </span>
                  <span className="dq-tnum w-[70px] shrink-0 text-right text-[12px] text-muted-foreground">
                    ~{fmtInt(estUnits)} u
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Concentration summary block */}
        <div className="rounded-md border border-grid bg-surface-soft p-4">
          <p className="dq-eyebrow-muted mb-2">Concentration</p>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-2">
                Top-3 city share
              </p>
              <p className="dq-tnum mt-1 text-[22px] font-bold leading-none text-navy">
                {fmtNumber(top3, 0)}%
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-2">
                Distinct cities observed
              </p>
              <p className="dq-tnum mt-1 text-[22px] font-bold leading-none text-navy">
                {scorecard.coverage.citiesObserved}
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

// --- 5C — Cross-Market Presence ---

function CrossMarketPresenceSection({ rows }: { rows: MarketFootprintPill[] }) {
  return (
    <article id="cross-market" className="dq-section">
      <SubsectionHeader
        eyebrow="Cross-market presence"
        title={`Visible in ${rows.length} of our covered markets`}
        metricKey="section-cross-market-presence"
      />
      <ul className="mt-4 overflow-hidden rounded-md border border-grid bg-white">
        {rows.map((row) => (
          <li
            key={row.marketId}
            className={
              "relative grid grid-cols-[auto_minmax(0,1fr)_120px_minmax(0,180px)] items-center gap-4 border-b border-grid-soft px-4 py-3 last:border-b-0 " +
              (row.isCurrent ? "bg-teal-soft" : "")
            }
          >
            {row.isCurrent && (
              <span
                aria-hidden
                className="absolute left-0 top-0 h-full w-[3px] bg-teal"
              />
            )}
            <StarIcon level={row.compositeStar} size={14} />
            <div className="min-w-0">
              {row.isCurrent ? (
                <span className="text-[14px] font-semibold text-navy">
                  {row.city}
                </span>
              ) : (
                <Link
                  href={row.href}
                  className="text-[14px] font-semibold text-navy transition-colors hover:text-teal"
                >
                  {row.city}
                </Link>
              )}
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {row.fullName}
              </p>
            </div>
            <div className="text-right">
              <p className="dq-tnum text-[15px] font-semibold text-navy">
                {fmtInt(row.urusT12)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                urus T12
              </p>
            </div>
            <p className="text-[12px] text-muted-foreground">
              {row.compositeCohortName ?? "—"}
            </p>
          </li>
        ))}
      </ul>
    </article>
  );
}

// --- 5D — Portfolio Composition ---

function PortfolioCompositionSection({
  scorecard,
  opType,
}: {
  scorecard: ScorecardData;
  opType: Operator;
}) {
  const c = scorecard.coverage;
  const houseUrus = scorecard.performance.houseUrusT12 ?? 0;
  const aptUrus = scorecard.performance.aptUrusT12 ?? 0;
  const splitTotal = houseUrus + aptUrus;
  // House / apartment split surfaces for Hybrid + SFR operators with both
  // types visible per Decision G.3. For MF/BTR-only operators, the split is
  // typically 0 / urusT12 which doesn't add information.
  const showSplit = splitTotal > 0 && (opType === "hybrid" || opType === "sfr");

  const avgCommunitySize =
    c.observedCommunities && c.observedCommunityTotalUnits
      ? c.observedCommunityTotalUnits / c.observedCommunities
      : null;

  return (
    <article id="portfolio-composition" className="dq-section">
      <SubsectionHeader
        eyebrow="Portfolio composition"
        metricKey="section-portfolio-composition"
        title="Observed scale and mix"
      />
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <Stat
          label="Observed units · T12"
          value={fmtInt(c.urusT12)}
          unit="distinct"
        />
        <Stat
          label="Active listings"
          value={fmtInt(c.activeListings)}
          unit="now"
        />
        <Stat
          label="Communities observed"
          value={c.observedCommunities ? fmtInt(c.observedCommunities) : "—"}
          unit={
            c.observedCommunities && c.observedCommunities > 0
              ? "concentrated"
              : ""
          }
        />
        <Stat
          label="Avg community size"
          value={avgCommunitySize !== null ? fmtNumber(avgCommunitySize, 0) : "—"}
          unit={avgCommunitySize !== null ? "units" : ""}
        />
      </div>

      {showSplit && (
        <div className="mt-6">
          <p className="dq-eyebrow-muted mb-2.5">House vs apartment split (T12)</p>
          <div className="overflow-hidden rounded-md border border-grid bg-white p-4">
            <div className="flex h-[18px] w-full overflow-hidden rounded-md">
              <div
                className="flex h-full items-center justify-center text-[11px] font-semibold text-white"
                style={{
                  width: `${(houseUrus / splitTotal) * 100}%`,
                  background: "var(--color-teal)",
                  minWidth: houseUrus > 0 ? "30px" : "0",
                }}
              >
                {houseUrus > 0 && `${Math.round((houseUrus / splitTotal) * 100)}%`}
              </div>
              <div
                className="flex h-full items-center justify-center text-[11px] font-semibold text-white"
                style={{
                  width: `${(aptUrus / splitTotal) * 100}%`,
                  background: "var(--color-orange)",
                  minWidth: aptUrus > 0 ? "30px" : "0",
                }}
              >
                {aptUrus > 0 && `${Math.round((aptUrus / splitTotal) * 100)}%`}
              </div>
            </div>
            <div className="mt-3 flex justify-between text-[12px] text-muted-foreground">
              <span>
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                  style={{ background: "var(--color-teal)" }}
                />
                Houses · <span className="dq-tnum font-semibold text-navy">{fmtInt(houseUrus)}</span> urus
              </span>
              <span>
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                  style={{ background: "var(--color-orange)" }}
                />
                Apartments · <span className="dq-tnum font-semibold text-navy">{fmtInt(aptUrus)}</span> urus
              </span>
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 max-w-[780px] text-[12.5px] italic text-muted-2">
        Bedroom mix (1BR / 2BR / 3BR+) is not in the v0.6.2 seed. BR-bucketed
        composition lands in v0.7.
      </p>
    </article>
  );
}

// --- 5E — Rent Trajectory (Descriptive) ---

function RentTrajectoryDescriptive({
  scorecard,
  overlay,
}: {
  scorecard: ScorecardData;
  overlay: CohortRentTrajectory | null;
}) {
  if (
    !Array.isArray(scorecard.rentTrajectory) ||
    scorecard.rentTrajectory.length === 0
  ) {
    return null;
  }

  // Build chart data: one row per quarter, with operator + cohort columns.
  const operatorByQuarter = new Map<string, number>();
  for (const q of scorecard.rentTrajectory) {
    if (typeof q.mixAdjMedian === "number" && q.mixAdjMedian > 0) {
      operatorByQuarter.set(q.quarter, q.mixAdjMedian);
    }
  }

  const quarters = overlay
    ? overlay.points.map((p) => p.quarter)
    : Array.from(operatorByQuarter.keys()).sort();

  const cohortByQuarter = new Map<string, number>();
  if (overlay) {
    for (const p of overlay.points) {
      if (p.cohortMedian !== null) {
        cohortByQuarter.set(p.quarter, p.cohortMedian);
      }
    }
  }

  const data = quarters.map((quarter) => ({
    quarter,
    operator: operatorByQuarter.get(quarter) ?? null,
    cohort: cohortByQuarter.get(quarter) ?? null,
  }));

  const yoy = scorecard.rentPerformance?.pmYoyChange ?? null;
  const yoyLabel =
    yoy === null
      ? "—"
      : `${yoy >= 0 ? "+" : ""}${(yoy * 100).toFixed(1)}%`;

  return (
    <article id="rent-trajectory" className="dq-section">
      <SubsectionHeader
        eyebrow="Rent trajectory · descriptive"
        title="Mix-adjusted median rent over six quarters"
      />
      <div className="mt-4 dq-chart-card">
        <div className="dq-chart-head">
          <div>
            <p className="dq-chart-title">
              {scorecard.pm.name} vs{" "}
              {overlay?.cohortName ?? `${scorecard.market.name} cohort`} median
            </p>
            <p className="dq-chart-sub">
              Operator bars · cohort median overlay · descriptive context only
            </p>
          </div>
          <div className="dq-chart-legend">
            <span className="dq-mono">
              Headline YoY{" "}
              <strong
                className={
                  yoy === null
                    ? "text-muted-foreground"
                    : yoy >= 0
                      ? "text-good"
                      : "text-bad"
                }
              >
                {yoyLabel}
              </strong>
            </span>
            <span>
              <span
                aria-hidden
                className="dq-legend-swatch"
                style={{ background: dqChartTheme.colors.primary }}
              />
              Operator
            </span>
            <span>
              <span
                aria-hidden
                className="dq-legend-line"
                style={{ background: dqChartTheme.colors.teal }}
              />
              Cohort median
            </span>
          </div>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ left: 8, right: 24, top: 24, bottom: 16 }}
            >
              <CartesianGrid {...dqGrid} />
              <XAxis
                dataKey="quarter"
                tick={dqTick}
                axisLine={{ stroke: dqChartTheme.colors.grid }}
                tickLine={false}
              />
              <YAxis
                tick={dqTick}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v) =>
                  typeof v === "number" ? `$${(v / 1000).toFixed(1)}k` : String(v)
                }
              />
              <Tooltip
                contentStyle={dqTooltipContentStyle}
                labelStyle={dqTooltipLabelStyle}
                formatter={(v, name) => {
                  if (typeof v !== "number") return ["—", name as string];
                  return [`$${Math.round(v).toLocaleString("en-US")}`, name as string];
                }}
              />
              <Legend wrapperStyle={{ display: "none" }} />
              <Bar dataKey="operator" name="Operator" radius={[2, 2, 0, 0]}>
                {data.map((d) => (
                  <Cell
                    key={d.quarter}
                    fill={dqChartTheme.colors.primary}
                  />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="cohort"
                name="Cohort median"
                stroke={dqChartTheme.colors.teal}
                strokeWidth={2.5}
                dot={{ r: 3, fill: dqChartTheme.colors.teal }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="dq-explainer">
          Bars are the operator&rsquo;s mix-adjusted median rent per quarter;
          the overlay line is the {overlay?.cohortName ?? "cohort"} median for
          the same quarters. Rent level is descriptive — it isn&rsquo;t a
          composite input. The composite-feeding signal is the YoY delta
          surfaced in Layer 3 Card 3 (Rent Performance).
        </p>
      </div>
    </article>
  );
}

// --- 5F — Share trajectory (v0.6.3 Patch 6 + polish) ---
//
// Operator's share of operator listing activity, year-over-year. The
// section reads interpretation-first: a large YoY-change headline leads,
// supporting share data sits below, the auto-generated narrative carries
// the "so what" interpretation, and the methodology disclosure ends as a
// muted footnote rather than a side-by-side equal-weight box.
//
// Display branches on trajectoryEligibility:
//   continuing       — large YoY number + supporting share line + peer
//                      median + narrative + muted methodology footer
//   new_in_coverage  — status header + listing count + narrative + footer
//   null_baseline    — status header + listing count + narrative + footer
//
// Color treatment for the YoY value uses a ±5pp band around the cohort
// median. Share trajectory is a CONTEXT metric, not a performance one;
// strong green/orange outside that band signals meaningfully large
// divergence from the typical continuing operator. Methodology disclosure
// disavows the "more share = better" reading.

// Methodology footer rendered at the bottom of every variant. Single
// paragraph instead of a side-by-side box so the visual hierarchy puts
// the data + narrative ahead of the caveats. Link drops to the
// methodology page sub-anchor for the full treatment.
function ShareTrajectoryMethodologyFooter() {
  return (
    <p className="mt-4 text-[12px] leading-[1.6] text-muted-2">
      <span className="font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        How this is computed
      </span>{" "}
      · Computed across operators with substantial presence in both periods
      (≥30 listings each). Share-based methodology controls for
      Dwellsy&rsquo;s data coverage expansion. Shown for context — not used
      in ranking.{" "}
      <Link
        href="/methodology#share-trajectory"
        className="text-teal hover:text-teal-700"
      >
        Read full methodology →
      </Link>
    </p>
  );
}

// --- v0.6.4 Patch 2 — Concession activity section ---
//
// Three render branches keyed on ctx.rate + ctx.listingCount:
//   - rate === null         → section doesn't render at all (handled in
//                             the wrapper above; null guard there)
//   - listingCount === 0    → "No concession language detected" branch
//   - listingCount > 0      → full read: rate, cohort comparison,
//                             pattern badges, sample text
//
// All branches share the same eyebrow + title + methodology disclosure.
// Color accent on the rate number is driven by ctx.accent ("high" →
// orange, "low" → green, "neutral" → navy) and signals participation
// vs the market median, not a quality judgment — concession activity
// is explicitly NOT a star-bearing metric.
function ConcessionActivitySection({ ctx }: { ctx: ConcessionContext }) {
  const hasConcessions = ctx.listingCount > 0 && ctx.rate !== null;
  const ratePct = ctx.rate !== null ? Math.round(ctx.rate * 100) : null;
  const medianPct =
    ctx.marketMedianRate !== null
      ? Math.round(ctx.marketMedianRate * 100)
      : null;

  // Accent → color token. Orange + green map to the existing chart-warn
  // and chart-good tones the rest of Layer 3 + Layer 5 already use, so
  // the concession color reads consistent with the other context cues.
  const accentColor =
    ctx.accent === "high"
      ? "#D97834"
      : ctx.accent === "low"
        ? "#2F7A5C"
        : "var(--color-navy)";

  const patternLabels = uniquePatternLabels(ctx.patterns).slice(0, 3);

  return (
    <article id="concession-activity" className="dq-section">
      {/* No metricKey — the methodology link in the disclosure footer
          below acts as the "learn more" affordance for this section,
          keeping concession discoverable without growing the
          MetricKey union for a non-ranked context metric. */}
      <SubsectionHeader
        eyebrow="Concession activity"
        title="How often this operator advertises concessions"
      />
      {hasConcessions ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-baseline gap-3 flex-wrap">
            <p
              className="text-[34px] font-semibold leading-none tracking-[-0.014em] dq-tnum"
              style={{ color: accentColor }}
            >
              {ratePct}%
            </p>
            <p className="text-[15px] text-foreground/80">
              of T12 listings mention concessions
            </p>
          </div>
          <p className="text-[13.5px] text-muted-foreground">
            <span className="dq-mono font-semibold text-navy">
              {fmtInt(ctx.listingCount)}
            </span>{" "}
            of{" "}
            <span className="dq-mono font-semibold text-navy">
              {fmtInt(ctx.t12Listings)}
            </span>{" "}
            listings
            {medianPct !== null && (
              <>
                <span className="mx-2 text-muted-2">·</span>
                Market median:{" "}
                <span className="dq-mono font-semibold text-navy">
                  {medianPct}%
                </span>
                {ctx.cohortSize > 0 && (
                  <span className="text-muted-2"> (n={ctx.cohortSize})</span>
                )}
              </>
            )}
          </p>
          {patternLabels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {patternLabels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-full border border-grid bg-white px-2.5 py-1 text-[11.5px] font-semibold text-navy"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
          {ctx.samples.length > 0 && (
            <div className="space-y-2.5">
              {ctx.samples.map((sample, i) => (
                <div
                  key={i}
                  className="rounded-md border border-grid bg-white/60 px-4 py-3"
                >
                  <p className="dq-eyebrow-muted text-[10.5px] tracking-[0.12em] mb-1.5">
                    {ctx.samples.length > 1 ? `Sample ${i + 1}` : "Sample"}
                  </p>
                  <p className="text-[13.5px] italic leading-[1.55] text-foreground/85">
                    &ldquo;{formatConcessionSample(sample)}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 text-[14.5px] leading-[1.55] text-foreground/80">
          No concession language detected in this operator&rsquo;s T12 listings.
          {medianPct !== null && (
            <>
              {" "}
              Market median is{" "}
              <span className="dq-mono font-semibold text-navy">
                {medianPct}%
              </span>
              {ctx.cohortSize > 0 && (
                <span className="text-muted-2"> (n={ctx.cohortSize})</span>
              )}
              .
            </>
          )}
        </p>
      )}
      <p className="mt-5 text-[11.5px] leading-[1.5] text-muted-foreground">
        Concession detection uses regex-based pattern matching on listing
        descriptions. v1 catches stereotyped language (&ldquo;one month
        free&rdquo;, &ldquo;move-in special&rdquo;, etc.); indirect or nuanced
        concession terms may be missed. This metric is shown for context; it
        is not used in ranking.{" "}
        <Link
          href="/methodology#concession-activity"
          className="font-medium text-teal hover:text-teal-700 hover:underline"
        >
          Read methodology →
        </Link>
      </p>
    </article>
  );
}

function ShareTrajectorySection({ view }: { view: ShareTrajectoryView }) {
  if (view.eligibility === "null_baseline") {
    return (
      <article id="share-trajectory" className="dq-section">
        <SubsectionHeader
          eyebrow="Share trajectory"
          title="Share of listing activity"
        />
        <div className="mt-4 space-y-3">
          <p className="text-[20px] font-semibold leading-tight text-navy">
            New operator — no prior baseline
          </p>
          <p className="text-[14px] text-muted-foreground">
            Current 12-month period:{" "}
            <span className="dq-mono font-medium text-navy">
              {fmtInt(view.t12ListingsCount ?? 0)}
            </span>{" "}
            listings
          </p>
          <p className="max-w-[720px] text-[14px] leading-[1.65] text-foreground/85">
            {view.narrative}
          </p>
        </div>
        <ShareTrajectoryMethodologyFooter />
      </article>
    );
  }

  if (view.eligibility === "new_in_coverage") {
    return (
      <article id="share-trajectory" className="dq-section">
        <SubsectionHeader
          eyebrow="Share trajectory"
          title="Share of listing activity"
        />
        <div className="mt-4 space-y-3">
          <p className="text-[20px] font-semibold leading-tight text-navy">
            Newly tracked operator
          </p>
          <p className="text-[14px] text-muted-foreground">
            Current 12-month period:{" "}
            <span className="dq-mono font-medium text-navy">
              {fmtInt(view.t12ListingsCount ?? 0)}
            </span>{" "}
            listings
          </p>
          <p className="max-w-[720px] text-[14px] leading-[1.65] text-foreground/85">
            {view.narrative}
          </p>
        </div>
        <ShareTrajectoryMethodologyFooter />
      </article>
    );
  }

  // Continuing branch — primary headline is the YoY change in share,
  // visually largest. Supporting share data + peer median fall below as
  // smaller secondary lines. Narrative paragraph carries the
  // interpretation and gets prose-line width. Methodology footer is the
  // muted closer.
  const share12 = (view.shareT12 ?? 0) * 100;
  const share24 = (view.shareT24T12 ?? 0) * 100;
  const yoy = (view.shareTrajectoryYoY ?? 0) * 100;
  const cohortMedian = (view.cohortMedianShareTrajectoryYoY ?? 0) * 100;

  // ±5pp neutral band around the COHORT MEDIAN — only meaningfully large
  // divergence from the typical continuing operator earns a directional
  // color. Same threshold as the narrative builder so the prose and the
  // color signal agree.
  const deltaVsCohort = yoy - cohortMedian;
  let tone: "good" | "bad" | "neutral";
  if (deltaVsCohort > 5) tone = "good";
  else if (deltaVsCohort < -5) tone = "bad";
  else tone = "neutral";
  const toneClass =
    tone === "good"
      ? "text-good"
      : tone === "bad"
        ? "text-orange"
        : "text-navy";

  const yoySign = yoy > 0 ? "+" : yoy < 0 ? "−" : "";
  const cohortSign = cohortMedian > 0 ? "+" : cohortMedian < 0 ? "−" : "";

  return (
    <article id="share-trajectory" className="dq-section">
      <SubsectionHeader
        eyebrow="Share trajectory"
        title="Share of listing activity"
      />
      <div className="mt-4 space-y-4">
        {/* Primary headline — YoY change in share. Largest type in the
            section; same color band the narrative paragraph names. */}
        <div>
          <p className="dq-eyebrow-muted mb-1.5">YoY change in share</p>
          <p
            className={`dq-mono text-[36px] font-bold leading-none tracking-[-0.02em] ${toneClass}`}
          >
            {yoySign}
            {Math.abs(yoy).toFixed(1)}%
          </p>
        </div>

        {/* Supporting data — single line, secondary weight. The "was X%
            in prior 12-month period" inline phrasing reads more like
            prose than the prior labeled list. */}
        <p className="text-[14px] text-muted-foreground">
          Share of activity:{" "}
          <span className="dq-mono font-semibold text-navy">
            {share12.toFixed(2)}%
          </span>{" "}
          (was{" "}
          <span className="dq-mono text-navy/85">{share24.toFixed(2)}%</span>{" "}
          in prior 12-month period)
        </p>

        {/* Peer median — small accent line. "Peer" replaces the old
            "continuing-cohort" jargon; N pill moved into the methodology
            footer rather than inline. */}
        <p className="text-[13px] text-muted-foreground">
          Peer median:{" "}
          <span className="dq-mono font-medium text-muted-foreground">
            {cohortSign}
            {Math.abs(cohortMedian).toFixed(1)}%
          </span>
        </p>

        {/* Narrative — the interpretation layer. Prose-width column so
            the paragraph reads at body-text rhythm, not a wide banner. */}
        <p className="max-w-[720px] pt-1 text-[14.5px] leading-[1.65] text-foreground/85">
          {view.narrative}
        </p>
      </div>

      <ShareTrajectoryMethodologyFooter />
    </article>
  );
}

// --- 5G — Pricing Data ---

function PricingDataSection({
  scorecard,
  pricingTier,
}: {
  scorecard: ScorecardData;
  pricingTier: PricingTierSignal | null;
}) {
  // v0.6.2 doesn't seed BR-bucketed rent. Surface the most-recent observed
  // operator median + listings backing + the MSA-wide pricing tier (same
  // signal Layer 4 computes; we render the value here too so the 5F box is
  // self-contained rather than cross-referencing Layer 4).
  const latest = [...scorecard.rentTrajectory]
    .filter((q) => typeof q.mixAdjMedian === "number" && q.mixAdjMedian > 0)
    .sort((a, b) => (b.quarter || "").localeCompare(a.quarter || ""))[0];

  const tierLabel = pricingTier?.tier
    ? pricingTier.tier === "premium"
      ? "Premium"
      : pricingTier.tier === "value"
        ? "Value"
        : "Mid-market"
    : null;
  const tierContext =
    pricingTier?.percentile !== undefined && pricingTier?.percentile !== null
      ? `${Math.round(pricingTier.percentile)}th pct · MSA rents`
      : "MSA rent distribution";

  return (
    <article id="pricing-data" className="dq-section">
      <SubsectionHeader
        eyebrow="Pricing data"
        title="Rent level snapshot"
      />
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Stat
          label="Most recent observed median"
          value={latest ? `$${fmtInt(Math.round(latest.mixAdjMedian))}` : "—"}
          unit={latest ? `mix-adjusted · ${latest.quarter}` : ""}
        />
        <Stat
          label="Listings backing"
          value={latest ? fmtInt(latest.n) : "—"}
          unit={latest ? "obs T12 quarter" : ""}
        />
        <Stat
          label="Pricing tier"
          value={tierLabel ?? "—"}
          unit={tierLabel ? tierContext : "Insufficient MSA rent data"}
        />
      </div>
      <p className="mt-4 max-w-[780px] text-[13px] italic text-muted-2">
        Median rent by bedroom bucket (1BR / 2BR / 3BR+) with 10th-90th
        percentile ranges is not in the v0.6.2 seed. BR-bucketed pricing data
        is a v0.7 data-pipeline item. The pricing tier above (Premium /
        Mid-market / Value) is computed at render time from the operator&rsquo;s
        latest mix-adjusted median rent positioned within the MSA rent
        distribution.
      </p>
    </article>
  );
}

// --- Shared primitives ---

function SubsectionHeader({
  eyebrow,
  title,
  metricKey,
}: {
  eyebrow: string;
  title: string;
  metricKey?: MetricKey;
}) {
  return (
    <header>
      <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-teal">
        {eyebrow}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <h3 className="text-[20px] font-semibold leading-tight tracking-[-0.012em] text-navy">
          {title}
        </h3>
        {metricKey && <InfoIcon metricKey={metricKey} />}
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-md border border-grid bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-2">
        {label}
      </p>
      <p className="dq-tnum mt-1.5 text-[22px] font-bold leading-none text-navy">
        {value}
      </p>
      {unit && (
        <p className="mt-1 text-[11.5px] text-muted-foreground">{unit}</p>
      )}
    </div>
  );
}

function StarIcon({ level, size = 14 }: { level: StarLevel; size?: number }) {
  const isGold = level === "gold";
  const isSilver = level === "silver";
  const fill = isGold ? "#E5A800" : isSilver ? "#9CA3AF" : "transparent";
  const stroke = isGold ? "#B98700" : isSilver ? "#6B7280" : "var(--color-muted-2)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-label={
        level === "gold"
          ? "Gold star"
          : level === "silver"
            ? "Silver star"
            : "No star"
      }
      className="shrink-0"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.7l-5.9 3.1 1.13-6.58L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}

