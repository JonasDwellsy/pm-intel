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
import type { ScorecardData, StarLevel } from "@/lib/types";
import { fmtInt, fmtNumber } from "@/lib/format";
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
}: {
  scorecard: ScorecardData;
  crossMarketPresence: MarketFootprintPill[];
  cohortRentTrajectory: CohortRentTrajectory | null;
}) {
  const opType = classify(scorecard);
  const isMultiMarket = crossMarketPresence.length > 1;
  // Subsection visibility — drives both the conditional renders below and
  // the sequential 5A-5F label assignment. The display labels renumber so
  // a reader sees an unbroken sequence (single-market operators show 5A-5E
  // instead of 5A-5B-5D-5E-5F). Internal anchor IDs stay stable.
  const hasGeographic =
    (scorecard.geographicCoverage.topCities?.length ?? 0) > 0;
  const hasRentTrajectory =
    Array.isArray(scorecard.rentTrajectory) &&
    scorecard.rentTrajectory.length > 0;
  const labels = computeSubsectionLabels({
    coverage: true,
    geographic: hasGeographic,
    crossMarket: isMultiMarket,
    composition: true,
    rentTrajectory: hasRentTrajectory,
    pricing: true,
  });

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

      {labels.coverage && (
        <CoverageMapAnnotated
          scorecard={scorecard}
          labelPrefix={labels.coverage}
        />
      )}
      {labels.geographic && (
        <GeographicSpreadSection
          scorecard={scorecard}
          opType={opType}
          labelPrefix={labels.geographic}
        />
      )}
      {labels.crossMarket && (
        <CrossMarketPresenceSection
          rows={crossMarketPresence}
          labelPrefix={labels.crossMarket}
        />
      )}
      {labels.composition && (
        <PortfolioCompositionSection
          scorecard={scorecard}
          opType={opType}
          labelPrefix={labels.composition}
        />
      )}
      {labels.rentTrajectory && (
        <RentTrajectoryDescriptive
          scorecard={scorecard}
          overlay={cohortRentTrajectory}
          labelPrefix={labels.rentTrajectory}
        />
      )}
      {labels.pricing && (
        <PricingDataSection
          scorecard={scorecard}
          labelPrefix={labels.pricing}
        />
      )}
    </section>
  );
}

// Assigns sequential 5A, 5B, 5C, ... labels to whichever subsections will
// render for this operator. Suppressed subsections receive null and are
// skipped at render time; the remaining sections get a tight unbroken
// alphabet sequence (a single-market operator with all-else-rendered gets
// 5A, 5B, 5C, 5D, 5E — not 5A, 5B, 5D, 5E, 5F).
type SubsectionVisibility = {
  coverage: boolean;
  geographic: boolean;
  crossMarket: boolean;
  composition: boolean;
  rentTrajectory: boolean;
  pricing: boolean;
};

function computeSubsectionLabels(
  vis: SubsectionVisibility
): Record<keyof SubsectionVisibility, string | null> {
  const out: Record<keyof SubsectionVisibility, string | null> = {
    coverage: null,
    geographic: null,
    crossMarket: null,
    composition: null,
    rentTrajectory: null,
    pricing: null,
  };
  let i = 0;
  const order: Array<keyof SubsectionVisibility> = [
    "coverage",
    "geographic",
    "crossMarket",
    "composition",
    "rentTrajectory",
    "pricing",
  ];
  for (const key of order) {
    if (vis[key]) {
      out[key] = `5${String.fromCharCode(65 + i)}`;
      i += 1;
    }
  }
  return out;
}

// --- 5A — Coverage Map with Narrative Annotation ---

function CoverageMapAnnotated({
  scorecard,
  labelPrefix,
}: {
  scorecard: ScorecardData;
  labelPrefix: string;
}) {
  const { geographicCoverage, market } = scorecard;
  const accentColor = scorecard.pm.accentColor ?? DEFAULT_ACCENT;
  const annotation = scorecard.generatedText?.mapNarrativeAnnotation;

  return (
    <article id="geography" className="dq-section">
      <SubsectionHeader
        eyebrow={`${labelPrefix} · Coverage map`}
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
  labelPrefix,
}: {
  scorecard: ScorecardData;
  opType: Operator;
  labelPrefix: string;
}) {
  const cities = scorecard.geographicCoverage.topCities ?? [];
  if (cities.length === 0) return null;
  const total = scorecard.coverage.totalObservedUnits ?? scorecard.coverage.urusT12;
  const top3 = cities.slice(0, 3).reduce((s, c) => s + c.pct, 0);

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
        eyebrow={`${labelPrefix} · Geographic spread`}
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
              return (
                <li
                  key={c.name}
                  className="relative flex items-center gap-3 border-b border-grid-soft px-4 py-2 last:border-b-0"
                >
                  <span className="w-[14px] text-[11px] font-semibold text-muted-2">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-[2_2_0] truncate text-[13.5px] font-medium text-navy">
                    {c.name}
                  </span>
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

function CrossMarketPresenceSection({
  rows,
  labelPrefix,
}: {
  rows: MarketFootprintPill[];
  labelPrefix: string;
}) {
  return (
    <article id="cross-market" className="dq-section">
      <SubsectionHeader
        eyebrow={`${labelPrefix} · Cross-market presence`}
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
  labelPrefix,
}: {
  scorecard: ScorecardData;
  opType: Operator;
  labelPrefix: string;
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
        eyebrow={`${labelPrefix} · Portfolio composition`}
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
  labelPrefix,
}: {
  scorecard: ScorecardData;
  overlay: CohortRentTrajectory | null;
  labelPrefix: string;
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
        eyebrow={`${labelPrefix} · Rent trajectory · descriptive`}
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

// --- 5F — Pricing Data ---

function PricingDataSection({
  scorecard,
  labelPrefix,
}: {
  scorecard: ScorecardData;
  labelPrefix: string;
}) {
  // v0.6.2 doesn't seed BR-bucketed rent. Surface the most-recent observed
  // operator median + cohort context (deferred to Layer 4 Pricing Tier for
  // the tier label) and disclose the data gap.
  const latest = [...scorecard.rentTrajectory]
    .filter((q) => typeof q.mixAdjMedian === "number" && q.mixAdjMedian > 0)
    .sort((a, b) => (b.quarter || "").localeCompare(a.quarter || ""))[0];
  return (
    <article id="pricing-data" className="dq-section">
      <SubsectionHeader
        eyebrow={`${labelPrefix} · Pricing data`}
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
          value="see Layer 4"
          unit="Lending Signals · Pricing Tier"
        />
      </div>
      <p className="mt-4 max-w-[780px] text-[13px] italic text-muted-2">
        Median rent by bedroom bucket (1BR / 2BR / 3BR+) with 10th-90th
        percentile ranges is not in the v0.6.2 seed. BR-bucketed pricing data
        is a v0.7 data-pipeline item. The MSA-wide tier label (Premium /
        Mid-market / Value) is computed at render time and surfaced in Layer 4
        (Lending Signals — Pricing Tier).
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

