import "server-only";

import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { prisma } from "@/lib/prisma";
import { loadClevelandHistoricalPulse } from "@/lib/market-iq/historical.server";
import { marketIqPrisma } from "@/lib/market-iq/prisma";
import {
  buildMarketIqReportSnapshot,
  isPublicMarketIqReportStatus,
  parseMarketIqReportSnapshot,
  type MarketIqGeographyType,
  type MarketIqPropertyType,
  type MarketIqReportSnapshot,
  type MarketIqTrendSeries,
} from "@/lib/market-iq/report/report";
import {
  SEEDED_CLEVELAND_REPORT_TOKEN,
  seededClevelandMarketReport,
} from "@/lib/market-iq/report/seeded-cleveland";

const REPORT_CITIES = ["Cleveland", "Lakewood", "Euclid"];
const REPORT_ZIPS = ["44102", "44107", "44113", "44114", "44120", "44123"];
const REPORT_PROPERTY_TYPES = ["apartment", "house"] as const;
const REPORT_BEDROOMS = [1, 2, 3];

function cityLabel(value: string) {
  return value.replace(/, OH$/, "");
}

function geographyLabel(type: MarketIqGeographyType, value: string) {
  if (type === "msa") return "Cleveland-Elyria, OH";
  if (type === "zip") return `ZIP ${value}`;
  return cityLabel(value);
}

type TrendImport = {
  trendObservations: Array<{
    geographyType: string;
    geographyValue: string;
    month: Date;
    propertyType: string;
    bedrooms: number;
    observations: number;
    askingRent: number;
    yearOverYearPct: number | null;
  }>;
};

function trendSeriesFromImports(imports: TrendImport[]) {
  const newestImportByGeography = new Map<string, TrendImport>();
  for (const dataImport of imports) {
    const first = dataImport.trendObservations[0];
    if (!first) continue;
    const geographyType = first.geographyType as MarketIqGeographyType;
    if (!["msa", "city", "zip"].includes(geographyType)) continue;
    const key = `${geographyType}:${first.geographyValue}`;
    if (!newestImportByGeography.has(key)) newestImportByGeography.set(key, dataImport);
  }

  const result: MarketIqTrendSeries[] = [];
  for (const dataImport of newestImportByGeography.values()) {
    const first = dataImport.trendObservations[0];
    if (!first) continue;
    const geographyType = first.geographyType as MarketIqGeographyType;
    const display = geographyLabel(geographyType, first.geographyValue);
    if (geographyType === "city" && !REPORT_CITIES.includes(display)) continue;
    if (geographyType === "zip" && !REPORT_ZIPS.includes(first.geographyValue)) continue;
    const bySegment = new Map<string, typeof dataImport.trendObservations>();
    for (const point of dataImport.trendObservations) {
      const propertyType = point.propertyType.toLowerCase() as MarketIqPropertyType;
      if (!REPORT_PROPERTY_TYPES.includes(propertyType) || !REPORT_BEDROOMS.includes(point.bedrooms)) continue;
      const key = `${propertyType}:${point.bedrooms}`;
      const points = bySegment.get(key) ?? [];
      points.push(point);
      bySegment.set(key, points);
    }
    for (const [segment, points] of bySegment) {
      const [propertyType, bedroom] = segment.split(":") as [MarketIqPropertyType, string];
      result.push({
        geographyType,
        geographyValue: first.geographyValue,
        geographyLabel: display,
        propertyType,
        bedrooms: Number(bedroom),
        points: points.map((point) => ({
          rent: point.askingRent,
          yearOverYearPct: point.yearOverYearPct,
          observations: point.observations,
          month: point.month.toISOString().slice(0, 10),
        })),
      });
    }
  }

  const existing = new Set(result.map((item) => `${item.geographyType}:${item.geographyValue}:${item.propertyType}:${item.bedrooms}`));
  for (const zip of REPORT_ZIPS) {
    for (const segment of [{ propertyType: "apartment" as const, bedrooms: 1 }, { propertyType: "house" as const, bedrooms: 3 }]) {
      const key = `zip:${zip}:${segment.propertyType}:${segment.bedrooms}`;
      if (!existing.has(key)) result.push({ geographyType: "zip", geographyValue: zip, geographyLabel: `ZIP ${zip}`, ...segment, points: [] });
    }
  }
  return result;
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
  const [historicalPulse, trendImports, coordinateRows] = await Promise.all([
    loadClevelandHistoricalPulse(),
    marketIqPrisma.marketIqDataImport.findMany({
      where: { marketId: CLEVELAND_MARKET_ID, sourceKind: "trends", status: "complete" },
      orderBy: { importedAt: "desc" },
      include: { trendObservations: { orderBy: { month: "asc" } } },
    }),
    marketIqPrisma.marketIqListing.findMany({
      where: { marketId: CLEVELAND_MARKET_ID, postalCode: { in: REPORT_ZIPS }, latitude: { not: null }, longitude: { not: null } },
      select: { postalCode: true, latitude: true, longitude: true },
      take: 10_000,
    }),
  ]);
  const trendSeries = trendSeriesFromImports(trendImports);
  const reportablePoints = trendSeries.flatMap((series) => series.points.filter((point) => point.observations >= 10));
  const trendAvailableThrough = reportablePoints.map((point) => point.month).sort().at(-1) ?? historicalPulse.historicalSource.availableThrough;
  const totalTrendObservations = reportablePoints
    .filter((point) => point.month === trendAvailableThrough)
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
  if (previewEnabled && publicToken === SEEDED_CLEVELAND_REPORT_TOKEN) return seededClevelandMarketReport;
  return null;
}
