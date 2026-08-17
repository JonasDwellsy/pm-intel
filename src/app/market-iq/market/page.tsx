import { notFound, redirect } from "next/navigation";
import { ClevelandPilot } from "@/components/market-iq/ClevelandPilot";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { loadClevelandHistoricalPulse } from "@/lib/market-iq/historical.server";
import { loadClevelandLiveListingPulse } from "@/lib/market-iq/live-listings.server";
import { loadClevelandMarketReadTrendPulses } from "@/lib/market-iq/trends.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

  const [historicalPulse, trendPulses, liveListingPulse] = await Promise.all([
    loadClevelandHistoricalPulse().catch(() => null),
    loadClevelandMarketReadTrendPulses(),
    loadClevelandLiveListingPulse(),
  ]);

  return <ClevelandPilot historicalPulse={historicalPulse} trendPulses={trendPulses} liveListingPulse={liveListingPulse} clientAdvisoryEnabled={access.capabilities.publishClientReports} />;
}
