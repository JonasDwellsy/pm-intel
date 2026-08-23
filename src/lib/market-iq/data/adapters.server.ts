import "server-only";

import {
  CLEVELAND_MARKET_ID,
  COLUMBUS_MARKET_ID,
  SAN_FRANCISCO_MARKET_ID,
  SAN_JOSE_MARKET_ID,
  type MarketIqMarketDefinition,
} from "@/data/market-iq/markets";
import { loadPersistedMarketListingPulse } from "@/lib/market-iq/persisted-listing-supply.server";
import { loadCachedClevelandMarketIqReportSnapshot } from "@/lib/market-iq/report/build.server";
import { loadCachedColumbusMarketIqReportSnapshot } from "@/lib/market-iq/report/columbus-build.server";
import { loadCachedSanFranciscoMarketIqReportSnapshot } from "@/lib/market-iq/report/san-francisco-build.server";
import { loadCachedSanJoseMarketIqReportSnapshot } from "@/lib/market-iq/report/san-jose-build.server";
import type { MarketIqMarketDataAdapter } from "./types";

const reportLoaders = {
  [CLEVELAND_MARKET_ID]: loadCachedClevelandMarketIqReportSnapshot,
  [COLUMBUS_MARKET_ID]: loadCachedColumbusMarketIqReportSnapshot,
  [SAN_FRANCISCO_MARKET_ID]: loadCachedSanFranciscoMarketIqReportSnapshot,
  [SAN_JOSE_MARKET_ID]: loadCachedSanJoseMarketIqReportSnapshot,
} satisfies Record<string, MarketIqMarketDataAdapter["loadReport"]>;

export function getMarketIqMarketDataAdapter(market: MarketIqMarketDefinition): MarketIqMarketDataAdapter {
  const loadReport = reportLoaders[market.id as keyof typeof reportLoaders];
  if (!loadReport) throw new Error(`No Market IQ report adapter is registered for ${market.id}.`);

  return {
    marketId: market.id,
    loadReport,
    loadListingPulse: () => loadPersistedMarketListingPulse({
      marketId: market.id,
      marketName: market.shortLabel,
    }),
  };
}
