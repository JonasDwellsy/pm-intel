import { notFound, redirect } from "next/navigation";
import { MarketIqIntelligenceWorkspace } from "@/components/market-iq/MarketIqIntelligenceWorkspace";
import { MarketIqMarketPreparing } from "@/components/market-iq/MarketIqMarketPreparing";
import { MarketIqMarketSelector } from "@/components/market-iq/MarketIqMarketSelector";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { loadMarketIqMarketData } from "@/lib/market-iq/data/service.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { MARKET_IQ_MARKET_INTELLIGENCE_ROUTES } from "@/lib/market-iq/navigation";
import { resolveActiveMarketIqMarket } from "@/lib/market-iq/markets/selection";
import { loadListingSupplyHistory } from "@/lib/market-iq/listing-supply-history.server";
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

  const [{ organizationId }, query] = await Promise.all([
    getActiveOrgContext(),
    searchParams,
  ]);
  if (!organizationId) {
    const returnTo = query.market
      ? `${MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.overview}?market=${encodeURIComponent(query.market)}`
      : MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.overview;
    redirect(
      `/setup-workspace?from=${encodeURIComponent(returnTo)}`
    );
  }

  const access = await resolveViewerMarketIqAccess();
  if (!access.hasProduct) redirect("/market-iq/subscribe");

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
    if (!preference?.onboardingCompletedAt) {
      const returnTo = `${MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.overview}?market=${encodeURIComponent(activeMarket.id)}`;
      redirect(
        `/market-iq/get-started?market=${encodeURIComponent(activeMarket.id)}&returnTo=${encodeURIComponent(returnTo)}`
      );
    }
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

  const [{ report, listingPulse }, listingSupplyHistory] = await Promise.all([
    loadMarketIqMarketData(activeMarket.id),
    loadListingSupplyHistory({ marketId: activeMarket.id, cbsaCode: activeMarket.cbsaCode }),
  ]);

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
          status: listingPulse.status,
          unavailableReason: listingPulse.unavailableReason,
          attemptedAt: listingPulse.attemptedAt?.toISOString() ?? null,
          availableThrough: listingPulse.sourceAvailableThrough?.toISOString() ?? null,
          activeListings: listingPulse.activeListings,
          apartmentListings: listingPulse.apartmentListings,
          houseListings: listingPulse.houseListings,
          eventCountsAvailable: listingPulse.eventCountsAvailable,
          ageObservedListings: listingPulse.ageObservedListings,
          medianActiveAgeDays: listingPulse.medianActiveAgeDays,
          activeOver30Days: listingPulse.activeOver30Days,
          activeOver30SharePct: listingPulse.activeOver30SharePct,
          activatedLast7Days: listingPulse.activatedLast7Days,
          activatedLast30Days: listingPulse.activatedLast30Days,
          listingAgeBuckets: listingPulse.listingAgeBuckets,
          newEvents: listingPulse.newEvents,
          relistedEvents: listingPulse.relistedEvents,
          priceChangeEvents: listingPulse.priceChangeEvents,
          message: listingPulse.message,
        }}
        listingSupplyHistory={listingSupplyHistory}
        clientAdvisoryEnabled={access.capabilities.publishClientReports}
      />
    </>
  );
}
