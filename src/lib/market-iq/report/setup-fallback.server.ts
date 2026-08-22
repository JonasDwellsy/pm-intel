import "server-only";

import clevelandZips from "@/data/market-iq/cleveland-msa-zips.json";
import clevelandCenters from "@/data/market-iq/cleveland-zcta-centers.json";
import columbusZips from "@/data/market-iq/columbus-msa-zips.json";
import columbusCenters from "@/data/market-iq/columbus-zcta-centers.json";
import sanFranciscoCities from "@/data/market-iq/san-francisco-msa-cities.json";
import sanFranciscoZips from "@/data/market-iq/san-francisco-msa-zips.json";
import sanFranciscoCenters from "@/data/market-iq/san-francisco-zcta-centers.json";
import sanJoseCities from "@/data/market-iq/san-jose-msa-cities.json";
import sanJoseZips from "@/data/market-iq/san-jose-msa-zips.json";
import sanJoseCenters from "@/data/market-iq/san-jose-zcta-centers.json";
import {
  CLEVELAND_MARKET_ID,
  COLUMBUS_MARKET_ID,
  SAN_FRANCISCO_MARKET_ID,
  SAN_JOSE_MARKET_ID,
  getMarketIqMarket,
} from "@/data/market-iq/markets";
import {
  MARKET_IQ_REPORT_CITIES,
  MARKET_IQ_REPORT_SEGMENTS,
} from "@/lib/market-iq/report/scope";
import {
  buildMarketIqReportSnapshot,
  type MarketIqReportSnapshot,
  type MarketIqTrendSeries,
} from "@/lib/market-iq/report/report";

const COLUMBUS_CITIES = [
  "Columbus", "Dublin", "Gahanna", "Grove City", "Hilliard", "New Albany",
  "Pickerington", "Reynoldsburg", "Upper Arlington", "Westerville", "Worthington",
];

const scopes = {
  [CLEVELAND_MARKET_ID]: { cities: [...MARKET_IQ_REPORT_CITIES], zips: clevelandZips, centers: clevelandCenters },
  [COLUMBUS_MARKET_ID]: { cities: COLUMBUS_CITIES, zips: columbusZips, centers: columbusCenters },
  [SAN_FRANCISCO_MARKET_ID]: { cities: sanFranciscoCities, zips: sanFranciscoZips, centers: sanFranciscoCenters },
  [SAN_JOSE_MARKET_ID]: { cities: sanJoseCities, zips: sanJoseZips, centers: sanJoseCenters },
} as const;

export function buildMarketIqSetupFallbackSnapshot(
  marketId: string,
  brand: MarketIqReportSnapshot["brand"],
): MarketIqReportSnapshot {
  const market = getMarketIqMarket(marketId);
  const scope = scopes[marketId as keyof typeof scopes];
  if (!market || !scope) throw new Error("The selected Market IQ market is not configured.");

  const geographies = [
    { geographyType: "msa" as const, geographyValue: market.id, geographyLabel: market.fullName },
    ...scope.cities.map((city) => ({ geographyType: "city" as const, geographyValue: city, geographyLabel: city })),
    ...scope.zips.map((zip) => ({ geographyType: "zip" as const, geographyValue: zip, geographyLabel: `ZIP ${zip}` })),
  ];
  const trendSeries: MarketIqTrendSeries[] = geographies.flatMap((geography) =>
    MARKET_IQ_REPORT_SEGMENTS.map((segment) => ({
      ...geography,
      propertyType: segment.propertyType,
      bedrooms: segment.bedrooms,
      points: [],
    })),
  );
  const generatedAt = new Date();
  const today = generatedAt.toISOString().slice(0, 10);

  return buildMarketIqReportSnapshot({
    generatedAt,
    brand,
    scope: {
      marketId: market.id,
      marketName: market.fullName,
      cities: [...scope.cities],
      zipCodes: [...scope.zips],
      segments: MARKET_IQ_REPORT_SEGMENTS.map((segment) => segment.label),
      periodStart: today,
      periodEnd: today,
      seededExample: true,
    },
    trendSeries,
    mapCenters: scope.centers,
    marketConditions: {
      heading: "Market setup catalog",
      narrative: "Choose the geographies and product segments that should open by default. Current Trends values load in Market intelligence after setup.",
      historical: null,
    },
    sources: [{
      name: "Dwellsy Trends IQ",
      availableThrough: today,
      observationCount: null,
      note: "Setup uses the market catalog and does not estimate or substitute any rent value.",
    }],
  });
}
