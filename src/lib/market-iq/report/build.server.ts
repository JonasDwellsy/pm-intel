import "server-only";

import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { prisma } from "@/lib/prisma";
import { loadClevelandHistoricalPulse } from "@/lib/market-iq/historical.server";
import { loadDwellsyTrendSeries } from "@/lib/dwellsy-source/trends.server";
import { marketIqPrisma } from "@/lib/market-iq/prisma";
import {
  buildMarketIqReportSnapshot,
  isPublicMarketIqReportStatus,
  parseMarketIqReportSnapshot,
  type MarketIqReportSnapshot,
  type MarketIqTrendSeries,
} from "@/lib/market-iq/report/report";
import {
  SEEDED_CLEVELAND_REPORT_TOKEN,
  seededClevelandMarketReport,
} from "@/lib/market-iq/report/seeded-cleveland";

const REPORT_CITIES = ["Cleveland", "Lakewood", "Euclid"];
const REPORT_ZIPS = ["44102", "44107", "44113", "44114", "44120", "44123"];
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

function averageZipCenters(rows: Array<{ postalCode: string | null; latitude: number | null; longitude: number | null }>) {
  const grouped = new Map<string, Array<{ latitude: number; longitude: number }>>();
  for (const row of rows) {
    if (!row.postalCode || row.latitude === null || row.longitude === null) continue;
    const points = grouped.get(row.postalCode) ?? [];
    points.push({ latitude: row.latitude, longitude: row.longitude });
    grouped.set(row.postalCode, points);
  }
  return Object.fromEntries([...grouped].map(([zip, points]) => [zip, {
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  }]));
}

export async function buildClevelandMarketIqReportSnapshot(input?: {
  generatedAt?: Date;
  brand?: MarketIqReportSnapshot["brand"];
}) {
  const [historicalPulse, dwellsyTrends, coordinateRows] = await Promise.all([
    loadClevelandHistoricalPulse(),
    loadDwellsyTrendSeries({
      cities: REPORT_CITIES,
      zipCodes: REPORT_ZIPS,
      periodStart: "2025-08-01",
      bedrooms: REPORT_BEDROOMS,
    }),
    marketIqPrisma.marketIqListing.findMany({
      where: { marketId: CLEVELAND_MARKET_ID, postalCode: { in: REPORT_ZIPS }, latitude: { not: null }, longitude: { not: null } },
      select: { postalCode: true, latitude: true, longitude: true },
      take: 10_000,
    }),
  ]);
  const trendSeries = completeTrendSeries(dwellsyTrends.series);
  const reportablePoints = trendSeries.flatMap((series) => series.points.filter((point) => point.observations >= 10));
  const latestTrendMonth = reportablePoints.map((point) => point.month).sort().at(-1) ?? historicalPulse.historicalSource.availableThrough;
  const trendAvailableThrough = monthEnd(latestTrendMonth);
  const totalTrendObservations = reportablePoints
    .filter((point) => point.month === latestTrendMonth)
    .reduce((sum, point) => sum + point.observations, 0);
  const historical = historicalPulse.historical;

  return buildMarketIqReportSnapshot({
    generatedAt: input?.generatedAt ?? new Date(),
    brand: input?.brand ?? seededClevelandMarketReport.brand,
    scope: {
      marketId: CLEVELAND_MARKET_ID,
      marketName: "Cleveland-Elyria, OH",
      cities: REPORT_CITIES,
      zipCodes: REPORT_ZIPS,
      segments: ["Apartments by bedroom", "Houses by bedroom"],
      periodStart: "2025-08-01",
      periodEnd: trendAvailableThrough,
      seededExample: false,
    },
    trendSeries,
    mapCenters: averageZipCenters(coordinateRows),
    unavailableCuts: [{
      label: "Small multifamily versus large multifamily",
      reason: "Not published because community-size fields conflict for known Cleveland communities. Apartments remain grouped by bedroom until community identity is corrected.",
    }],
    marketConditions: {
      heading: historicalPulse.historical.newListingsChange >= 0 ? "New listing supply expanded into the cutoff" : "New listing supply contracted into the cutoff",
      narrative: `${historicalPulse.decisionRead} These are Total IQ listing-activity measures and are kept separate from Trends IQ rent statistics.`,
      historical: {
        activeAtCutoff: historical.activeAtCutoff,
        newListings30d: historical.newListings30d,
        newListingsChange: historical.newListingsChange,
        medianDom: historical.medianDom,
      },
    },
    sources: [
      { name: "Dwellsy IQ Trends", availableThrough: trendAvailableThrough, observationCount: totalTrendObservations || null, note: "The exclusive source for every published aggregated rent level and rent change." },
      { name: "Total IQ observed listings", availableThrough: historicalPulse.historicalSource.availableThrough, observationCount: historicalPulse.historicalSource.recordCount, note: "Used only for listing volume, velocity, days on market, and geographic coverage. It is not used to calculate aggregated prices." },
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
