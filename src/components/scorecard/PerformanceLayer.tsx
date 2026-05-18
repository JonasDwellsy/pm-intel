import Link from "next/link";
import type { Layer3Metric, PeerComparison } from "@/lib/peer-comparison";
import { METRIC_DIRECTIONS } from "@/lib/peer-comparison";
import type { ScorecardData, StarLevel } from "@/lib/types";
import { fmtNumber } from "@/lib/format";

// Layer 3 — Performance dimensions with integrated peer comparison
// (Scorecard_Design_Spec_v1.0.md Section 3, Layer 3). One card per metric:
//
//   Card 1 — Lease-up Performance (DOM days T12, lower better)
//   Card 2 — Tenant Retention (median tenancy months, higher better)
//   Card 3 — Rent Performance (YoY delta vs cohort, higher better)
//   Card 4 — Operational Discipline (marketing composite score, higher better)
//   Card 5 — Inventory Transparency (visibility ratio, higher better; MF/BTR
//            only, suppressed when communityVisibility is null)
//
// Each card carries: title + cohort qualifier with star, headline value with
// direction-aware trend, distribution chart (P25/median/P75 band with focal
// marker), inline peer comparison table (5 rows: focal + nearest neighbors,
// alphabetical), and a 1-2 sentence factual context paragraph. Per Decision
// G.4 every comparison string is factual; no editorial labels.

type CardConfig = {
  metric: Layer3Metric;
  title: string;
  headlineFormat: (v: number) => { value: string; unit?: string };
  rowFormat: (v: number) => string;
  /** Definition sentence — opens the context paragraph. */
  definition: string;
};

const SHARED_CARDS: CardConfig[] = [
  {
    metric: "dom",
    title: "Lease-up Performance",
    headlineFormat: (v) => ({ value: fmtNumber(v, 1), unit: "days median DOM" }),
    rowFormat: (v) => `${fmtNumber(v, 1)} d`,
    definition:
      "Lease-up Performance measures the median days a listing sits between activation and lease in trailing 12 months.",
  },
  {
    metric: "tenancy",
    title: "Tenant Retention",
    headlineFormat: (v) => ({ value: fmtNumber(v, 1), unit: "months median tenancy" }),
    rowFormat: (v) => `${fmtNumber(v, 1)} mo`,
    definition:
      "Tenant Retention measures the median time between successive listings of the same unit — a proxy for how long the average tenant stays.",
  },
  {
    metric: "rentPerformance",
    title: "Rent Performance",
    headlineFormat: (v) => ({
      value: `${v > 0 ? "+" : ""}${fmtNumber(v * 100, 1)}`,
      unit: "pp vs cohort YoY",
    }),
    rowFormat: (v) => `${v > 0 ? "+" : ""}${fmtNumber(v * 100, 1)}pp`,
    definition:
      "Rent Performance measures the operator's mix-adjusted YoY rent change against the cohort median for the same period.",
  },
  {
    metric: "marketing",
    title: "Operational Discipline",
    headlineFormat: (v) => ({ value: fmtNumber(v, 0), unit: "/ 100 marketing quality" }),
    rowFormat: (v) => `${fmtNumber(v, 0)} / 100`,
    definition:
      "Operational Discipline measures listing completeness, amenity disclosure, description depth, and photo coverage on a 0–100 composite.",
  },
];

const INVENTORY_TRANSPARENCY_CARD: CardConfig = {
  metric: "communityVisibility",
  title: "Inventory Transparency",
  headlineFormat: (v) => ({ value: fmtNumber(v, 2), unit: "visibility ratio" }),
  rowFormat: (v) => fmtNumber(v, 2),
  definition:
    "Inventory Transparency measures observed listings against expected turnover for known MF/BTR community sizes — a ratio of what we see vs. what we'd expect at typical turnover.",
};

export function PerformanceLayer({
  scorecard,
  peerComparisons,
}: {
  scorecard: ScorecardData;
  peerComparisons: Record<Layer3Metric, PeerComparison | null>;
}) {
  const cards = [...SHARED_CARDS];
  // Inventory Transparency only renders when CV is present (MF/BTR scope gate
  // passed). The peer-comparison helper returns null otherwise.
  if (peerComparisons.communityVisibility) {
    cards.push(INVENTORY_TRANSPARENCY_CARD);
  }

  return (
    <section
      id="performance"
      aria-label="Performance dimensions"
      className="dq-section space-y-8"
    >
      <div>
        <p className="dq-eyebrow">Performance dimensions</p>
        <p className="mt-3 max-w-[780px] text-[14px] leading-[1.6] text-muted-foreground">
          Each card shows a metric, the cohort it&rsquo;s compared against, and
          the four nearest neighbors by value. Stars reflect quartile position
          within cohort.
        </p>
      </div>

      <div className="space-y-6">
        {cards.map((cfg) => (
          <PerformanceCard
            key={cfg.metric}
            scorecard={scorecard}
            config={cfg}
            comparison={peerComparisons[cfg.metric]}
          />
        ))}
      </div>
    </section>
  );
}

