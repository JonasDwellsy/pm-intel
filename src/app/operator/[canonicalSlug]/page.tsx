import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtInt } from "@/lib/format";
import {
  listOperatorRouteParams,
  loadOperatorView,
  type OperatorMarketCard,
  type OperatorView,
} from "@/lib/operator-data";
import { STATE_CODE_TO_NAME } from "@/lib/slugify";
import { TrackEvent } from "@/components/analytics/TrackEvent";

// v0.6.4 Patch 1 — cross-market operator profile.
// /operator/<canonicalSlug> renders only for multi-market canonical
// entities (CanonicalOperator.marketCount ≥ 2). Single-market PMs 404
// here; their primary surface is the per-market scorecard.

type RouteParams = { canonicalSlug: string };

export async function generateStaticParams(): Promise<RouteParams[]> {
  return listOperatorRouteParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { canonicalSlug } = await params;
  const view = await loadOperatorView(canonicalSlug);
  if (!view) return { title: "Operator not found" };
  const stateNames = view.stateCodes.map(stateDisplay).join(", ");
  return {
    title: `${view.canonicalName} — Cross-market operator`,
    description: `${view.canonicalName} operates in ${view.marketCount} Dwellsy IQ covered markets across ${stateNames}. ${view.aggregateStats.totalT12Listings.toLocaleString("en-US")} total listings T12.`,
    alternates: { canonical: `/operator/${canonicalSlug}` },
    openGraph: {
      title: `${view.canonicalName} — Cross-market operator`,
      description: `Operates in ${view.marketCount} markets across ${stateNames}.`,
      type: "website",
    },
  };
}

