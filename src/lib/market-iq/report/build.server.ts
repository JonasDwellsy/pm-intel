import "server-only";

import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { prisma } from "@/lib/prisma";
import { loadClevelandHistoricalPulse } from "@/lib/market-iq/historical.server";
import { resolveHistoricalAnalysisCutoff } from "@/lib/market-iq/historical";
import { marketIqPrisma } from "@/lib/market-iq/prisma";
import {
  buildMarketIqReportSnapshot,
  isPublicMarketIqReportStatus,
  marketCellKey,
  parseMarketIqReportSnapshot,
  type MarketIqMarketObservation,
  type MarketIqPropertyType,
  type MarketIqReportSnapshot,
  type MarketIqTrajectory,
} from "@/lib/market-iq/report/report";
import {
  SEEDED_CLEVELAND_REPORT_TOKEN,
  seededClevelandMarketReport,
} from "@/lib/market-iq/report/seeded-cleveland";

const DECLARED_CLEVELAND_CUTOFF = new Date("2026-07-31T00:00:00.000Z");
const REPORT_CITIES = ["Cleveland", "Lakewood", "Euclid"];
const REPORT_PROPERTY_TYPES = ["apartment", "house"] as const;
const REPORT_BEDROOMS = [1, 2, 3];

function normalized(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function propertyKey(communityName: string | null, address: string | null) {
  const community = normalized(communityName);
  if (community) return `community:${community}`;
  return `address:${normalized((address ?? "").split(",")[0])}`;
}

function cityLabel(value: string) {
  return value.replace(/, OH$/, "");
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

function trajectoryMapFromImports(imports: TrendImport[]) {
  const trajectories = new Map<string, MarketIqTrajectory>();
  const seenGeographies = new Set<string>();
  for (const dataImport of imports) {
    const first = dataImport.trendObservations[0];
    if (!first) continue;
    const geographyKey = `${first.geographyType}:${first.geographyValue}`;
    if (seenGeographies.has(geographyKey)) continue;
    seenGeographies.add(geographyKey);
    if (first.geographyType !== "city") continue;
    const submarket = cityLabel(first.geographyValue);
    if (!REPORT_CITIES.includes(submarket)) continue;
    const latestBySegment = new Map<string, typeof first>();
    for (const point of dataImport.trendObservations) {
      const propertyType = point.propertyType.toLowerCase() as MarketIqPropertyType;
      if (!REPORT_PROPERTY_TYPES.includes(propertyType) || !REPORT_BEDROOMS.includes(point.bedrooms)) continue;
      const key = marketCellKey(submarket, propertyType, point.bedrooms);
      const current = latestBySegment.get(key);
      if (!current || point.month > current.month) latestBySegment.set(key, point);
    }
    for (const [key, point] of latestBySegment) {
      if (point.yearOverYearPct === null) continue;
      trajectories.set(key, {
        rent: point.askingRent,
        yearOverYearPct: point.yearOverYearPct,
        observations: point.observations,
        month: point.month.toISOString().slice(0, 10),
      });
    }
  }
  return trajectories;
}

export async function buildClevelandMarketIqReportSnapshot(input?: {
  generatedAt?: Date;
  brand?: MarketIqReportSnapshot["brand"];
}) {
  const dataImport = await marketIqPrisma.marketIqDataImport.findFirst({
    where: {
      marketId: CLEVELAND_MARKET_ID,
      sourceKind: "historical_export",
      status: "complete",
    },
    orderBy: { importedAt: "desc" },
    select: { id: true, availableThrough: true, recordCount: true, metadata: true },
  });
  if (!dataImport?.availableThrough) {
    throw new Error("Market IQ has no completed Cleveland Total IQ import.");
  }

  const metadataCutoff = resolveHistoricalAnalysisCutoff(dataImport.availableThrough, dataImport.metadata);
  const periodEnd = new Date(Math.min(metadataCutoff.getTime(), DECLARED_CLEVELAND_CUTOFF.getTime()));
  const periodStart = new Date(periodEnd);
  periodStart.setUTCFullYear(periodStart.getUTCFullYear() - 1);
  periodStart.setUTCDate(periodStart.getUTCDate() + 1);
  const cutoffEnd = new Date(periodEnd.getTime() + 86_400_000 - 1);

  const [listings, historicalPulse, trendImports] = await Promise.all([
    marketIqPrisma.marketIqListing.findMany({
      where: {
        importId: dataImport.id,
        propertyType: { in: [...REPORT_PROPERTY_TYPES] },
        city: { in: REPORT_CITIES },
        activatedAt: { gte: periodStart, lte: cutoffEnd },
        askingRent: { gt: 0 },
        bedrooms: { in: REPORT_BEDROOMS },
      },
      select: {
        sourceRecordId: true,
        address: true,
        city: true,
        postalCode: true,
        askingRent: true,
        squareFeet: true,
        bedrooms: true,
        propertyType: true,
        communityName: true,
      },
    }),
    loadClevelandHistoricalPulse(),
    marketIqPrisma.marketIqDataImport.findMany({
      where: { marketId: CLEVELAND_MARKET_ID, sourceKind: "trends", status: "complete" },
      orderBy: { importedAt: "desc" },
      include: { trendObservations: { orderBy: { month: "desc" } } },
    }),
  ]);

  const observations: MarketIqMarketObservation[] = listings.flatMap((listing) => {
    const city = listing.city ?? "";
    const bedrooms = listing.bedrooms;
    const askingRent = listing.askingRent;
    const propertyType = listing.propertyType as MarketIqPropertyType;
    if (
      !REPORT_CITIES.includes(city) ||
      bedrooms === null ||
      !Number.isInteger(bedrooms) ||
      askingRent === null ||
      !REPORT_PROPERTY_TYPES.includes(propertyType)
    ) return [];
    return [{
      id: listing.sourceRecordId,
      propertyKey: propertyKey(listing.communityName, listing.address),
      propertyType,
      bedrooms,
      city,
      postalCode: listing.postalCode ?? "",
      submarket: city,
      askingRent,
      squareFeet: listing.squareFeet && listing.squareFeet > 0 ? listing.squareFeet : null,
    }];
  });
  const trajectories = trajectoryMapFromImports(trendImports);
  const trendObservationCount = [...trajectories.values()].reduce((sum, item) => sum + item.observations, 0);
  const trendAvailableThrough = [...trajectories.values()]
    .map((item) => item.month)
    .sort()
    .at(-1) ?? periodEnd.toISOString().slice(0, 10);
  const changeDirection = historicalPulse.historical.newListingsChange >= 0 ? "increased" : "decreased";

  return buildMarketIqReportSnapshot({
    generatedAt: input?.generatedAt ?? new Date(),
    brand: input?.brand ?? seededClevelandMarketReport.brand,
    scope: {
      marketId: CLEVELAND_MARKET_ID,
      marketName: "Cleveland-Elyria, OH",
      submarkets: REPORT_CITIES,
      segments: ["Apartments by bedroom", "Houses by bedroom"],
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      totalObservedListings: observations.length,
      seededExample: true,
    },
    observations,
    trajectories,
    unavailableCuts: [{
      label: "Small multifamily versus large multifamily",
      reason: "Not published because community-size fields conflict for known Cleveland communities. Apartments remain grouped by bedroom until community identity is corrected.",
    }],
    marketConditions: {
      heading: `New listing supply ${changeDirection} into the July cutoff`,
      narrative: historicalPulse.decisionRead,
      historical: historicalPulse.historical,
    },
    sources: [
      {
        name: "Total IQ observed listings",
        availableThrough: historicalPulse.historicalSource.availableThrough,
        observationCount: dataImport.recordCount,
        note: "Rent levels, rent per square foot, supply, and listing velocity use observed asking listings, not modeled estimates.",
      },
      {
        name: "Dwellsy IQ Trends",
        availableThrough: trendAvailableThrough,
        observationCount: trendObservationCount || null,
        note: "Trajectory is published only for city and product segments with sufficient validated Trends depth.",
      },
    ],
  });
}

export async function loadPublicMarketIqReport(publicToken: string): Promise<MarketIqReportSnapshot | null> {
  const stored = await prisma.marketIqReport.findUnique({
    where: { publicToken },
    select: { status: true, snapshot: true },
  }).catch(() => null);
  if (stored && isPublicMarketIqReportStatus(stored.status)) return parseMarketIqReportSnapshot(stored.snapshot);

  const previewEnabled = process.env.MARKET_IQ_PREVIEW_ENABLED === "1" || process.env.NODE_ENV !== "production";
  if (previewEnabled && publicToken === SEEDED_CLEVELAND_REPORT_TOKEN) return seededClevelandMarketReport;
  return null;
}