// --- Single card ---

function PerformanceCard({
  scorecard,
  config,
  comparison,
}: {
  scorecard: ScorecardData;
  config: CardConfig;
  comparison: PeerComparison | null;
}) {
  // Card-specific caveats (e.g., Tenancy short-history) are merged into the
  // footnote line below the card header.
  const tenancyCaveat =
    config.metric === "tenancy" &&
    scorecard.tenancy.shortHistoryFlag === true &&
    scorecard.tenancy.yearsVisible !== undefined
      ? `Tenancy estimate may be biased low for operators with shorter observation history. ${scorecard.pm.name} has been observed in our data for ${fmtNumber(scorecard.tenancy.yearsVisible, 1)} years.`
      : null;
  const footnote = [comparison?.footnote, tenancyCaveat]
    .filter(Boolean)
    .join(" ");

  // No comparison or no focal value → render the card header + "insufficient
  // data" callout so the structural cadence stays consistent across all PMs.
  if (!comparison || comparison.focalValue === null) {
    return (
      <article
        id={cardAnchor(config.metric)}
        className="dq-section dq-chart-card"
      >
        <CardHeader
          config={config}
          comparison={comparison}
          footnote={footnote}
        />
        <p className="mt-4 text-[13.5px] text-muted-foreground">
          Insufficient data to compute {config.title.toLowerCase()} for this
          operator.
        </p>
      </article>
    );
  }

  const headline = config.headlineFormat(comparison.focalValue);
  const trendArrow = trendArrowFor(config.metric, comparison);

  return (
    <article
      id={cardAnchor(config.metric)}
      className="dq-section dq-chart-card"
    >
      <CardHeader
        config={config}
        comparison={comparison}
        footnote={footnote}
      />

      {/* Headline + distribution */}
      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:items-start">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="dq-tnum text-[40px] font-bold leading-none tracking-[-0.022em] text-navy">
              {headline.value}
            </span>
            {trendArrow && (
              <span
                className={
                  "dq-tnum text-[14px] font-semibold " +
                  (trendArrow.direction === "favorable"
                    ? "text-good"
                    : trendArrow.direction === "unfavorable"
                      ? "text-bad"
                      : "text-muted-foreground")
                }
              >
                {trendArrow.symbol} {trendArrow.label}
              </span>
            )}
          </div>
          {headline.unit && (
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {headline.unit}
            </p>
          )}
        </div>

        <DistributionChart comparison={comparison} config={config} />
      </div>

      {/* Peer comparison table */}
      <div className="mt-7">
        <p className="dq-eyebrow-muted">How peers compare in {comparison.cohortName}</p>
        <PeerTable comparison={comparison} config={config} />
      </div>

      {/* Context paragraph */}
      <p className="mt-5 max-w-[780px] text-[13.5px] leading-[1.6] text-muted-foreground">
        {config.definition} {scorecard.pm.name}&rsquo;s value of{" "}
        <strong className="font-semibold text-navy">
          {config.rowFormat(comparison.focalValue)}
        </strong>
        {comparison.cohortMedian !== null && (
          <>
            {" "}compares to the {comparison.cohortName} median of{" "}
            <strong className="font-semibold text-navy">
              {config.rowFormat(comparison.cohortMedian)}
            </strong>
            .
          </>
        )}
      </p>
    </article>
  );
}

// --- Card header (title + cohort qualifier + star + footnote) ---

