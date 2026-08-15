import "server-only";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { parseJsonArray, type MarketIqWatchlistView } from "@/lib/market-iq/watchlists";

export async function canUseClevelandMarketIq() {
  if (!marketIqPreviewEnabled()) return false;
  const access = await resolveViewerMarketIqAccess();
  return access.hasProduct && isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID);
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
