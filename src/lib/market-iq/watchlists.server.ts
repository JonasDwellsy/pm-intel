import "server-only";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { parseJsonArray, type MarketIqWatchlistView } from "@/lib/market-iq/watchlists";

export async function canUseClevelandMarketIq() {
  if (!marketIqPreviewEnabled()) return false;
  if (!(await viewerHasProductAccess("market_iq"))) return false;
  const entitlement = await resolveViewerEntitlement();
  return isMarketEntitled(entitlement, CLEVELAND_MARKET_ID);
}

export function marketIqWatchlistView(row: {
  id: string;
  name: string;
  marketId: string;
  geographyType: string;
  geographyValues: string;
  propertyTypes: string;
  bedroomCounts: string;
  alertsEnabled: boolean;
  alertCadence: string;
  updatedAt: Date;
}): MarketIqWatchlistView {
  return {
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
  };
}