function stateDisplay(stateCode: string): string {
  const slug = STATE_CODE_TO_NAME[stateCode.toUpperCase()];
  if (!slug) return stateCode;
  return slug
    .split("-")
    .map((w) => (w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// Auto-generated cross-market summary. Names the strongest-presence
// market by T12 listings + modal classification across markets. Falls
// back to a generic framing if the view is unexpectedly thin (defensive
// — every v0.6.4 canonical entity carries at least 2 PMs).
function buildCrossMarketSummary(view: OperatorView): string {
  if (view.marketCards.length === 0) {
    return `${view.canonicalName} operates in ${view.marketCount} of our covered markets.`;
  }
  const top = view.marketCards[0];
  const stateNames = view.stateCodes.map(stateDisplay).join(", ");
  const pieces: string[] = [];
  pieces.push(
    `${view.canonicalName} operates in ${view.marketCount} of our 7 covered markets, across ${stateNames}.`
  );
  pieces.push(
    `Strongest presence in ${top.marketCity} (${fmtInt(top.t12Listings)} listings T12).`
  );
  if (view.modalClassification) {
    pieces.push(
      `Most commonly classified as ${view.modalClassification} across markets.`
    );
  }
  return pieces.join(" ");
}

function StarChip({
  goldCount,
  silverCount,
}: {
  goldCount: number;
  silverCount: number;
}) {
  if (goldCount === 0 && silverCount === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-grid bg-white px-2 py-0.5 text-[11.5px] font-semibold text-navy">
      {goldCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <StarGlyph tone="gold" />
          <span className="dq-mono">{goldCount}</span>
        </span>
      )}
      {silverCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <StarGlyph tone="silver" />
          <span className="dq-mono">{silverCount}</span>
        </span>
      )}
    </span>
  );
}

function StarGlyph({ tone }: { tone: "gold" | "silver" }) {
  const fill = tone === "gold" ? "#E5A800" : "#9CA3AF";
  const stroke = tone === "gold" ? "#B98700" : "#6B7280";
  return (
    <svg
      width="12"
      height="12"
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

function MarketCard({ card }: { card: OperatorMarketCard }) {
  // Share-trajectory eligibility label per Patch 6 — the card
  // surfaces only the status (continuing / newly tracked / new
  // operator); the actual YoY value lives on the per-market scorecard
  // (linked via "View market scorecard →").
  const shareLabel =
    card.shareTrajectoryEligibility === "continuing"
      ? "Continuing operator"
      : card.shareTrajectoryEligibility === "new_in_coverage"
        ? "Newly tracked in this market"
        : "New to our coverage";

  return (
    <Link
      href={card.scorecardHref}
      className="group block rounded-lg border border-grid bg-white p-5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgb(15_31_63_/_0.18),_0_2px_6px_rgb(15_31_63_/_0.06)]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[20px] font-semibold leading-tight text-navy tracking-[-0.012em]">
            {card.marketCity}
          </h3>
          <p className="mt-0.5 text-[11.5px] uppercase tracking-[0.1em] text-muted-2">
            {stateDisplay(card.stateCode)}
          </p>
        </div>
        <StarChip
          goldCount={card.goldCount}
          silverCount={card.silverCount}
        />
      </div>
      {card.quadrant7Cell && (
        <p className="mb-3 text-[12px] text-muted-foreground">
          {card.quadrant7Cell}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-2">
            Listings T12
          </p>
          <p className="dq-mono mt-1 text-[18px] font-medium leading-none text-navy">
            {fmtInt(card.t12Listings)}
          </p>
        </div>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-2">
            Share status
          </p>
          <p className="mt-1 text-[12.5px] leading-tight text-muted-foreground">
            {shareLabel}
          </p>
        </div>
      </div>
      <p className="mt-4 text-[13px] font-semibold text-teal group-hover:text-teal-700 group-hover:underline">
        View {card.marketCity} scorecard →
      </p>
    </Link>
  );
}

export default async function OperatorProfilePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { canonicalSlug } = await params;
  const view = await loadOperatorView(canonicalSlug);
  if (!view) notFound();

  const stateNames = view.stateCodes.map(stateDisplay).join(", ");
  const summary = buildCrossMarketSummary(view);

  return (
    <>
      <TrackEvent
        event="operator_profile_view"
        properties={{
          canonicalSlug,
          marketCount: view.marketCount,
        }}
      />
      <div className="border-b border-grid bg-white">
        <nav
          aria-label="Breadcrumb"
          className="mx-auto flex max-w-[1320px] items-center gap-2 px-6 py-3.5 text-[12.5px] text-muted-foreground sm:px-14"
        >
          <Link href="/" className="hover:text-navy">
            Home
          </Link>
          <span className="text-muted-2">›</span>
          <Link href="/property-managers" className="hover:text-navy">
            Property managers
          </Link>
          <span className="text-muted-2">›</span>
          <span className="font-medium text-navy">
            {view.canonicalName}
          </span>
        </nav>
      </div>

      {/* Hero band */}
      <section className="border-b border-grid bg-white">
        <div className="mx-auto max-w-[1320px] px-6 pb-12 pt-14 sm:px-14">
          <p className="dq-eyebrow mb-4">Cross-market operator</p>
          <h1 className="dq-h1">{view.canonicalName}</h1>
          <p className="mt-3 text-[15px] text-muted-foreground">
            Operates in {view.marketCount} markets across {stateNames}
          </p>

          {/* Aggregate tiles — pre-computed sums from the seed's
              canonicalOperators.aggregateStats. v1 keeps these
              intentionally minimal; weighted-median DOM / cross-market
              rent growth aggregates are v0.7 candidates. */}
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <div>
              <p className="dq-eyebrow-muted mb-2">Total T12 listings</p>
              <p className="dq-mono text-[28px] font-medium leading-none tracking-[-0.01em] text-navy">
                {fmtInt(view.aggregateStats.totalT12Listings)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                summed across markets
              </p>
            </div>
            <div>
              <p className="dq-eyebrow-muted mb-2">Markets in coverage</p>
              <p className="dq-mono text-[28px] font-medium leading-none tracking-[-0.01em] text-navy">
                {view.marketCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                of 7 Dwellsy IQ markets
              </p>
            </div>
            <div>
              <p className="dq-eyebrow-muted mb-2">
                Most common classification
              </p>
              <p className="text-[16px] font-semibold leading-tight text-navy">
                {view.modalClassification ?? "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                across markets
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Cross-market summary paragraph */}
      <section className="border-b border-grid bg-[#FAFAF8]">
        <div className="mx-auto max-w-[1320px] px-6 py-10 sm:px-14">
          <p className="max-w-[840px] text-[16px] leading-[1.6] text-foreground/85">
            {summary}
          </p>
        </div>
      </section>

      {/* Market presence grid */}
      <section className="border-b border-grid bg-white">
        <div className="mx-auto max-w-[1320px] px-6 py-14 sm:px-14">
          <header className="mb-6">
            <h2 className="dq-h2">Performance by market</h2>
            <div className="dq-section-rule" />
            <p className="mt-3 max-w-[720px] text-[14px] leading-[1.55] text-muted-foreground">
              {view.canonicalName} surfaces in each market with its own
              scorecard. Star counts shown here are per-market;
              click through for the full methodology + Layer 5 share
              trajectory in that market.
            </p>
          </header>
          <div className="grid gap-5 md:grid-cols-2">
            {view.marketCards.map((card) => (
              <MarketCard key={card.pmSlug} card={card} />
            ))}
          </div>
        </div>
      </section>

      {/* Methodology footnote */}
      <div className="border-t border-grid bg-white">
        <p className="mx-auto max-w-[1320px] px-6 py-6 text-[12.5px] leading-[1.65] text-muted-foreground sm:px-14">
          Canonical operator identity is determined by name normalization
          across markets (v0.6.4 Patch 1). Operators with matching
          normalized names across distinct markets are grouped into a
          single canonical entity. The aggregate stats above are simple
          sums; weighted-median performance metrics across markets are a
          v0.7 candidate.{" "}
          <Link
            href="/methodology#canonical-operator-identity"
            className="font-medium text-teal hover:text-teal-700"
          >
            Read methodology →
          </Link>
        </p>
      </div>
    </>
  );
}
