import "server-only";
import { unstable_cache } from "next/cache";

import sanFranciscoCities from "@/data/market-iq/san-francisco-msa-cities.json";
import sanFranciscoZips from "@/data/market-iq/san-francisco-msa-zips.json";
import sanFranciscoZctaCenters from "@/data/market-iq/san-francisco-zcta-centers.json";
import { getMarketIqMarket, SAN_FRANCISCO_MARKET_ID } from "@/data/market-iq/markets";
import { buildLiveMarketIqReportSnapshot } from "@/lib/market-iq/report/market-build.server";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";

const MARKET = getMarketIqMarket(SAN_FRANCISCO_MARKET_ID)!;

export function buildSanFranciscoMarketIqReportSnapshot(input?: {
  generatedAt?: Date;
  brand?: MarketIqReportSnapshot["brand"];
}) {
  return buildLiveMarketIqReportSnapshot({
    market: MARKET,
    cities: sanFranciscoCities,
    zips: sanFranciscoZips,
    zctaCenters: sanFranciscoZctaCenters,
    generatedAt: input?.generatedAt,
    brand: input?.brand,
  });
}

export const loadCachedSanFranciscoMarketIqReportSnapshot = unstable_cache(
  () => buildSanFranciscoMarketIqReportSnapshot(),
  ["market-iq-san-francisco-live-snapshot-v8"],
  { revalidate: 900 },
);
