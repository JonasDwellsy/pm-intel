import type { ScorecardData } from "@/lib/types";

import { TrackEvent } from "@/components/analytics/TrackEvent";
import { ScorecardHeader } from "@/components/scorecard/ScorecardHeader";
import { HeadlineMetrics } from "@/components/scorecard/HeadlineMetrics";
import { PaywallCard } from "@/components/scorecard/PaywallCard";
import { CoverageSection } from "@/components/scorecard/CoverageSection";
import { CoverageMap } from "@/components/scorecard/CoverageMap";
import { PerformanceSection } from "@/components/scorecard/PerformanceSection";
import { TimeContextSection } from "@/components/scorecard/TimeContextSection";
import { RentTrajectorySection } from "@/components/scorecard/RentTrajectorySection";
import { PricingSection } from "@/components/scorecard/PricingSection";
import { ListingQualitySection } from "@/components/scorecard/ListingQualitySection";
import { CoverageConfidenceSection } from "@/components/scorecard/CoverageConfidenceSection";
import { TenancySection } from "@/components/scorecard/TenancySection";
import { WhyThisQuadrantSection } from "@/components/scorecard/WhyThisQuadrantSection";
import { ScorecardSidebar } from "@/components/scorecard/ScorecardSidebar";

export function ScorecardBody({
  scorecard,
  isUnlocked,
}: {
  scorecard: ScorecardData;
  isUnlocked: boolean;
}) {
  return (
    <div className="mx-auto max-w-[1440px] px-6 sm:px-10">
      <TrackEvent
        event={isUnlocked ? "scorecard_full_view" : "scorecard_preview_view"}
        properties={{
          pmSlug: scorecard.pm.slug,
          marketId: scorecard.market.id,
          rank: scorecard.rank.overall,
        }}
      />
      <div className="grid gap-x-16 gap-y-10 pt-10 pb-16 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="min-w-0 space-y-14">
          <ScorecardHeader scorecard={scorecard} />
          <HeadlineMetrics scorecard={scorecard} />

          {!isUnlocked ? (
            <PaywallCard scorecard={scorecard} />
          ) : (
            <>
              <CoverageSection scorecard={scorecard} />
              <CoverageMap scorecard={scorecard} />
              <PerformanceSection scorecard={scorecard} />
              <TimeContextSection scorecard={scorecard} />
              <RentTrajectorySection scorecard={scorecard} />
              <PricingSection scorecard={scorecard} />
              <ListingQualitySection scorecard={scorecard} />
              <CoverageConfidenceSection scorecard={scorecard} />
              <TenancySection scorecard={scorecard} />
              <WhyThisQuadrantSection scorecard={scorecard} />
            </>
          )}
        </article>
        <ScorecardSidebar isUnlocked={isUnlocked} pmSlug={scorecard.pm.slug} />
      </div>
    </div>
  );
}
