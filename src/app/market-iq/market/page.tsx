import { notFound, redirect } from "next/navigation";
import { MarketIqIntelligenceWorkspace } from "@/components/market-iq/MarketIqIntelligenceWorkspace";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { loadClevelandLiveListingPulse } from "@/lib/market-iq/live-listings.server";
import { loadCachedClevelandMarketIqReportSnapshot } from "@/lib/market-iq/report/build.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function MarketIqPage() {
  // The flag check intentionally happens before Clerk or Prisma. When the
  // preview is disabled, the route is indistinguishable from a missing page
  // and cannot add database load to the existing Operator IQ application.
  if (!marketIqPreviewEnabled()) notFound();

  const access = await resolveViewerMarketIqAccess();
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");

  if (access.source === "subscription") {
    const { organizationId } = await getActiveOrgContext();
    if (organizationId) {
      const preference = await prisma.marketIqWorkspacePreference.findUnique({ where: { organizationId }, select: { onboardingCompletedAt: true } });
      if (!preference?.onboardingCompletedAt) redirect("/market-iq/get-started");
    }
  }

  const [report, liveListingPulse] = await Promise.all([
    loadCachedClevelandMarketIqReportSnapshot(),
    loadClevelandLiveListingPulse(),
  ]);

  return <MarketIqIntelligenceWorkspace
    report={report}
    listingSync={{
      status: liveListingPulse.status,
      availableThrough: liveListingPulse.sourceAvailableThrough?.toISOString() ?? null,
      activeListings: liveListingPulse.activeListings,
      newEvents: liveListingPulse.newEvents,
      relistedEvents: liveListingPulse.relistedEvents,
      priceChangeEvents: liveListingPulse.priceChangeEvents,
      message: liveListingPulse.message,
    }}
    clientAdvisoryEnabled={access.capabilities.publishClientReports}
  />;
}
