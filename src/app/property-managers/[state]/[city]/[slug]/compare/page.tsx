import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { loadMsaPool, type PoolPm } from "@/lib/msa-pool";
import { selectComparisonPeers } from "@/lib/peer-comparison-view";
import { quadrant7Color } from "@/lib/quadrant7-colors";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import { StarSummaryChip } from "@/components/scorecard/StarSummaryChip";
import { fmtInt } from "@/lib/format";
import type { ScorecardData, StarLevel } from "@/lib/types";

// /property-managers/[state]/[city]/[slug]/compare — peer comparison
// page. Server-rendered. Resolves the focal operator + their MSA pool,
// runs selectComparisonPeers (strict → family → market waterfall),
// renders a 4-column side-by-side. Cell highlighting on metrics where
// the focal outperforms / underperforms the peer median by ≥10%.

export const dynamic = "force-dynamic";

type RouteParams = { state: string; city: string; slug: string };

async function loadFocal(slug: string): Promise<{
  scorecard: ScorecardData;
  marketId: string;
  marketCity: string;
  marketFullName: string;
  marketState: string;
} | null> {
  const pm = await prisma.pM.findUnique({
    where: { slug },
    include: { market: { select: { id: true, city: true, state: true, fullName: true } } },
  });
  if (!pm) return null;
  return {
    scorecard: JSON.parse(pm.scorecardData) as ScorecardData,
    marketId: pm.market.id,
    marketCity: pm.market.city,
    marketFullName: pm.market.fullName,
    marketState: pm.market.state,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadFocal(slug);
  if (!loaded) return { title: "Compare not found" };
  const title = `Compare ${loaded.scorecard.pm.name} with peers — Dwellsy IQ`;
  const description = `Side-by-side comparison of ${loaded.scorecard.pm.name} against same-cohort peers in ${loaded.marketFullName}.`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
  };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state, city, slug } = await params;
  const loaded = await loadFocal(slug);
  if (!loaded) notFound();

  // Resolve state/city slug params and confirm they match the focal's
  // actual market — protects against e.g. /arizona/phoenix/<TN-operator>/compare.
  const expectedStateSlug = stateCodeToSlug(loaded.marketState);
  const expectedCitySlug = citySlug(loaded.marketCity);
  if (expectedStateSlug !== state || expectedCitySlug !== city) notFound();

  const msaPool = await loadMsaPool(loaded.marketId);
  const cohort = selectComparisonPeers(slug, loaded.marketFullName, msaPool, 3);
  const focalEntry = msaPool.find((p) => p.slug === slug);

  // Pre-compute peer medians for the metrics we highlight, then bake
  // each focal cell's tone into a small dataset the row components
  // consume. Keeps the JSX flat.
  const focalScorecard = focalEntry?.scorecard ?? loaded.scorecard;
  const metrics = buildMetricRows(focalScorecard, cohort.peers);

  const scorecardHref = `/property-managers/${expectedStateSlug}/${expectedCitySlug}/${slug}`;
  const focalAccent = focalScorecard.pm.accentColor ?? "#1B6E8C";

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-[1280px] px-6 py-10 sm:py-12">
        {/* Breadcrumb + back link */}
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex items-center gap-2 text-xs font-medium text-muted-foreground"
        >
          <Link href="/property-managers" className="hover:text-navy">
            Markets
          </Link>
          <span className="text-muted-2">/</span>
          <Link
            href={`/property-managers/${expectedStateSlug}`}
            className="hover:text-navy"
          >
            {expectedStateSlug
              .replace(/-/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase())}
          </Link>
          <span className="text-muted-2">/</span>
          <Link
            href={`/property-managers/${expectedStateSlug}/${expectedCitySlug}`}
            className="hover:text-navy"
          >
            {loaded.marketFullName}
          </Link>
          <span className="text-muted-2">/</span>
          <Link href={scorecardHref} className="hover:text-navy">
            {focalScorecard.pm.name}
          </Link>
          <span className="text-muted-2">/</span>
          <span>Compare</span>
        </nav>

        {/* Header */}
        <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
          Peer comparison
        </p>
        <h1 className="mt-2 text-[30px] font-semibold leading-[1.15] tracking-[-0.012em] text-navy sm:text-[36px]">
          Compare {focalScorecard.pm.name} with peers
        </h1>
        <p className="mt-2 text-[14.5px] text-foreground/80">
          {cohort.cohortScope}
        </p>
        {cohort.cohortNote && (
          <p className="mt-2 text-[12.5px] italic text-muted-foreground">
            {cohort.cohortNote}
          </p>
        )}

        <Link
          href={scorecardHref}
          className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-teal transition-colors hover:text-teal-700"
        >
          <span aria-hidden>←</span> View {focalScorecard.pm.name} scorecard
        </Link>

        {/* Comparison grid */}
        {cohort.peers.length === 0 ? (
          <div className="mt-10 rounded-lg border border-grid bg-white px-5 py-6 text-[14px] text-foreground/80">
            No peers available for comparison in this market. The focal
            operator is the only ranked entry in their cohort.
          </div>
        ) : (
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <OperatorColumn
              scorecard={focalScorecard}
              stateSlug={expectedStateSlug}
              citySlug={expectedCitySlug}
              isFocal
              accentColor={focalAccent}
              metrics={metrics}
              roleIndex={0}
            />
            {cohort.peers.map((peer, i) => (
              <OperatorColumn
                key={peer.slug}
                scorecard={peer.scorecard}
                stateSlug={expectedStateSlug}
                citySlug={expectedCitySlug}
                isFocal={false}
                accentColor={peer.scorecard.pm.accentColor ?? "#1B6E8C"}
                metrics={metrics}
                roleIndex={i + 1}
              />
            ))}
          </div>
        )}

        {/* Methodology footer */}
        <p className="mt-12 border-t border-grid pt-5 text-[12.5px] leading-[1.5] text-muted-foreground">
          Peer comparison uses {cohort.cohortScope.toLowerCase()}.
          Methodology v0.6.4. Click any operator name above to open their
          full scorecard.{" "}
          <Link
            href="/methodology"
            className="font-medium text-teal hover:text-teal-700 hover:underline"
          >
            Read methodology →
          </Link>
        </p>
      </div>
    </div>
  );
}

