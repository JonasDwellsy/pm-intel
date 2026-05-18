import type { ScorecardData } from "@/lib/types";
import type { MarketFootprintPill } from "@/lib/cross-market";
import type { Layer3Metric, PeerComparison } from "@/lib/peer-comparison";
import type { LendingSignals as LendingSignalsData } from "@/lib/lending-signals";

import { TrackEvent } from "@/components/analytics/TrackEvent";
import { IdentityHero } from "@/components/scorecard/IdentityHero";
import { SynthesisLayer } from "@/components/scorecard/SynthesisLayer";
import { PerformanceLayer } from "@/components/scorecard/PerformanceLayer";
import { LendingSignals } from "@/components/scorecard/LendingSignals";
import { PaywallCard } from "@/components/scorecard/PaywallCard";
import { CoverageSection } from "@/components/scorecard/CoverageSection";
import { CoverageMap } from "@/components/scorecard/CoverageMap";
import { RentTrajectorySection } from "@/components/scorecard/RentTrajectorySection";
import { WhyThisQuadrantSection } from "@/components/scorecard/WhyThisQuadrantSection";
import { ScorecardSidebar } from "@/components/scorecard/ScorecardSidebar";

// v1.0 scorecard layer order (per Scorecard_Design_Spec_v1.0.md Section 3):
//   Layer 1 — Identity hero (IdentityHero)
//   Layer 2 — Synthesis (SynthesisLayer): exec summary, headline tiles,
//             distinguishing characteristics
//   Layer 3 — Performance dimensions (PerformanceLayer): 4-5 cards each with
//             cohort qualifier + distribution chart + peer comparison table
//   Layer 5 — Portfolio characteristics (CoverageSection + CoverageMap +
//             RentTrajectory + WhyThisQuadrant, all v0.6.1 components
//             pending the Phase F refactor)
//
// Phase D consolidates the v0.6.1 Performance / Tenancy / RentPerformance /
// ListingQuality / CommunityVisibility sections into PerformanceLayer.
export function ScorecardBody({
  scorecard,
  isUnlocked,
  isClaimed,
  marketFootprint,
  peerComparisons,
  lendingSignals,
}: {
  scorecard: ScorecardData;
  isUnlocked: boolean;
  isClaimed: boolean;
  marketFootprint: MarketFootprintPill[];
  peerComparisons: Record<Layer3Metric, PeerComparison | null>;
  lendingSignals: LendingSignalsData;
}) {
  return (
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
              <CoverageSection scorecard={scorecard} />
              <CoverageMap scorecard={scorecard} />
              <RentTrajectorySection scorecard={scorecard} />
              <WhyThisQuadrantSection scorecard={scorecard} />
            </>
          )}
        </article>
        <ScorecardSidebar
          isUnlocked={isUnlocked}
          pmSlug={scorecard.pm.slug}
          hasCommunityVisibility={scorecard.communityVisibility !== null}
        />
      </div>
    </div>
  );
}
