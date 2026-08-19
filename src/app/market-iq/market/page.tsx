import { notFound, redirect } from "next/navigation";
import { MarketIqIntelligenceWorkspace } from "@/components/market-iq/MarketIqIntelligenceWorkspace";
import { MarketIqMarketPreparing } from "@/components/market-iq/MarketIqMarketPreparing";
import { MarketIqMarketSelector } from "@/components/market-iq/MarketIqMarketSelector";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { loadMarketIqMarketData } from "@/lib/market-iq/data/service.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { resolveActiveMarketIqMarket } from "@/lib/market-iq/markets/selection";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function MarketIqPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string }>;
}) {
  // The flag check intentionally happens before Clerk or Prisma. When the
  // preview is disabled, the route is indistinguishable from a missing page
  // and cannot add database load to the existing Operator IQ application.
  if (!marketIqPreviewEnabled()) notFound();

  const access = await resolveViewerMarketIqAccess();
  if (!access.hasProduct) redirect("/market-iq/subscribe");

  const [{ organizationId }, query] = await Promise.all([getActiveOrgContext(), searchParams]);
  const preference = organizationId
    ? await prisma.marketIqWorkspacePreference.findUnique({
      where: { organizationId },
      select: { onboardingCompletedAt: true, defaultMarketId: true },
    })
    : null;
  const activeMarket = resolveActiveMarketIqMarket({
    requestedMarketId: query.market,
    preferredMarketId: preference?.defaultMarketId,
    entitlement: access.entitlement,
  });
  if (!activeMarket) redirect("/market-iq/subscribe");

  if (access.source === "subscription") {
    if (organizationId && !preference?.onboardingCompletedAt) redirect("/market-iq/get-started");
  }

  const entitledMarkets = listEntitledMarketIqMarkets(access.entitlement);
  if (activeMarket.status !== "live") {
    return (
      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
        <MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} />
        <MarketIqMarketPreparing market={activeMarket} />
      </main>
    );
  }

  const { report, listingPulse: liveListingPulse } = await loadMarketIqMarketData(activeMarket.id);

  if (!report) {
    return (
      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-12">
        <MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} />
        <MarketIqMarketPreparing market={activeMarket} state="source_unavailable" />
      </main>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 pt-8 sm:px-7 lg:px-10 lg:pt-12">
        <MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} />
      </div>
      <MarketIqIntelligenceWorkspace
        report={report}
        market={activeMarket}
        listingSync={{
          status: liveListingPulse.status,
          availableThrough: liveListingPulse.sourceAvailableThrough?.toISOString() ?? null,
          activeListings: liveListingPulse.activeListings,
          apartmentListings: liveListingPulse.apartmentListings,
          houseListings: liveListingPulse.houseListings,
          ageObservedListings: liveListingPulse.ageObservedListings,
          medianActiveAgeDays: liveListingPulse.medianActiveAgeDays,
          activeOver30Days: liveListingPulse.activeOver30Days,
          activeOver30SharePct: liveListingPulse.activeOver30SharePct,
          activatedLast7Days: liveListingPulse.activatedLast7Days,
          activatedLast30Days: liveListingPulse.activatedLast30Days,
          listingAgeBuckets: liveListingPulse.listingAgeBuckets,
          newEvents: liveListingPulse.newEvents,
          relistedEvents: liveListingPulse.relistedEvents,
          priceChangeEvents: liveListingPulse.priceChangeEvents,
          message: liveListingPulse.message,
        }}
        clientAdvisoryEnabled={access.capabilities.publishClientReports}
      />
    </>
  );
}
