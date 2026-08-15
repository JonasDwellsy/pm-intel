import "server-only";

import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { prisma } from "@/lib/prisma";
import { loadClevelandHistoricalPulse } from "@/lib/market-iq/historical.server";
import { loadDwellsyProductRollupSeries, loadDwellsyTrendSeries } from "@/lib/dwellsy-source/trends.server";
import { loadClevelandListingActivity } from "@/lib/dwellsy-source/listing-events.server";
import { marketIqDatabaseConfigured, marketIqPrisma } from "@/lib/market-iq/prisma";
import {
  buildMarketIqReportSnapshot,
  isPublicMarketIqReportStatus,
  parseMarketIqReportSnapshot,
  type MarketIqReportSnapshot,
  type MarketIqTrendSeries,
} from "@/lib/market-iq/report/report";
import {
  SEEDED_CLEVELAND_REPORT_TOKEN,
  CLEVELAND_ZIP_CENTERS,
  SEEDED_CLEVELAND_TREND_SERIES,
  seededClevelandMarketReport,
} from "@/lib/market-iq/report/seeded-cleveland";
import { MARKET_IQ_REPORT_CITIES, MARKET_IQ_REPORT_ZIPS } from "@/lib/market-iq/report/scope";

const REPORT_CITIES = [...MARKET_IQ_REPORT_CITIES];
const REPORT_ZIPS = [...MARKET_IQ_REPORT_ZIPS];
const REPORT_BEDROOMS = [1, 2, 3];

function completeTrendSeries(source: MarketIqTrendSeries[]) {
  const result = [...source];
  const existing = new Set(result.map((item) => `${item.geographyType}:${item.geographyValue}:${item.propertyType}:${item.bedrooms}`));
  for (const city of REPORT_CITIES) {
    const geographyValue = `${city}, OH`;
    for (const segment of [
      { propertyType: "apartment" as const, bedrooms: 1 },
      { propertyType: "apartment" as const, bedrooms: 2 },
      { propertyType: "house" as const, bedrooms: 2 },
      { propertyType: "house" as const, bedrooms: 3 },
    ]) {
      const key = `city:${geographyValue}:${segment.propertyType}:${segment.bedrooms}`;
      if (!existing.has(key)) result.push({ geographyType: "city", geographyValue, geographyLabel: city, ...segment, points: [] });
    }
  }
  for (const zip of REPORT_ZIPS) {
    for (const segment of [
      { propertyType: "apartment" as const, bedrooms: 1 },
      { propertyType: "apartment" as const, bedrooms: 2 },
      { propertyType: "house" as const, bedrooms: 2 },
      { propertyType: "house" as const, bedrooms: 3 },
    ]) {
      const key = `zip:${zip}:${segment.propertyType}:${segment.bedrooms}`;
      if (!existing.has(key)) result.push({ geographyType: "zip", geographyValue: zip, geographyLabel: `ZIP ${zip}`, ...segment, points: [] });
    }
  }
  return result;
}

