import "server-only";

import { cache } from "react";
import { getMarketIqMarket } from "@/data/market-iq/markets";
import {
  loadLatestMarketIqReportSourceSnapshot,
  storeMarketIqReportSourceSnapshot,
} from "@/lib/market-iq/report/source-snapshot.server";
import { getMarketIqMarketDataAdapter } from "./adapters.server";
import { loadMarketIqMarketDataWithDependencies } from "./service";

export const loadMarketIqMarketData = cache(async (marketId: string) => {
  const market = getMarketIqMarket(marketId);
  if (!market) throw new Error(`Unknown Market IQ market: ${marketId}`);

  return loadMarketIqMarketDataWithDependencies({
    market,
    adapter: getMarketIqMarketDataAdapter(market),
    // Interactive product requests read frozen source evidence only. Live
    // cross-network builds are published deliberately through the preview-only
    // source snapshot endpoint before a market is made available.
    refreshReport: false,
    repository: {
      loadPersistedReport: loadLatestMarketIqReportSourceSnapshot,
      storeReport: storeMarketIqReportSourceSnapshot,
    },
  });
});
