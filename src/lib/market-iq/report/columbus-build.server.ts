import "server-only";
import { unstable_cache } from "next/cache";

import columbusZctaCenters from "@/data/market-iq/columbus-zcta-centers.json";
import columbusZips from "@/data/market-iq/columbus-msa-zips.json";
import { COLUMBUS_MARKET_ID, getMarketIqMarket } from "@/data/market-iq/markets";
import { buildLiveMarketIqReportSnapshot } from "@/lib/market-iq/report/market-build.server";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";

const MARKET = getMarketIqMarket(COLUMBUS_MARKET_ID)!;

export function buildColumbusMarketIqReportSnapshot(input?: {
  generatedAt?: Date;
  brand?: MarketIqReportSnapshot["brand"];
}) {
  return buildLiveMarketIqReportSnapshot({
    market: MARKET,
    zips: columbusZips,
    zctaCenters: columbusZctaCenters,
    generatedAt: input?.generatedAt,
    brand: input?.brand,
  });
}

export const loadCachedColumbusMarketIqReportSnapshot = unstable_cache(
  () => buildColumbusMarketIqReportSnapshot(),
  ["market-iq-columbus-live-snapshot-v3"],
  { revalidate: 900 },
);