function monthEnd(month: string) {
  const value = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

function averageZipCenters(rows: Array<{ postalCode: string | null; latitude: number | null; longitude: number | null; city: string | null }>) {
  const grouped = new Map<string, Array<{ latitude: number; longitude: number; city: string | null }>>();
  for (const row of rows) {
    if (!row.postalCode || row.latitude === null || row.longitude === null) continue;
    const points = grouped.get(row.postalCode) ?? [];
    points.push({ latitude: row.latitude, longitude: row.longitude, city: row.city });
    grouped.set(row.postalCode, points);
  }
  return Object.fromEntries([...grouped].map(([zip, points]) => {
    const cityCounts = points.reduce<Map<string, number>>((counts, point) => {
      if (point.city) counts.set(point.city, (counts.get(point.city) ?? 0) + 1);
      return counts;
    }, new Map());
    const primaryCity = [...cityCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    return [zip, {
      latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
      longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
      primaryCity,
    }];
  }));
}

export async function buildClevelandMarketIqReportSnapshot(input?: {
  generatedAt?: Date;
  brand?: MarketIqReportSnapshot["brand"];
}) {
  const liveDwellsyRuntimeEnabled = process.env.DWELLSY_LIVE_RUNTIME_ENABLED === "1"
    || !process.env.VERCEL;
  const analyticalContext = marketIqDatabaseConfigured()
    ? Promise.all([
        loadClevelandHistoricalPulse(),
        marketIqPrisma.marketIqListing.findMany({
          where: { marketId: CLEVELAND_MARKET_ID, postalCode: { in: REPORT_ZIPS }, latitude: { not: null }, longitude: { not: null } },
          select: { postalCode: true, latitude: true, longitude: true, city: true },
          take: 10_000,
        }),
      ])
        .then(([historicalPulse, coordinateRows]) => ({ historicalPulse, coordinateRows }))
        // A newly created Neon preview branch can have the application schema
        // before the historical export has been loaded. Trends remains the
        // authoritative rent source, so render the market read with its seeded
        // Total IQ context instead of failing the public report.
        .catch(() => null)
    : Promise.resolve(null);
  const [trendSource, context, marketActivity] = await Promise.all([
    liveDwellsyRuntimeEnabled
      ? Promise.all([
          loadDwellsyTrendSeries({
            cities: REPORT_CITIES,
            zipCodes: REPORT_ZIPS,
            periodStart: "2025-04-01",
            bedrooms: REPORT_BEDROOMS,
          }),
          loadDwellsyProductRollupSeries({ zipCodes: REPORT_ZIPS, periodStart: "2025-04-01" }),
        ]).then(([detail, rollups]) => ({ result: { series: [...rollups.series, ...detail.series] }, live: true as const })).catch(() => ({
          result: { series: SEEDED_CLEVELAND_TREND_SERIES },
          live: false as const,
        }))
      : Promise.resolve({ result: { series: SEEDED_CLEVELAND_TREND_SERIES }, live: false as const }),
    analyticalContext,
    liveDwellsyRuntimeEnabled
      ? loadClevelandListingActivity().catch(() => seededClevelandMarketReport.marketActivity)
      : Promise.resolve(seededClevelandMarketReport.marketActivity),
  ]);
  const trendSeries = completeTrendSeries(trendSource.result.series);
  const reportCities = [...new Set(trendSeries
    .filter((series) => series.geographyType === "city" && series.bedrooms === 999 && series.points.length > 0)
    .map((series) => series.geographyLabel))].sort();
  const reportablePoints = trendSeries.flatMap((series) => series.points);
  const historicalSource = seededClevelandMarketReport.sources.find((source) => source.name === "Total IQ observed listings");
  const latestTrendMonth = reportablePoints.map((point) => point.month).sort().at(-1) ?? seededClevelandMarketReport.scope.periodEnd;
  const trendAvailableThrough = monthEnd(latestTrendMonth);
  const historicalPulse = context?.historicalPulse;
  const activityAvailableThrough = marketActivity?.asOf.slice(0, 10);

  return buildMarketIqReportSnapshot({
    generatedAt: input?.generatedAt ?? new Date(),
    brand: input?.brand ?? seededClevelandMarketReport.brand,
    scope: {
      marketId: CLEVELAND_MARKET_ID,
      marketName: "Cleveland-Elyria, OH",
      cities: reportCities.length ? reportCities : REPORT_CITIES,
      zipCodes: REPORT_ZIPS,
      segments: ["All apartments", "All houses", "Apartments by bedroom", "Houses by bedroom"],
      periodStart: "2025-04-01",
      periodEnd: trendAvailableThrough,
      seededExample: false,
    },
    trendSeries,
    mapCenters: context ? { ...CLEVELAND_ZIP_CENTERS, ...averageZipCenters(context.coordinateRows) } : CLEVELAND_ZIP_CENTERS,
    unavailableCuts: [{
      label: "Small multifamily versus large multifamily",
      reason: "Not published because community-size fields conflict for known Cleveland communities. Apartments remain grouped by bedroom until community identity is corrected.",
    }],
    marketConditions: historicalPulse ? {
      heading: historicalPulse.historical.newListingsChange >= 0 ? "New listing supply expanded into the cutoff" : "New listing supply contracted into the cutoff",
      narrative: `${historicalPulse.decisionRead} These are Total IQ listing-activity measures and are kept separate from Trends IQ rent statistics.`,
      historical: historicalPulse.historical,
    } : seededClevelandMarketReport.marketConditions,
    marketActivity,
    sources: [
      { name: "Dwellsy IQ Trends", availableThrough: trendAvailableThrough, observationCount: null, note: trendSource.live
        ? "The exclusive source for every published aggregated rent level and rent change. Overall product summaries use the stored median and an exact prior-year comparison from Trends IQ all-bedroom rows. Every available Trends IQ value is reportable."
        : "The exclusive source for every published aggregated rent level and rent change. This source-dated snapshot uses the stored median and an exact prior-year comparison from Trends IQ all-bedroom rows. Every available Trends IQ value is reportable." },
      historicalPulse
        ? { name: "Total IQ observed listings", availableThrough: historicalPulse.historicalSource.availableThrough, observationCount: historicalPulse.historicalSource.recordCount, note: "Used only for listing volume, velocity, days on market, and geographic coverage. It is not used to calculate aggregated prices." }
        : historicalSource ?? { name: "Total IQ observed listings", availableThrough: "2026-07-31", observationCount: null, note: "Used only for listing activity and geographic context. It is not used to calculate aggregated prices." },
      ...(activityAvailableThrough ? [{ name: "Total IQ listing activity feed", availableThrough: activityAvailableThrough, observationCount: marketActivity?.events.length ?? null, note: "Used only for the recent-listing ticker and source activity counts. It is not used to calculate aggregated prices." }] : []),
      { name: "U.S. Census Bureau ZCTAs", availableThrough: "2020-01-01", observationCount: REPORT_ZIPS.length - 1, note: "Provides 101 shaded ZIP Code Tabulation Area boundaries for the 102 active postal ZIPs in the Dwellsy Cleveland-Elyria MSA definition. Postal ZIP 44061 has no Census ZCTA polygon." },
    ],
  });
}

export async function loadPublicMarketIqReport(publicToken: string): Promise<MarketIqReportSnapshot | null> {
  const stored = await prisma.marketIqReport.findUnique({
    where: { publicToken },
    select: { status: true, snapshot: true },
  }).catch(() => null);
  if (stored && isPublicMarketIqReportStatus(stored.status)) return parseMarketIqReportSnapshot(stored.snapshot);

  const previewEnabled = process.env.MARKET_IQ_PREVIEW_ENABLED === "1"
    || process.env.VERCEL_ENV === "preview"
    || process.env.NODE_ENV !== "production";
  if (previewEnabled && publicToken === SEEDED_CLEVELAND_REPORT_TOKEN) {
    return buildClevelandMarketIqReportSnapshot({ brand: seededClevelandMarketReport.brand });
  }
  return null;
}
