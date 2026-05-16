import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { TrackEvent } from "@/components/analytics/TrackEvent";
import { Hero } from "@/components/homepage/Hero";
import { MethodologyPillars } from "@/components/homepage/MethodologyPillars";
import {
  CoveredMarkets,
  type LiveMarket,
} from "@/components/homepage/CoveredMarkets";
import { SampleScorecards } from "@/components/homepage/SampleScorecards";
import { OperatorCTA } from "@/components/homepage/OperatorCTA";
import { InstitutionCTA } from "@/components/homepage/InstitutionCTA";
import { MethodologyFooter } from "@/components/homepage/MethodologyFooter";

export const metadata: Metadata = {
  title: "Dwellsy IQ — Property Manager Intelligence",
  description:
    "Outside-in scorecards on every property manager in the country. Methodology-driven analysis of lease velocity, pricing posture, tenancy, and operator type. Built for institutional diligence.",
  openGraph: {
    title: "Dwellsy IQ — Property Manager Intelligence",
    description:
      "Outside-in scorecards on property managers. Methodology-driven analysis of lease velocity, pricing posture, tenancy, and operator type. Built for institutional diligence.",
    type: "website",
  },
};

export default async function HomePage() {
  // Live markets — derived from the Market table; the homepage only renders
  // those whose underlying data is published.
  const marketRows = await prisma.market.findMany({
    orderBy: { city: "asc" },
    include: {
      pms: {
        select: { dataAsOf: true },
        orderBy: { dataAsOf: "desc" },
        take: 1,
      },
    },
  });

  const liveMarkets: LiveMarket[] = marketRows.map((m) => ({
    id: m.id,
    city: m.city,
    state: m.state,
    fullName: m.fullName,
    operatorCountTotal: m.operatorCountTotal,
    operatorCountEligible: m.operatorCountEligible,
    medianDomT12: m.medianDomT12,
    dataAsOf:
      m.pms[0]?.dataAsOf.toISOString().split("T")[0] ?? "2026-03-05",
  }));

  // Pick an example PM slug for the operator-claim callout (first live PM).
  const samplePm = await prisma.pM.findFirst({
    where: { rankOverall: 1 },
    select: { slug: true },
  });
  const claimSlug = samplePm?.slug ?? "brookside-properties-chattanooga-tn";

  const dataAsOf = liveMarkets[0]?.dataAsOf ?? "2026-03-05";

  return (
    <main className="bg-[#FBFAF6]">
      <TrackEvent
        event="market_page_view"
        properties={{ source: "homepage", page: "home" }}
      />
      <Hero />
      <MethodologyPillars />
      <CoveredMarkets markets={liveMarkets} />
      <SampleScorecards />
      <OperatorCTA samplePmSlug={claimSlug} />
      <InstitutionCTA />
      <MethodologyFooter version="0.3.4" dataAsOf={dataAsOf} />
    </main>
  );
}