function CardHeader({
  config,
  comparison,
  footnote,
}: {
  config: CardConfig;
  comparison: PeerComparison | null;
  footnote?: string;
}) {
  const qualifier = starQualifier(comparison?.focalStar ?? null);
  return (
    <header className="flex flex-col gap-2 border-b border-grid-soft pb-4 md:flex-row md:items-start md:justify-between md:gap-6">
      <div className="min-w-0">
        <h3 className="text-[18px] font-semibold leading-tight tracking-[-0.012em] text-navy md:text-[20px]">
          {config.title}
        </h3>
        {comparison && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
            <StarIcon level={comparison.focalStar} size={14} />
            <span className={qualifier.toneClass}>{qualifier.label}</span>
            <span className="text-muted-2">·</span>
            <span>{comparison.cohortName}</span>
            <span className="text-muted-2">·</span>
            <span className="dq-tnum">n = {comparison.cohortN}</span>
          </p>
        )}
        {footnote && (
          <p className="mt-2 max-w-[680px] text-[12.5px] italic leading-[1.45] text-muted-2">
            {footnote}
          </p>
        )}
      </div>
      <span
        aria-hidden
        title="Methodology details (coming in v1.0 Phase G)"
        className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center self-start rounded-full border border-grid bg-white text-[10px] font-semibold text-muted-2"
      >
        i
      </span>
    </header>
  );
}

// --- Distribution chart — P25/median/P75 band with focal marker ---

