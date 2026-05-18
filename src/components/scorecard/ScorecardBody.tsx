import type { ScorecardData } from "@/lib/types";
import type { MarketFootprintPill } from "@/lib/cross-market";

import { TrackEvent } from "@/components/analytics/TrackEvent";
import { IdentityHero } from "@/components/scorecard/IdentityHero";
import { HeadlineMetrics } from "@/components/scorecard/HeadlineMetrics";
import { PaywallCard } from "@/components/scorecard/PaywallCard";
import { CoverageSection } from "@/components/scorecard/CoverageSection";
import { CoverageMap } from "@/components/scorecard/CoverageMap";
import { PerformanceSection } from "@/components/scorecard/PerformanceSection";
import { TenancySection } from "@/components/scorecard/TenancySection";
import { RentTrajectorySection } from "@/components/scorecard/RentTrajectorySection";
import { RentPerformanceSection } from "@/components/scorecard/RentPerformanceSection";
import { ListingQualitySection } from "@/components/scorecard/ListingQualitySection";
import { CommunityVisibilitySection } from "@/components/scorecard/CommunityVisibilitySection";
import { WhyThisQuadrantSection } from "@/components/scorecard/WhyThisQuadrantSection";
import { ScorecardSidebar } from "@/components/scorecard/ScorecardSidebar";

// v0.6.1 scorecard section order (per spec, sections 04-10 + Section 11 page):
//   Headline / Classification (Coverage) / Coverage Map / Performance /
//   Tenancy / Rent Trajectory / Rent Performance / Marketing /
//   Community Visibility (when applicable) / Why This Quadrant
//
// Sections that no longer have v0.6.1 data and are intentionally retired:
//   - Time Context (DOM time series): underlying 5-year per-PM trajectory is
//     not produced under v0.6.1 (rent trajectory replaces it for the only
//     trended metric the methodology still uses).
//   - Pricing Posture (premium/concessions): rent level is explicitly out of
//     the composite in v0.6.1. Rent Performance carries the rent signal that
//     does belong in operator ranking.
export function ScorecardBody({
  scorecard,
  isUnlocked,
  isClaimed,
  marketFootprint,
}: {
  scorecard: ScorecardData;
  isUnlocked: boolean;
  isClaimed: boolean;
  marketFootprint: MarketFootprintPill[];
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
          <HeadlineMetrics scorecard={scorecard} />

          {!isUnlocked ? (
            <PaywallCard scorecard={scorecard} />
          ) : (
            <>
              <CoverageSection scorecard={scorecard} />
              <CoverageMap scorecard={scorecard} />
              <PerformanceSection scorecard={scorecard} />
              <TenancySection scorecard={scorecard} />
              <RentTrajectorySection scorecard={scorecard} />
              <RentPerformanceSection scorecard={scorecard} />
              <ListingQualitySection scorecard={scorecard} />
              <CommunityVisibilitySection scorecard={scorecard} />
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
