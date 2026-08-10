import { notFound } from "next/navigation";
import { ClevelandPilot } from "@/components/market-iq/ClevelandPilot";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { loadClevelandHistoricalPulse } from "@/lib/market-iq/historical.server";
import { parseJsonArray, type MarketIqWatchlistView } from "@/lib/market-iq/watchlists";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MarketIqPage() {
  // The flag check intentionally happens before Clerk or Prisma. When the
  // preview is disabled, the route is indistinguishable from a missing page
  // and cannot add database load to the existing Operator IQ application.
  if (!marketIqPreviewEnabled()) notFound();

  const hasProduct = await viewerHasProductAccess("market_iq");
  if (!hasProduct) notFound();

  const marketEntitlement = await resolveViewerEntitlement();
  if (!isMarketEntitled(marketEntitlement, CLEVELAND_MARKET_ID)) notFound();

  const [{ organizationId }, historicalPulse] = await Promise.all([
    getActiveOrgContext(),
    loadClevelandHistoricalPulse(),
  ]);
  let initialWatchlists: MarketIqWatchlistView[] = [];
  if (organizationId) {
    const rows = await prisma.marketIqWatchlist.findMany({
      where: { organizationId, marketId: CLEVELAND_MARKET_ID },
      orderBy: { updatedAt: "desc" },
    });
    initialWatchlists = rows.map((row) => ({
      id: row.id,
      name: row.name,
      marketId: row.marketId,
      geographyType: row.geographyType as MarketIqWatchlistView["geographyType"],
      geographyValues: parseJsonArray<string>(row.geographyValues),
      propertyTypes: parseJsonArray<MarketIqWatchlistView["propertyTypes"][number]>(row.propertyTypes),
      bedroomCounts: parseJsonArray<number>(row.bedroomCounts),
      alertsEnabled: row.alertsEnabled,
      alertCadence: row.alertCadence as MarketIqWatchlistView["alertCadence"],
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  return <ClevelandPilot historicalPulse={historicalPulse} initialWatchlists={initialWatchlists} />;
}
