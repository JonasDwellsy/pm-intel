import Link from "next/link";
import type { ScorecardData } from "@/lib/types";
import type { MarketFootprintPill } from "@/lib/cross-market";
import type { Layer3Metric, PeerComparison } from "@/lib/peer-comparison";
import type { LendingSignals as LendingSignalsData } from "@/lib/lending-signals";
import type { CohortRentTrajectory } from "@/lib/cohort-rent-trajectory";
import type { ConcessionContext } from "@/lib/concession-context";

import { TrackEvent } from "@/components/analytics/TrackEvent";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { MetricInfoProvider } from "@/components/scorecard/MetricInfoProvider";
import { IdentityHero } from "@/components/scorecard/IdentityHero";
import { SynthesisLayer } from "@/components/scorecard/SynthesisLayer";
import { PerformanceLayer } from "@/components/scorecard/PerformanceLayer";
import { LendingSignals } from "@/components/scorecard/LendingSignals";
import { PortfolioLayer } from "@/components/scorecard/PortfolioLayer";
import type { ShareTrajectoryView } from "@/lib/share-trajectory";
import { MethodologyFooter } from "@/components/scorecard/MethodologyFooter";
import { ScorecardSidebar } from "@/components/scorecard/ScorecardSidebar";

// v1.0 scorecard layer order (per Scorecard_Design_Spec_v1.0.md Section 3):
//   Layer 1 — Identity hero (IdentityHero)
//   Layer 2 — Synthesis (SynthesisLayer)
//   Layer 3 — Performance dimensions (PerformanceLayer)
//   Layer 4 — Lending Signals (LendingSignals)
//   Layer 5 — Portfolio Characteristics (PortfolioLayer)
//   Layer 6 — Methodology footer (MethodologyFooter)
//
// PR #47 retires the paywall. All sections render unconditionally
// for every visitor; the `?unlocked=true` query param is still
// accepted but ignored (kept as a no-op so stale inbound links
// don't 404 or land in an unexpected state). The "Build a buy box
// to find more like this" CTA that lived on the paywall card is
// preserved as a contextual block between Methodology and the end
// of the article.
export function ScorecardBody({
  scorecard,
  isClaimed,
  marketFootprint,
  peerComparisons,
  lendingSignals,
  cohortRentTrajectory,
  shareTrajectory,
  concessionContext,
  compareHref,
  crossMarketOperator = null,
}: {
  scorecard: ScorecardData;
  isClaimed: boolean;
  marketFootprint: MarketFootprintPill[];
  peerComparisons: Record<Layer3Metric, PeerComparison | null>;
  lendingSignals: LendingSignalsData;
  cohortRentTrajectory: CohortRentTrajectory | null;
  /** Resolved compare URL passed through to the sidebar's "Compare with
   *  similar PMs" button. Null when the market has no other ranked
   *  operators (sidebar then hides the button). */
  compareHref: string | null;
  shareTrajectory: ShareTrajectoryView | null;
  concessionContext: ConcessionContext;
  crossMarketOperator?: {
    canonicalSlug: string;
    marketCount: number;
  } | null;
}) {
  return (
    <MetricInfoProvider>
      <div className="mx-auto max-w-[1440px] px-6 sm:px-10">
        <TrackEvent
          event="scorecard_full_view"
          properties={{
            pmSlug: scorecard.pm.slug,
            marketId: scorecard.market.id,
            rank: scorecard.rank.overall,
            methodologyVersion: scorecard.methodologyVersion,
          }}
        />
        <div className="grid gap-x-16 gap-y-10 pt-10 pb-16 lg:grid-cols-[minmax(0,1fr)_280px]">
          <article className="min-w-0 space-y-14">
            {/* v0.11 — contextual link up to the operator-level scorecard
                for multi-market canonical operators. */}
            {crossMarketOperator && crossMarketOperator.marketCount >= 2 && (
              <OperatorScorecardBackLink
                canonicalSlug={crossMarketOperator.canonicalSlug}
                marketCount={crossMarketOperator.marketCount}
                operatorName={scorecard.canonicalOperatorName ?? scorecard.pm.name}
              />
            )}
            <IdentityHero
              scorecard={scorecard}
              isClaimed={isClaimed}
              marketFootprint={marketFootprint}
              crossMarketOperator={crossMarketOperator}
            />
            <SynthesisLayer scorecard={scorecard} />
            <PerformanceLayer
              scorecard={scorecard}
              peerComparisons={peerComparisons}
            />
            <LendingSignals signals={lendingSignals} />
            <PortfolioLayer
              scorecard={scorecard}
              crossMarketPresence={marketFootprint}
              cohortRentTrajectory={cohortRentTrajectory}
              pricingTier={lendingSignals.pricingTier}
              shareTrajectory={shareTrajectory}
              concessionContext={concessionContext}
            />
            <MethodologyFooter scorecard={scorecard} />
            <SimilarOperatorsCta pmSlug={scorecard.pm.slug} />
          </article>
          <ScorecardSidebar
            pmSlug={scorecard.pm.slug}
            compareHref={compareHref}
          />
        </div>
      </div>
    </MetricInfoProvider>
  );
}

/** v0.11 — Up-arrow link to the aggregate operator scorecard from
 *  a per-market scorecard, rendered above IdentityHero when the
 *  canonical operator spans 2+ markets. */
function OperatorScorecardBackLink({
  canonicalSlug,
  marketCount,
  operatorName,
}: {
  canonicalSlug: string;
  marketCount: number;
  operatorName: string;
}) {
  return (
    <Link
      href={`/operators/${encodeURIComponent(canonicalSlug)}`}
      className="inline-flex items-center gap-1.5 self-start rounded-full border border-grid bg-white px-3 py-1 text-[12.5px] font-medium text-teal hover:border-teal hover:text-teal-700"
    >
      <span aria-hidden>←</span>
      View operator-level scorecard for{" "}
      <span className="font-semibold">{operatorName}</span>
      <span className="text-[11px] text-muted-foreground">
        ({marketCount} markets)
      </span>
    </Link>
  );
}

/** PR #47 — the "Build a buy box to find more like this" CTA that
 *  used to live on the now-deleted PaywallCard. Surfaces as a
 *  contextual block at the end of the scorecard. Same TrackedLink
 *  event so the existing analytics keep flowing. */
function SimilarOperatorsCta({ pmSlug }: { pmSlug: string }) {
  return (
    <aside className="rounded-lg border border-grid bg-surface-soft px-6 py-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="dq-eyebrow text-teal">Next step</p>
          <h2 className="mt-1.5 text-[20px] font-semibold leading-snug text-navy">
            Find more operators that match this profile.
          </h2>
          <p className="mt-1.5 max-w-[60ch] text-[13.5px] text-foreground/75">
            Start from a named acquisition thesis or build a custom set of
            criteria. Preview matches and ranked fit scores before saving.
          </p>
        </div>
        <TrackedLink
          event="scorecard_cta_click"
          properties={{ pmSlug, action: "build_buy_box" }}
          href="/buy-boxes/new"
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-navy px-6 text-[14px] font-semibold text-white transition-colors hover:bg-navy-700"
        >
          Build a buy box →
        </TrackedLink>
      </div>
    </aside>
  );
}
