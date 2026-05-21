import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtInt, fmtPct } from "@/lib/format";
import { loadOperatorScorecard } from "@/lib/operators/lookup";
import { getBuyBox } from "@/lib/buy-box/store";
import { STATE_CODE_TO_NAME } from "@/lib/slugify";

// v0.11 — Operator-level scorecard.
//
// /operators/<canonicalSlug> renders an aggregate view of every
// PM under that canonical entity. Aggregation rules come from
// src/lib/buy-box/aggregate.ts — same module the buy-box results
// rollup uses, so a metric definition only lives in one place.
//
// Resolves for BOTH single- and multi-market canonical entities
// so deep links stay stable if an operator later expands. Single-
// market pages render a one-row breakdown with a small "currently
// active in one market" note in the header.

export const dynamic = "force-dynamic";

interface RouteParams {
  canonicalSlug: string;
}

interface PageProps {
  params: Promise<RouteParams>;
  searchParams: Promise<{ unlocked?: string; fromBuyBox?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { canonicalSlug } = await params;
  const view = await loadOperatorScorecard(canonicalSlug);
  if (!view) return { title: "Operator not found" };
  return {
    title: `${view.canonicalName} — Operator scorecard`,
    description: `${view.canonicalName} operates in ${view.members.length} markets across ${view.stateCodes.length} states.`,
    robots: { index: false, follow: false },
  };
}

export default async function OperatorScorecardPage({
  params,
  searchParams,
}: PageProps) {
  const { canonicalSlug } = await params;
  const { fromBuyBox } = await searchParams;

  const view = await loadOperatorScorecard(canonicalSlug);
  if (!view) notFound();

  // Optional buy-box breadcrumb. Reads the row only when the
  // query param is present so we don't pay the DB hit on every
  // load.
  let buyBoxBreadcrumb: { id: string; name: string } | null = null;
  if (fromBuyBox) {
    const bb = await getBuyBox(fromBuyBox);
    if (bb) buyBoxBreadcrumb = { id: bb.id, name: bb.name };
  }

  const sc = view.aggregated.scorecard;
  const isRollup = view.aggregated.isRollup;
  const memberCount = view.members.length;
  const q7Modal = sc.pm?.quadrant7Cell ?? null;
  const q7IsMixed = view.aggregated.quadrant7CellIsMixed;
  const claimedAny = view.aggregated.claimed;

  // Aggregate stats (sourced from the aggregated scorecard).
  const portfolioPoint = sc.portfolioEstimate?.point ?? null;
  const portfolioLow = sc.portfolioEstimate?.low ?? null;
  const portfolioHigh = sc.portfolioEstimate?.high ?? null;
  const portfolioConfidence = sc.portfolioEstimate?.confidence ?? null;
  const totalUrus = sc.coverage?.urusT12 ?? null;
  const monthsOnPlatform = sc.coverage?.monthsOnPlatform ?? null;

  // Listing trajectory YoY — recomputed from the SUMMED t12/t24
  // counts (aggregate.ts sums these; we derive the percentage here
  // to keep the math visible in the page that uses it).
  const t12Sum = sc.t12ListingsCount ?? null;
  const t24Sum = sc.t24t12ListingsCount ?? null;
  const listingYoY =
    typeof t12Sum === "number" && typeof t24Sum === "number" && t24Sum !== 0
      ? (t12Sum - t24Sum) / t24Sum
      : null;
  const yoyContinuingThreshold = 30;
  const yoyConfidence =
    typeof t12Sum === "number" && typeof t24Sum === "number"
      ? t12Sum >= yoyContinuingThreshold && t24Sum >= yoyContinuingThreshold
        ? "continuing"
        : t24Sum === 0
        ? "null_baseline"
        : "new_in_coverage"
      : "null_baseline";

  // Weighted-avg fields the aggregate module already computed.
  const concessionRate = sc.concessionRate ?? null;
  const rentYoY = sc.rentPerformance?.pmYoyChange ?? null;

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-[1180px] px-6 py-10">
        {/* Breadcrumb */}
        <BreadcrumbLink buyBox={buyBoxBreadcrumb} />

        {/* Header */}
        <header className="mt-4">
          <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
            Operator Scorecard
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.012em] text-navy sm:text-[34px]">
              {view.canonicalName}
            </h1>
            {q7Modal && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-soft px-2.5 py-0.5 text-[12px] font-semibold text-navy">
                {q7Modal}
                {q7IsMixed && (
                  <span
                    title="Member markets disagree — showing the modal value."
                    className="rounded-full bg-orange-soft px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-orange-700"
                  >
                    mixed
                  </span>
                )}
              </span>
            )}
            {isRollup && (
              <span className="dq-pill dq-pill-navy-soft text-[11px]">
                Multi-market · {memberCount}
              </span>
            )}
            {claimedAny && (
              <span className="dq-pill dq-pill-green text-[11px]">
                Claimed
              </span>
            )}
          </div>

          {/* Market chip cluster (rollups only) or single-market note */}
          {isRollup ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {view.members.map((m) => (
                <a
                  key={m.marketId}
                  href={`#market-${m.marketId}`}
                  className="inline-flex items-center rounded-full border border-grid bg-white px-2.5 py-0.5 text-[12px] font-medium text-navy hover:border-teal hover:text-teal-700"
                >
                  {m.cityName}, {m.stateCode}
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[12.5px] text-muted-foreground italic">
              This operator is currently active in one market.
            </p>
          )}

          {view.stateCodes.length > 0 && (
            <p className="mt-3 text-[13.5px] text-foreground/80">
              Operates across{" "}
              <span className="font-medium text-navy">
                {view.stateCodes.map(stateDisplay).join(", ")}
              </span>
              .
            </p>
          )}
        </header>

        {/* Aggregate stats panel */}
        <section className="mt-8 rounded-lg border border-grid bg-white p-6">
          <h2 className="dq-eyebrow text-teal">Aggregate stats</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
            <Stat
              label="Est. portfolio"
              valueNode={
                <>
                  <span className="dq-mono tabular-nums text-[22px] font-semibold text-navy">
                    {fmtInt(portfolioPoint)}
                  </span>
                  {portfolioLow !== null && portfolioHigh !== null && (
                    <span className="ml-1 dq-mono text-[12px] text-muted-foreground tabular-nums">
                      ({fmtInt(portfolioLow)}–{fmtInt(portfolioHigh)})
                    </span>
                  )}
                </>
              }
              sublabel={
                portfolioConfidence
                  ? `${portfolioConfidence} confidence`
                  : undefined
              }
            />
            <Stat
              label="URUs (T12)"
              valueNode={
                <span className="dq-mono tabular-nums text-[22px] font-semibold text-navy">
                  {fmtInt(totalUrus)}
                </span>
              }
              sublabel={isRollup ? "summed across markets" : undefined}
            />
            <Stat
              label="Markets covered"
              valueNode={
                <span className="dq-mono tabular-nums text-[22px] font-semibold text-navy">
                  {memberCount}
                </span>
              }
              sublabel={
                view.stateCodes.length === 1
                  ? `1 state`
                  : `${view.stateCodes.length} states`
              }
            />
            <Stat
              label="Platform tenure"
              valueNode={
                <span className="dq-mono tabular-nums text-[22px] font-semibold text-navy">
                  {monthsOnPlatform !== null ? `${fmtInt(monthsOnPlatform)} mo` : "—"}
                </span>
              }
              sublabel={isRollup ? "longest member market" : undefined}
            />
          </div>
        </section>

        {/* Listing trajectory */}
        <section className="mt-6 rounded-lg border border-grid bg-white p-6">
          <h2 className="dq-eyebrow text-teal">Listing trajectory</h2>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-3">
            <div>
              <p className="text-[11.5px] uppercase tracking-wider text-muted-foreground">
                YoY change
              </p>
              <p className="mt-1 dq-mono tabular-nums">
                <span
                  className={
                    "text-[22px] font-semibold " +
                    (listingYoY === null
                      ? "text-muted-2"
                      : listingYoY > 0.01
                      ? "text-good"
                      : listingYoY < -0.01
                      ? "text-bad"
                      : "text-navy")
                  }
                >
                  {listingYoY === null ? "—" : fmtPct(listingYoY * 100, 1, true)}
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11.5px] uppercase tracking-wider text-muted-foreground">
                Listings (T12)
              </p>
              <p className="mt-1 dq-mono tabular-nums text-[16px] font-semibold text-navy">
                {fmtInt(t12Sum)}
                <span className="ml-2 text-[12px] text-muted-foreground">
                  vs {fmtInt(t24Sum)} prior period
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11.5px] uppercase tracking-wider text-muted-foreground">
                Confidence
              </p>
              <p className="mt-1 text-[13px] text-foreground/80">
                {confidenceLabel(yoyConfidence)}
              </p>
            </div>
          </div>
          {isRollup && (
            <p className="mt-4 text-[12px] text-muted-foreground">
              YoY is computed from the <em>summed</em> listing counts across all
              member markets — not by averaging per-market percentages, which
              would distort the trend.
            </p>
          )}
        </section>

        {/* Concession use */}
        <section className="mt-6 rounded-lg border border-grid bg-white p-6">
          <h2 className="dq-eyebrow text-teal">Concession use</h2>
          <div className="mt-4">
            <p className="dq-mono tabular-nums text-[22px] font-semibold text-navy">
              {concessionRate === null
                ? "—"
                : fmtPct(concessionRate * 100, 1)}
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {isRollup
                ? "Footprint-weighted average of per-market concession rates (weighted by URUs T12)."
                : "Share of T12 listings that mention concessions."}
            </p>
          </div>
        </section>

        {/* Rent performance — only when at least one member has data */}
        {rentYoY !== null && (
          <section className="mt-6 rounded-lg border border-grid bg-white p-6">
            <h2 className="dq-eyebrow text-teal">Rent performance</h2>
            <div className="mt-4">
              <p className="dq-mono tabular-nums">
                <span
                  className={
                    "text-[22px] font-semibold " +
                    (rentYoY > 0.005
                      ? "text-good"
                      : rentYoY < -0.005
                      ? "text-bad"
                      : "text-navy")
                  }
                >
                  {fmtPct(rentYoY * 100, 1, true)}
                </span>
                <span className="ml-2 text-[13px] font-normal text-muted-foreground">
                  YoY
                </span>
              </p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                {isRollup
                  ? "Footprint-weighted YoY rent change across member markets (weighted by URUs T12)."
                  : "Operator's YoY rent change vs cohort."}
              </p>
            </div>
          </section>
        )}

        {/* Per-market breakdown */}
        <section className="mt-8">
          <h2 className="dq-eyebrow text-teal">Per-market breakdown</h2>
          <p className="mt-2 max-w-[60ch] text-[13px] text-foreground/70">
            One row per market the operator appears in. Sorted by URUs T12
            descending. Each row links to the per-market scorecard for the
            deeper view.
          </p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-grid bg-white">
            <table className="dq-table w-full min-w-[900px]">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>7-Cell</th>
                  <th className="text-right">URUs T12</th>
                  <th className="text-right">Est. Portfolio</th>
                  <th className="text-right">Concession</th>
                  <th className="text-right">Listing YoY</th>
                  <th className="text-right">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {view.members.map((m) => (
                  <tr key={m.marketId} id={`market-${m.marketId}`}>
                    <td>
                      <div className="font-semibold text-navy">
                        {m.cityName}, {m.stateCode}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {m.marketFullName}
                      </div>
                    </td>
                    <td className="text-[12.5px] text-foreground/80">
                      {m.quadrant7Cell ?? <span className="text-muted-2">—</span>}
                    </td>
                    <td className="dq-mono text-right tabular-nums">
                      {fmtInt(m.urusT12)}
                    </td>
                    <td className="text-right">
                      <span className="dq-mono tabular-nums text-navy">
                        {fmtInt(m.portfolioPoint)}
                      </span>
                      {m.portfolioLow !== null && m.portfolioHigh !== null && (
                        <div className="dq-mono text-[10.5px] text-muted-foreground tabular-nums">
                          {fmtInt(m.portfolioLow)}–{fmtInt(m.portfolioHigh)}
                        </div>
                      )}
                    </td>
                    <td className="dq-mono text-right tabular-nums">
                      {m.concessionRate === null
                        ? "—"
                        : fmtPct(m.concessionRate * 100, 1)}
                    </td>
                    <td
                      className={
                        "dq-mono text-right tabular-nums " +
                        (m.listingTrajectoryYoY === null
                          ? "text-muted-2"
                          : m.listingTrajectoryYoY > 0.01
                          ? "text-good"
                          : m.listingTrajectoryYoY < -0.01
                          ? "text-bad"
                          : "text-foreground/80")
                      }
                    >
                      {m.listingTrajectoryYoY === null
                        ? "—"
                        : fmtPct(m.listingTrajectoryYoY * 100, 0, true)}
                    </td>
                    <td className="text-right">
                      <Link
                        href={m.scorecardHref}
                        className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-grid bg-white px-2.5 text-[12px] font-medium text-teal hover:border-teal hover:text-teal-700"
                      >
                        View market →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-10 text-[11px] text-muted-foreground">
          Aggregate stats follow the same rules as the buy-box rollup: sums for
          counts, footprint-weighted averages for rates, modal for categorical
          fields. See methodology for details.
        </p>
      </div>
    </div>
  );
}

// ─── small helpers ─────────────────────────────────────────────

function Stat({
  label,
  valueNode,
  sublabel,
}: {
  label: string;
  valueNode: React.ReactNode;
  sublabel?: string;
}) {
  return (
    <div>
      <p className="text-[11.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 leading-none">{valueNode}</p>
      {sublabel && (
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}

function BreadcrumbLink({
  buyBox,
}: {
  buyBox: { id: string; name: string } | null;
}) {
  if (buyBox) {
    return (
      <Link
        href={`/buy-boxes/${buyBox.id}/results`}
        className="text-[12.5px] font-medium text-teal hover:text-teal-700 hover:underline"
      >
        ← Back to {buyBox.name} results
      </Link>
    );
  }
  return (
    <Link
      href="/buy-boxes"
      className="text-[12.5px] font-medium text-teal hover:text-teal-700 hover:underline"
    >
      ← All buy boxes
    </Link>
  );
}

function stateDisplay(code: string): string {
  const slug = STATE_CODE_TO_NAME[code.toUpperCase()];
  if (!slug) return code;
  return slug
    .split("-")
    .map((w) => (w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function confidenceLabel(c: "continuing" | "new_in_coverage" | "null_baseline"): string {
  switch (c) {
    case "continuing":
      return "Continuing cohort — both periods carry meaningful volume.";
    case "new_in_coverage":
      return "Newly in coverage — prior-period sample is thin; YoY signal is noisy.";
    case "null_baseline":
      return "No prior-period baseline available.";
  }
}
