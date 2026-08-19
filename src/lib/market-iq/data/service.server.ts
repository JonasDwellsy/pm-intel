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
    repository: {
      loadPersistedReport: loadLatestMarketIqReportSourceSnapshot,
      storeReport: storeMarketIqReportSourceSnapshot,
    },
  });
});
