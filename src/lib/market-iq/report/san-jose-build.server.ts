import "server-only";
import { unstable_cache } from "next/cache";

import sanJoseCities from "@/data/market-iq/san-jose-msa-cities.json";
import sanJoseZips from "@/data/market-iq/san-jose-msa-zips.json";
import sanJoseZctaCenters from "@/data/market-iq/san-jose-zcta-centers.json";
import { getMarketIqMarket, SAN_JOSE_MARKET_ID } from "@/data/market-iq/markets";
import { buildLiveMarketIqReportSnapshot } from "@/lib/market-iq/report/market-build.server";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";

const MARKET = getMarketIqMarket(SAN_JOSE_MARKET_ID)!;

export function buildSanJoseMarketIqReportSnapshot(input?: {
  generatedAt?: Date;
  brand?: MarketIqReportSnapshot["brand"];
}) {
  return buildLiveMarketIqReportSnapshot({
    market: MARKET,
    cities: sanJoseCities,
    zips: sanJoseZips,
    zctaCenters: sanJoseZctaCenters,
    generatedAt: input?.generatedAt,
    brand: input?.brand,
  });
}

export const loadCachedSanJoseMarketIqReportSnapshot = unstable_cache(
  () => buildSanJoseMarketIqReportSnapshot(),
  ["market-iq-san-jose-live-snapshot-v5"],
  { revalidate: 900 },
);
