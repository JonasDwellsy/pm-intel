import "server-only";

import {
  CLEVELAND_MARKET_ID,
  COLUMBUS_MARKET_ID,
  SAN_FRANCISCO_MARKET_ID,
  SAN_JOSE_MARKET_ID,
} from "@/data/market-iq/markets";
import { buildClevelandMarketIqReportSnapshot } from "@/lib/market-iq/report/build.server";
import { buildColumbusMarketIqReportSnapshot } from "@/lib/market-iq/report/columbus-build.server";
import { buildSanFranciscoMarketIqReportSnapshot } from "@/lib/market-iq/report/san-francisco-build.server";
import { buildSanJoseMarketIqReportSnapshot } from "@/lib/market-iq/report/san-jose-build.server";

export function buildMarketIqReportSourceSnapshot(marketId: string) {
  if (marketId === CLEVELAND_MARKET_ID) {
    return buildClevelandMarketIqReportSnapshot({ sourceMode: "live_only" });
  }
  if (marketId === COLUMBUS_MARKET_ID) return buildColumbusMarketIqReportSnapshot();
  if (marketId === SAN_FRANCISCO_MARKET_ID) return buildSanFranciscoMarketIqReportSnapshot();
  if (marketId === SAN_JOSE_MARKET_ID) return buildSanJoseMarketIqReportSnapshot();
  throw new Error("The requested Market IQ market has no source snapshot builder.");
}
