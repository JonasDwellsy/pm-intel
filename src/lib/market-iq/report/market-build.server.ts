import "server-only";

import type { MarketIqMarketDefinition } from "@/data/market-iq/markets";
import { loadMarketActiveListings } from "@/lib/dwellsy-source/active-listings.server";
import { loadMarketListingActivity } from "@/lib/dwellsy-source/listing-events.server";
import { loadDwellsyProductRollupSeries, loadDwellsyTrendSeries } from "@/lib/dwellsy-source/trends.server";
import {
  buildMarketIqReportSnapshot,
  type MarketIqReportSnapshot,
  type MarketIqTrendSeries,
} from "@/lib/market-iq/report/report";

const PERIOD_START = "2023-08-01";
const DETAIL_BEDROOMS = [0, 1, 2, 3, 4];
const DISPLAY_SEGMENTS = [
  { propertyType: "apartment" as const, bedrooms: 0 },
  { propertyType: "apartment" as const, bedrooms: 1 },
  { propertyType: "apartment" as const, bedrooms: 2 },
  { propertyType: "house" as const, bedrooms: 2 },
  { propertyType: "house" as const, bedrooms: 3 },
  { propertyType: "house" as const, bedrooms: 4 },
];

type ZctaCenter = { latitude: number; longitude: number };

function monthEnd(month: string) {
  const value = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

function completeTrendSeries(source: MarketIqTrendSeries[], cities: readonly string[], zips: readonly string[], stateCode: string) {
  const result = [...source];
  const existing = new Set(result.map((series) => `${series.geographyType}:${series.geographyValue}:${series.propertyType}:${series.bedrooms}`));
  for (const [geographyType, values] of [["city", cities], ["zip", zips]] as const) {
    for (const value of values) {
      const geographyValue = geographyType === "city" ? `${value}, ${stateCode}` : value;
      const geographyLabel = geographyType === "city" ? value : `ZIP ${value}`;
      for (const segment of DISPLAY_SEGMENTS) {
        const key = `${geographyType}:${geographyValue}:${segment.propertyType}:${segment.bedrooms}`;
        if (!existing.has(key)) result.push({ geographyType, geographyValue, geographyLabel, ...segment, points: [] });
      }
    }
  }
  return result;
}

function primaryCities(rows: Awaited<ReturnType<typeof loadMarketActiveListings>>["listings"]) {
  const grouped = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.postalCode || !row.city) continue;
    const cities = grouped.get(row.postalCode) ?? new Map<string, number>();
    cities.set(row.city, (cities.get(row.city) ?? 0) + 1);
    grouped.set(row.postalCode, cities);
  }
  return Object.fromEntries([...grouped].map(([zip, cities]) => [zip, [...cities].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null]));
}

export async function buildLiveMarketIqReportSnapshot(input: {
  market: MarketIqMarketDefinition;
  cities?: readonly string[];
  zips: readonly string[];
  zctaCenters: Record<string, ZctaCenter>;
  generatedAt?: Date;
  brand?: MarketIqReportSnapshot["brand"];
}) {
  const { market } = input;
  const stateCode = market.stateCodes[0];
  if (!stateCode) throw new Error(`${market.fullName} has no configured state code.`);
  const activeSource = await loadMarketActiveListings(market.cbsaCode);
  const activeCities = activeSource.listings.map((listing) => listing.city).filter((city): city is string => Boolean(city));
  const activeZips = activeSource.listings.map((listing) => listing.postalCode).filter((zip): zip is string => Boolean(zip));
  const cities = [...new Set([...(input.cities ?? []), ...activeCities])].sort();
  const zips = [...new Set([...input.zips, ...activeZips])].sort();
  const [detail, rollups, marketActivity] = await Promise.all([
    loadDwellsyTrendSeries({
      cities,
      zipCodes: zips,
      periodStart: PERIOD_START,
      bedrooms: DETAIL_BEDROOMS,
      msaCode: market.cbsaCode,
      msaLabel: market.fullName,
      stateCode,
    }),
    loadDwellsyProductRollupSeries({
      zipCodes: zips,
      periodStart: PERIOD_START,
      msaCode: market.cbsaCode,
      msaLabel: market.fullName,
    }),
    loadMarketListingActivity(market.cbsaCode).catch(() => undefined),
  ]);
  const trendSeries = completeTrendSeries([...rollups.series, ...detail.series], cities, zips, stateCode);
  const latestTrendMonth = trendSeries.flatMap((series) => series.points).map((point) => point.month).sort().at(-1);
  if (!latestTrendMonth) throw new Error(`Dwellsy Trends returned no ${market.shortLabel} observations.`);
  const availableThrough = monthEnd(latestTrendMonth);
  const cityByZip = primaryCities(activeSource.listings);
  const mapCenters = Object.fromEntries(Object.entries(input.zctaCenters).map(([zip, center]) => [zip, {
    ...center,
    primaryCity: cityByZip[zip] ?? null,
  }]));

  return buildMarketIqReportSnapshot({
    generatedAt: input.generatedAt ?? new Date(),
    brand: input.brand ?? {
      displayName: "Market IQ",
      logoUrl: null,
      primaryColor: "#173B57",
      accentColor: "#B96D3A",
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      websiteUrl: null,
    },
    scope: {
      marketId: market.id,
      marketName: market.fullName,
      cities,
      zipCodes: zips,
      segments: ["All apartments", "All houses", "Apartments by bedroom", "Houses by bedroom"],
      periodStart: PERIOD_START,
      periodEnd: availableThrough,
      seededExample: false,
    },
    trendSeries,
    mapCenters,
    marketConditions: {
      heading: "Current listing context is available",
      narrative: `Total IQ supplies current inventory and recent listing activity for ${market.shortLabel}. No other market's historical context is substituted.`,
      historical: null,
    },
    marketActivity,
    sources: [
      {
        name: "Dwellsy IQ Trends",
        availableThrough,
        observationCount: null,
        note: "The exclusive source for every published aggregated rent level and rent change. Every available Trends IQ value is reportable.",
      },
      {
        name: "Total IQ active listings",
        availableThrough: activeSource.sourceAvailableThrough.toISOString().slice(0, 10),
        observationCount: activeSource.listings.length,
        note: "Used for current listing inventory, geography context, and map labels. It is not used to calculate aggregated prices.",
      },
      ...(marketActivity ? [{
        name: "Total IQ listing activity feed",
        availableThrough: marketActivity.asOf.slice(0, 10),
        observationCount: marketActivity.events.length,
        note: "Used for recent listing and confirmed price-change activity only.",
      }] : []),
      {
        name: "U.S. Census Bureau ZCTAs",
        availableThrough: "2020-01-01",
        observationCount: Object.keys(input.zctaCenters).length,
        note: `Provides shaded Census ZCTA boundaries for ${Object.keys(input.zctaCenters).length} ${market.shortLabel}-area ZIPs in the configured Dwellsy market universe.`,
      },
    ],
  });
}