function DistributionChart({
  comparison,
  config,
}: {
  comparison: PeerComparison;
  config: CardConfig;
}) {
  if (
    comparison.cohortP25 === null ||
    comparison.cohortP75 === null ||
    comparison.cohortMedian === null ||
    comparison.focalValue === null
  ) {
    return (
      <div className="flex h-[88px] items-center text-[13px] text-muted-2">
        Distribution unavailable
      </div>
    );
  }

  const values = comparison.rows.map((r) => r.value);
  const minV = Math.min(comparison.cohortP25, comparison.focalValue, ...values);
  const maxV = Math.max(comparison.cohortP75, comparison.focalValue, ...values);
  const span = maxV - minV || 1;
  const pad = span * 0.08;
  const lo = minV - pad;
  const hi = maxV + pad;
  const total = hi - lo || 1;

  const pos = (v: number) => ((v - lo) / total) * 100;
  const direction = METRIC_DIRECTIONS[config.metric];

  return (
    <div className="dq-section">
      <div className="relative h-[88px]">
        {/* Track */}
        <div className="absolute left-0 right-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-grid-soft" />
        {/* IQR band */}
        <div
          className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-teal-soft"
          style={{
            left: `${pos(comparison.cohortP25)}%`,
            width: `${pos(comparison.cohortP75) - pos(comparison.cohortP25)}%`,
          }}
        />
        {/* Median tick */}
        <div
          className="absolute top-1/2 h-[14px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-teal"
          style={{ left: `${pos(comparison.cohortMedian)}%` }}
          aria-hidden
        />
        {/* Focal marker */}
        <div
          className="absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-navy bg-white shadow-sm"
          style={{ left: `${pos(comparison.focalValue)}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-2">
        <span>
          {direction === "lower_better" ? "Faster" : "Lower"} {labelForAxis(config.metric)}
        </span>
        <span>
          Cohort IQR — P25 {config.rowFormat(comparison.cohortP25)} · median{" "}
          <span className="text-teal">
            {config.rowFormat(comparison.cohortMedian)}
          </span>{" "}
          · P75 {config.rowFormat(comparison.cohortP75)}
        </span>
        <span>
          {direction === "lower_better" ? "Slower" : "Higher"}{" "}
          {labelForAxis(config.metric)}
        </span>
      </div>
    </div>
  );
}

function labelForAxis(metric: Layer3Metric): string {
  switch (metric) {
    case "dom":
      return "DOM";
    case "tenancy":
      return "tenancy";
    case "rentPerformance":
      return "rent delta";
    case "marketing":
      return "marketing score";
    case "communityVisibility":
      return "ratio";
  }
}

// --- Peer comparison table ---

function PeerTable({
  comparison,
  config,
}: {
  comparison: PeerComparison;
  config: CardConfig;
}) {
  // Compute value-band positions so each row's mini-bar reflects its place in
  // the visible set (focal + neighbors). Anchored to the table's own min/max
  // so the bars stay legible regardless of cohort spread.
  const values = comparison.rows.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const direction = METRIC_DIRECTIONS[config.metric];

  return (
    <ul className="mt-3 overflow-hidden rounded-md border border-grid bg-white">
      {comparison.rows.map((row) => {
        // Bar fills from the favorable side (left for higher-better, right for
        // lower-better) toward the value position. Keeps "favorable" on the
        // left visually across all metrics.
        const ratio = (row.value - min) / span;
        const widthPct =
          direction === "higher_better" ? ratio * 100 : (1 - ratio) * 100;
        return (
          <li
            key={row.slug}
            className={
              "relative flex items-center gap-3 border-b border-grid-soft px-4 py-2.5 last:border-b-0 " +
              (row.isFocal ? "bg-teal-soft" : "")
            }
          >
            {row.isFocal && (
              <span
                aria-hidden
                className="absolute left-0 top-0 h-full w-[3px] bg-teal"
              />
            )}
            <span
              aria-hidden
              className={
                "w-[16px] text-[12px] font-semibold " +
                (row.isFocal ? "text-teal-700" : "text-transparent")
              }
            >
              {row.isFocal ? "▶" : ""}
            </span>
            <StarIcon level={row.star} size={13} />
            <span
              className={
                "min-w-0 flex-[2_2_0] truncate text-[13px] " +
                (row.isFocal ? "font-semibold text-navy" : "font-medium text-foreground")
              }
            >
              {row.isFocal ? (
                <span>{row.name}</span>
              ) : (
                <Link
                  href={row.href}
                  className="transition-colors hover:text-teal"
                >
                  {row.name}
                </Link>
              )}
            </span>
            <div className="relative flex-[3_3_0]">
              <div className="h-[6px] rounded-full bg-grid-soft" />
              <div
                className={
                  "absolute top-0 h-[6px] rounded-full " +
                  (row.isFocal ? "bg-navy" : "bg-teal")
                }
                style={{
                  width: `${Math.max(2, widthPct)}%`,
                  left: direction === "lower_better" ? `${100 - widthPct}%` : "0%",
                }}
              />
            </div>
            <span
              className={
                "dq-tnum w-[80px] shrink-0 text-right text-[13px] " +
                (row.isFocal ? "font-semibold text-navy" : "font-medium text-foreground")
              }
            >
              {config.rowFormat(row.value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// --- Helpers ---

function trendArrowFor(
  metric: Layer3Metric,
  comparison: PeerComparison
): { symbol: string; label: string; direction: "favorable" | "unfavorable" | "neutral" } | null {
  if (
    comparison.focalValue === null ||
    comparison.cohortMedian === null
  ) {
    return null;
  }
  const delta = comparison.focalValue - comparison.cohortMedian;
  if (Math.abs(delta) < 1e-6) {
    return { symbol: "▬", label: "at cohort median", direction: "neutral" };
  }
  const direction = METRIC_DIRECTIONS[metric];
  const favorable =
    direction === "higher_better" ? delta > 0 : delta < 0;
  const arrow = delta > 0 ? "▲" : "▼";

  let label = "";
  if (metric === "dom") {
    label = `${fmtNumber(Math.abs(delta), 1)} d vs cohort`;
  } else if (metric === "tenancy") {
    label = `${fmtNumber(Math.abs(delta), 1)} mo vs cohort`;
  } else if (metric === "rentPerformance") {
    label = `${fmtNumber(Math.abs(delta) * 100, 1)} pp vs cohort`;
  } else if (metric === "marketing") {
    label = `${fmtNumber(Math.abs(delta), 0)} pts vs cohort`;
  } else if (metric === "communityVisibility") {
    label = `${fmtNumber(Math.abs(delta), 2)} vs cohort`;
  }

  return {
    symbol: arrow,
    label,
    direction: favorable ? "favorable" : "unfavorable",
  };
}

function starQualifier(level: StarLevel): { label: string; toneClass: string } {
  if (level === "gold") {
    return { label: "Gold star · Top quartile in cohort", toneClass: "text-navy" };
  }
  if (level === "silver") {
    return {
      label: "Silver star · Above median in cohort",
      toneClass: "text-navy",
    };
  }
  return { label: "No star · Present in cohort", toneClass: "text-muted-foreground" };
}

function cardAnchor(metric: Layer3Metric): string {
  switch (metric) {
    case "dom":
      return "lease-up";
    case "tenancy":
      return "tenant-retention";
    case "rentPerformance":
      return "rent-performance";
    case "marketing":
      return "operational-discipline";
    case "communityVisibility":
      return "inventory-transparency";
  }
}

// Shared star icon (matches the IdentityHero + SynthesisLayer sizing).
function StarIcon({
  level,
  size = 14,
}: {
  level: StarLevel;
  size?: number;
}) {
  const isGold = level === "gold";
  const isSilver = level === "silver";
  const fill = isGold
    ? "#E5A800"
    : isSilver
      ? "#9CA3AF"
      : "transparent";
  const stroke = isGold
    ? "#B98700"
    : isSilver
      ? "#6B7280"
      : "var(--color-muted-2)";
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