// ─── per-column render + helpers ───────────────────────────────────

interface MetricRow {
  key: string;
  label: string;
  /** Focal's tone — "good" when focal outperforms peer median by ≥10%,
   *  "bad" when underperforms by ≥10%, "neutral" otherwise. Computed
   *  once at the page level and reused across columns; peer columns
   *  render neutral text regardless. */
  focalTone: "good" | "bad" | "neutral";
  /** Pre-formatted value text per role index (0 = focal, 1..N = peers). */
  values: Array<string>;
  /** Per-axis star summaries for the layer-3 rows — null when the metric
   *  isn't a star-bearing axis (DOM T12, T12 listings, etc.). */
  stars: Array<StarLevel | null>;
}

function fmtPctSigned(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  const signed = n >= 0 ? `+${(n * 100).toFixed(digits)}%` : `${(n * 100).toFixed(digits)}%`;
  return signed;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

/** Classify the focal's value relative to the peer median. direction
 *  determines whether higher is better. ≥10% delta either way wins
 *  the accent; otherwise neutral. */
function classifyFocal(
  focalVal: number | null,
  peerMedian: number | null,
  direction: "higher_better" | "lower_better"
): "good" | "bad" | "neutral" {
  if (focalVal == null || peerMedian == null || peerMedian === 0) return "neutral";
  const ratio = focalVal / peerMedian;
  if (direction === "higher_better") {
    if (ratio >= 1.1) return "good";
    if (ratio <= 0.9) return "bad";
  } else {
    // lower_better: ratio < 1 means focal is below peer (good)
    if (ratio <= 0.9) return "good";
    if (ratio >= 1.1) return "bad";
  }
  return "neutral";
}

function countStars(sc: ScorecardData, tone: "gold" | "silver"): number {
  const stars: Array<StarLevel | undefined> = [
    sc.performance.domStar,
    sc.rentPerformance?.star,
    sc.marketing.star,
    sc.tenancy.star,
    sc.communityVisibility?.star,
  ];
  return stars.filter((s) => s === tone).length;
}

function buildMetricRows(
  focal: ScorecardData,
  peers: PoolPm[]
): MetricRow[] {
  // Column 0 is focal, columns 1..N are peers.
  const all = [focal, ...peers.map((p) => p.scorecard)];

  function row(
    key: string,
    label: string,
    accessor: (sc: ScorecardData) => number | null,
    formatter: (v: number | null) => string,
    direction: "higher_better" | "lower_better",
    starAccessor?: (sc: ScorecardData) => StarLevel | null
  ): MetricRow {
    const focalVal = accessor(focal);
    const peerVals = peers
      .map((p) => accessor(p.scorecard))
      .filter((v): v is number => v !== null);
    const peerMedian = median(peerVals);
    return {
      key,
      label,
      focalTone: classifyFocal(focalVal, peerMedian, direction),
      values: all.map((sc) => formatter(accessor(sc))),
      stars: starAccessor
        ? all.map((sc) => starAccessor(sc) ?? null)
        : all.map(() => null),
    };
  }

  const fmtDom = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}d`);
  const fmtInt0 = (v: number | null) => (v == null ? "—" : fmtInt(v));
  const fmtPp = (v: number | null) =>
    v == null
      ? "—"
      : v >= 0
        ? `+${(v * 100).toFixed(2)}pp`
        : `${(v * 100).toFixed(2)}pp`;
  const fmtPctScore = (v: number | null) =>
    v == null ? "—" : `${(v * 100).toFixed(0)}%`;

  return [
    // Headline tiles
    row("dom-t12", "DOM T12", (sc) => sc.performance.domT12, fmtDom, "lower_better"),
    row(
      "share-yoy",
      "Share YoY",
      (sc) => {
        const t12 = sc.t12ListingsCount;
        const t24 = sc.t24t12ListingsCount;
        if (t12 == null || t24 == null || t24 === 0) return null;
        return (t12 - t24) / t24;
      },
      fmtPp,
      "higher_better"
    ),
    row(
      "rent-yoy",
      "Rent vs comp",
      (sc) => sc.rentPerformance?.pmYoyChange ?? null,
      fmtPctSigned,
      "higher_better"
    ),
    row(
      "t12-listings",
      "T12 listings",
      (sc) => sc.coverage.t12Listings,
      fmtInt0,
      "higher_better"
    ),
    row(
      "concession-rate",
      "Concession rate",
      (sc) =>
        typeof sc.concessionRate === "number" ? sc.concessionRate : null,
      fmtPctScore,
      "lower_better"
    ),
    // Layer 3 per-metric stars + value
    row(
      "perf-dom-star",
      "Performance · DOM star",
      (sc) => sc.performance.domT12,
      fmtDom,
      "lower_better",
      (sc) => sc.performance.domStar ?? null
    ),
    row(
      "rent-star",
      "Rent performance · star",
      (sc) => sc.rentPerformance?.pmYoyChange ?? null,
      fmtPctSigned,
      "higher_better",
      (sc) => sc.rentPerformance?.star ?? null
    ),
    row(
      "marketing-star",
      "Marketing · score",
      (sc) => sc.marketing.compositeScore,
      (v) => (v == null ? "—" : v.toFixed(1)),
      "higher_better",
      (sc) => sc.marketing.star ?? null
    ),
    row(
      "tenancy-star",
      "Tenancy · multi-episode %",
      (sc) => sc.tenancy.multiEpisodePct,
      fmtPctScore,
      "higher_better",
      (sc) => sc.tenancy.star ?? null
    ),
    row(
      "cv-star",
      "Community visibility · star",
      // CV uses ratio under the hood; show the star directly and skip
      // numeric comparison for non-qualifying operators.
      () => null,
      (v) => (v == null ? "—" : v.toFixed(2)),
      "higher_better",
      (sc) => sc.communityVisibility?.star ?? null
    ),
  ];
}

function OperatorColumn({
  scorecard,
  stateSlug,
  citySlug: city,
  isFocal,
  accentColor,
  metrics,
  roleIndex,
}: {
  scorecard: ScorecardData;
  stateSlug: string;
  citySlug: string;
  isFocal: boolean;
  accentColor: string;
  metrics: MetricRow[];
  roleIndex: number;
}) {
  const href = `/property-managers/${stateSlug}/${city}/${scorecard.pm.slug}`;
  const quadrant7Label =
    scorecard.pm.quadrant7Cell ?? scorecard.pm.quadrant;
  const quadrant7 = quadrant7Color(quadrant7Label);
  const goldStars = countStars(scorecard, "gold");
  const silverStars = countStars(scorecard, "silver");

  return (
    <article
      className={
        "rounded-lg border bg-white p-4 " +
        (isFocal
          ? "ring-2 ring-offset-2 ring-offset-background"
          : "border-grid")
      }
      style={
        isFocal
          ? {
              borderColor: accentColor,
              boxShadow: `0 0 0 1px ${accentColor}30`,
            }
          : undefined
      }
    >
      <p
        className="text-[10.5px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: isFocal ? accentColor : "var(--color-muted-foreground)" }}
      >
        {isFocal ? "Focal operator" : `Peer ${roleIndex}`}
      </p>
      <Link
        href={href}
        className="mt-1 inline-block text-[16px] font-semibold leading-[1.2] text-navy transition-colors hover:text-teal"
      >
        {scorecard.pm.name}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StarSummaryChip
          goldCount={goldStars}
          silverCount={silverStars}
          size="md"
        />
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold"
          style={{
            background: quadrant7.soft,
            color: quadrant7.fg,
            borderColor: quadrant7.border,
          }}
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: quadrant7.fg }}
          />
          {quadrant7.label}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">
        Rank #{scorecard.rank.overall} of {scorecard.rank.overallTotal}
      </p>

      <dl className="mt-4 divide-y divide-grid border-t border-grid">
        {metrics.map((m) => (
          <MetricCell
            key={m.key}
            metric={m}
            roleIndex={roleIndex}
            isFocal={isFocal}
          />
        ))}
      </dl>
    </article>
  );
}

function MetricCell({
  metric,
  roleIndex,
  isFocal,
}: {
  metric: MetricRow;
  roleIndex: number;
  isFocal: boolean;
}) {
  const value = metric.values[roleIndex] ?? "—";
  const star = metric.stars[roleIndex];

  // Only the focal column gets tone-driven color. Peers stay neutral
  // navy regardless — the comparison is FROM the focal's perspective,
  // so coloring peers would muddy the read.
  const tone = isFocal ? metric.focalTone : "neutral";
  const valueColor =
    tone === "good"
      ? "#2F7A5C"
      : tone === "bad"
        ? "#D97834"
        : "var(--color-navy)";

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-[11.5px] leading-[1.3] text-muted-foreground">
        {metric.label}
      </dt>
      <dd
        className="dq-mono inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
        style={{ color: valueColor }}
      >
        {star && <StarDot tone={star} />}
        <span>{value}</span>
      </dd>
    </div>
  );
}

function StarDot({ tone }: { tone: "gold" | "silver" }) {
  const fill = tone === "gold" ? "#E5A800" : "#9CA3AF";
  const stroke = tone === "gold" ? "#B98700" : "#6B7280";
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.7l-5.9 3.1 1.13-6.58L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}
