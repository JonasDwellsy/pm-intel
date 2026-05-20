import type { ScorecardData } from "@/lib/types";
import type { MarketFootprintPill } from "@/lib/cross-market";
import type { Layer3Metric, PeerComparison } from "@/lib/peer-comparison";
import type { LendingSignals as LendingSignalsData } from "@/lib/lending-signals";
import type { CohortRentTrajectory } from "@/lib/cohort-rent-trajectory";
import type { ConcessionContext } from "@/lib/concession-context";

import { TrackEvent } from "@/components/analytics/TrackEvent";
import { MetricInfoProvider } from "@/components/scorecard/MetricInfoProvider";
import { IdentityHero } from "@/components/scorecard/IdentityHero";
import { SynthesisLayer } from "@/components/scorecard/SynthesisLayer";
import { PerformanceLayer } from "@/components/scorecard/PerformanceLayer";
import { LendingSignals } from "@/components/scorecard/LendingSignals";
import { PortfolioLayer } from "@/components/scorecard/PortfolioLayer";
import type { ShareTrajectoryView } from "@/lib/share-trajectory";
import { MethodologyFooter } from "@/components/scorecard/MethodologyFooter";
import { PaywallCard } from "@/components/scorecard/PaywallCard";
import { ScorecardSidebar } from "@/components/scorecard/ScorecardSidebar";

// v1.0 scorecard layer order (per Scorecard_Design_Spec_v1.0.md Section 3):
//   Layer 1 — Identity hero (IdentityHero)
//   Layer 2 — Synthesis (SynthesisLayer): exec summary, headline tiles,
//             distinguishing characteristics
//   Layer 3 — Performance dimensions (PerformanceLayer): 4-5 cards each with
//             cohort qualifier + distribution chart + peer comparison table
//   Layer 4 — Lending Signals (LendingSignals): 5-signal underwriting grid
//   Layer 5 — Portfolio Characteristics (PortfolioLayer): coverage map +
//             narrative, geographic spread, cross-market presence, portfolio
//             composition, rent trajectory descriptive, pricing data
//   Layer 6 — Methodology footer (MethodologyFooter): classification
//             rationale, coverage universe table, sample sizes per metric,
//             version stamp, disclaimer, citation suggestion. Plus the
//             interactive "i" icon modal infrastructure (MetricInfoProvider)
//             that wraps the whole tree.
export function ScorecardBody({
  scorecard,
  isUnlocked,
  isClaimed,
  marketFootprint,
  peerComparisons,
  lendingSignals,
  cohortRentTrajectory,
  shareTrajectory,
  concessionContext,
  crossMarketOperator = null,
}: {
  scorecard: ScorecardData;
  isUnlocked: boolean;
  isClaimed: boolean;
  marketFootprint: MarketFootprintPill[];
  peerComparisons: Record<Layer3Metric, PeerComparison | null>;
  lendingSignals: LendingSignalsData;
  cohortRentTrajectory: CohortRentTrajectory | null;
  // v0.6.3 Patch 6 — share-trajectory view passed through to Layer 5F.
  // Null is acceptable (Layer 5 null-guards) but the route handler should
  // always populate it via buildShareTrajectoryView.
  shareTrajectory: ShareTrajectoryView | null;
  // v0.6.4 Patch 2 — concession context for the Layer 5 ConcessionActivity
  // section. Built by buildConcessionContext(scorecard, msaPool) in the
  // route handler. The section's render rules (null vs 0 vs >0) live in
  // the component; this layer just threads the prop through.
  concessionContext: ConcessionContext;
  // v0.6.4 Patch 1 — cross-market context for the Layer 1 badge. Null
  // for single-market operators (no badge rendered); { canonicalSlug,
  // marketCount } when the operator belongs to a multi-market canonical
  // entity. Resolved server-side from the CanonicalOperator table.
  crossMarketOperator?: {
    canonicalSlug: string;
    marketCount: number;
  } | null;
}) {
  return (
    <MetricInfoProvider>
      <div className="mx-auto max-w-[1440px] px-6 sm:px-10">
        <TrackEvent
          event={isUnlocked ? "scorecard_full_view" : "scorecard_preview_view"}
          properties={{
            pmSlug: scorecard.pm.slug,
            marketId: scorecard.market.id,
            rank: scorecard.rank.overall,
            methodologyVersion: scorecard.methodologyVersion,
          }}
        />
        <div className="grid gap-x-16 gap-y-10 pt-10 pb-16 lg:grid-cols-[minmax(0,1fr)_280px]">
          <article className="min-w-0 space-y-14">
            <IdentityHero
              scorecard={scorecard}
              isClaimed={isClaimed}
              marketFootprint={marketFootprint}
              crossMarketOperator={crossMarketOperator}
            />
            <SynthesisLayer scorecard={scorecard} />

            {!isUnlocked ? (
              <PaywallCard scorecard={scorecard} />
            ) : (
              <>
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
              </>
            )}
          </article>
          <ScorecardSidebar
            isUnlocked={isUnlocked}
            pmSlug={scorecard.pm.slug}
          />
        </div>
      </div>
    </MetricInfoProvider>
  );
}
