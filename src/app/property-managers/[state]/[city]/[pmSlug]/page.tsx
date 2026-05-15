import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { ScorecardData } from "@/lib/types";

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

type RouteParams = { state: string; city: string; pmSlug: string };
type RouteSearch = { unlocked?: string };

async function loadScorecard(pmSlug: string) {
  const pm = await prisma.pM.findUnique({ where: { slug: pmSlug } });
  if (!pm) return null;
  return JSON.parse(pm.scorecardData) as ScorecardData;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { pmSlug } = await params;
  const scorecard = await loadScorecard(pmSlug);
  if (!scorecard) return { title: "Property manager not found" };
  const title = `${scorecard.pm.name} — Scorecard (${scorecard.market.fullName})`;
  const description = `Independent scorecard for ${scorecard.pm.name}: ${scorecard.pm.quadrant} operator ranked #${scorecard.rank.overall} of ${scorecard.rank.overallTotal} in ${scorecard.market.name}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
  };
}

export default async function ScorecardPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<RouteSearch>;
}) {
  const { pmSlug } = await params;
  const { unlocked } = await searchParams;
  const scorecard = await loadScorecard(pmSlug);
  if (!scorecard) notFound();

  const isUnlocked = unlocked === "true";

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="grid gap-10 lg:grid-cols-[1fr_220px]">
        <main className="space-y-8">
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
        </main>
        <ScorecardSidebar isUnlocked={isUnlocked} pmSlug={scorecard.pm.slug} />
      </div>
    </div>
  );
}
