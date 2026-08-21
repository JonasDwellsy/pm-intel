import "server-only";
import { unstable_cache } from "next/cache";

import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { prisma } from "@/lib/prisma";
import { loadClevelandHistoricalPulse } from "@/lib/market-iq/historical.server";
import { loadDwellsyProductRollupSeries, loadDwellsyTrendSeries } from "@/lib/dwellsy-source/trends.server";
import { mapDwellsyTrendRows } from "@/lib/dwellsy-source/trends";
import { dwellsySourceConfigured } from "@/lib/dwellsy-source/db.server";
import { loadClevelandListingActivityAvailability } from "@/lib/dwellsy-source/listing-events.server";
import { availableMarketIqActivity } from "@/lib/market-iq/listing-events";
import { marketIqDatabaseConfigured, marketIqPrisma } from "@/lib/market-iq/prisma";
import {
  buildCurrentMonthUnavailableCuts,
  buildMarketIqReportSnapshot,
  isPublicMarketIqReportStatus,
  parseMarketIqReportSnapshot,
  trendHistoryQueryStart,
  trendHistoryWindowStart,
  type MarketIqReportSnapshot,
  type MarketIqTrendSeries,
} from "@/lib/market-iq/report/report";
import { CLEVELAND_ZIP_CENTERS } from "@/lib/market-iq/geography/cleveland-zip-centers";
import { MARKET_IQ_REPORT_CITIES, MARKET_IQ_REPORT_ZIPS } from "@/lib/market-iq/report/scope";

const REPORT_CITIES = [...MARKET_IQ_REPORT_CITIES];
const REPORT_ZIPS = [...MARKET_IQ_REPORT_ZIPS];
const REPORT_DETAIL_SEGMENTS = [
  { propertyType: "apartment" as const, bedrooms: 0 },
  { propertyType: "apartment" as const, bedrooms: 1 },
  { propertyType: "apartment" as const, bedrooms: 2 },
  { propertyType: "house" as const, bedrooms: 2 },
  { propertyType: "house" as const, bedrooms: 3 },
  { propertyType: "house" as const, bedrooms: 4 },
];
const REPORT_BEDROOMS = [...new Set(REPORT_DETAIL_SEGMENTS.map((segment) => segment.bedrooms))];

function safeSourceError(error: unknown) {
  if (!error || typeof error !== "object") return { name: "UnknownError", code: null };
  const value = error as { name?: unknown; code?: unknown; message?: unknown; errors?: unknown };
  const nestedCodes = Array.isArray(value.errors)
    ? value.errors.flatMap((nested) => nested && typeof nested === "object" && "code" in nested
        ? [String((nested as { code: unknown }).code)]
        : [])
    : [];
  const messages = [
    typeof value.message === "string" ? value.message : "",
    ...(Array.isArray(value.errors) ? value.errors.flatMap((nested) => nested && typeof nested === "object" && "message" in nested
      ? [String((nested as { message: unknown }).message)]
      : []) : []),
  ].join(" ").toLowerCase();
  const category = messages.includes("returned no rows") ? "empty-detail"
    : messages.includes("returned no 999") ? "empty-rollup"
    : messages.includes("password authentication") || messages.includes("sasl") ? "authentication"
    : messages.includes("permission denied") ? "permission"
    : messages.includes("does not exist") ? "schema"
    : messages.includes("timeout") || messages.includes("timed out") ? "timeout"
    : messages.includes("certificate") || messages.includes("ssl") ? "tls"
    : messages.includes("read-only") ? "read-only-check"
    : messages.includes("enotfound") || messages.includes("getaddrinfo") ? "dns"
    : "unclassified";
  return {
    name: typeof value.name === "string" ? value.name : "Error",
    code: value.code === undefined ? null : String(value.code),
    nestedCodes,
    category,
  };
}

async function loadLiveTrendSource(periodStart: string) {
  const [detail, rollups] = await Promise.all([
    loadDwellsyTrendSeries({
      cities: REPORT_CITIES,
      zipCodes: REPORT_ZIPS,
      periodStart,
      bedrooms: REPORT_BEDROOMS,
    }),
    loadDwellsyProductRollupSeries({ zipCodes: REPORT_ZIPS, periodStart }),
  ]);
  return {
    result: { series: [...rollups.series, ...detail.series] },
    live: true as const,
  };
}

async function loadImportedTrendSource() {
  if (!marketIqDatabaseConfigured()) return null;
  const rows = await marketIqPrisma.marketIqTrendObservation.findMany({
    where: {
      marketId: CLEVELAND_MARKET_ID,
      dataImport: { status: "complete" },
    },
    select: {
      geographyType: true,
      geographyValue: true,
      propertyType: true,
      bedrooms: true,
      month: true,
      observations: true,
      askingRent: true,
      yearOverYearPct: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (!rows.length) return null;

  // Imports are immutable. When a later refresh contains the same market
  // point, retain that latest copy without exposing duplicate months.
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = [
      row.geographyType,
      row.geographyValue,
      row.propertyType,
      row.bedrooms,
      row.month.toISOString().slice(0, 10),
    ].join(":");
    latest.set(key, row);
  }
  const series = mapDwellsyTrendRows([...latest.values()].map((row) => ({
    geography_type: row.geographyType as "msa" | "city" | "zip",
    geography_value: row.geographyValue,
    geography_label: row.geographyType === "zip"
      ? `ZIP ${row.geographyValue}`
      : row.geographyType === "msa"
        ? "Cleveland-Elyria, OH"
        : row.geographyValue.replace(/, OH$/, ""),
    address_type: row.propertyType === "house" ? "House" : "Apartment",
    bedrooms: row.bedrooms,
    month: row.month,
    observations: row.observations,
    rent: row.askingRent,
    year_over_year_pct: row.yearOverYearPct,
  })));
  return series.length ? { result: { series }, live: true as const } : null;
}

function completeTrendSeries(source: MarketIqTrendSeries[]) {
  const result = [...source];
  const existing = new Set(result.map((item) => `${item.geographyType}:${item.geographyValue}:${item.propertyType}:${item.bedrooms}`));
  for (const city of REPORT_CITIES) {
    const geographyValue = `${city}, OH`;
    for (const segment of REPORT_DETAIL_SEGMENTS) {
      const key = `city:${geographyValue}:${segment.propertyType}:${segment.bedrooms}`;
      if (!existing.has(key)) result.push({ geographyType: "city", geographyValue, geographyLabel: city, ...segment, points: [] });
    }
  }
  for (const zip of REPORT_ZIPS) {
    for (const segment of REPORT_DETAIL_SEGMENTS) {
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
  sourceMode?: "prefer_imported" | "live_only";
}) {
  const generatedAt = input?.generatedAt ?? new Date();
  const trendQueryStart = trendHistoryQueryStart(generatedAt);
  const liveDwellsyRuntimeEnabled = dwellsySourceConfigured() && (
    process.env.DWELLSY_LIVE_RUNTIME_ENABLED === "1"
    || process.env.VERCEL_ENV === "preview"
    || !process.env.VERCEL
  );
  if (process.env.VERCEL_ENV === "preview" && !liveDwellsyRuntimeEnabled) {
    console.error("[Market IQ] Read-only Trends runtime is not configured", {
      hasDatabaseUrl: Boolean(process.env.DWELLSY_DATABASE_URL),
      liveRuntimeFlag: process.env.DWELLSY_LIVE_RUNTIME_ENABLED === "1",
    });
  }
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
  const [trendSource, context, marketActivityAvailability] = await Promise.all([
    (input?.sourceMode === "live_only"
      ? Promise.resolve(null)
      : loadImportedTrendSource().catch(() => null)).then((imported) => {
      if (imported) return imported;
      if (!liveDwellsyRuntimeEnabled) {
        throw new Error("The authoritative Dwellsy Trends source is not configured.");
      }
      return loadLiveTrendSource(trendQueryStart);
    }).catch((error) => {
      console.error("[Market IQ] Read-only Trends source unavailable", safeSourceError(error));
      throw error;
    }),
    analyticalContext,
    liveDwellsyRuntimeEnabled
      ? loadClevelandListingActivityAvailability()
      : Promise.resolve({ state: "unavailable" as const, attemptedAt: new Date().toISOString() }),
  ]);
  const trendSeries = completeTrendSeries(trendSource.result.series);
  const reportCities = [...new Set(trendSeries
    .filter((series) => series.geographyType === "city" && series.bedrooms === 999 && series.points.length > 0)
    .map((series) => series.geographyLabel))].sort();
  const reportablePoints = trendSeries.flatMap((series) => series.points);
  const latestTrendMonth = reportablePoints.map((point) => point.month).sort().at(-1);
  if (!latestTrendMonth) throw new Error("Dwellsy Trends returned no Cleveland observations.");
  const trendAvailableThrough = monthEnd(latestTrendMonth);
  const trendWindowStart = trendHistoryWindowStart(latestTrendMonth);
  const historicalPulse = context?.historicalPulse;
  const marketActivity = availableMarketIqActivity(marketActivityAvailability);
  const activityAvailableThrough = marketActivity?.asOf.slice(0, 10);

  return buildMarketIqReportSnapshot({
    generatedAt,
    brand: input?.brand ?? {
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
      marketId: CLEVELAND_MARKET_ID,
      marketName: "Cleveland-Elyria, OH",
      cities: reportCities.length ? reportCities : REPORT_CITIES,
      zipCodes: REPORT_ZIPS,
      segments: ["All apartments", "All houses", "Apartments by bedroom", "Houses by bedroom"],
      periodStart: trendWindowStart,
      periodEnd: trendAvailableThrough,
      seededExample: false,
    },
    trendSeries,
    mapCenters: context ? { ...CLEVELAND_ZIP_CENTERS, ...averageZipCenters(context.coordinateRows) } : CLEVELAND_ZIP_CENTERS,
    unavailableCuts: [
      ...buildCurrentMonthUnavailableCuts({
        trendSeries,
        currentMonth: latestTrendMonth,
        geographies: [
          { geographyType: "msa", geographyValue: "17460", label: "Cleveland-Elyria MSA" },
          { geographyType: "city", geographyValue: "Cleveland, OH", label: "Cleveland city" },
        ],
        segments: REPORT_DETAIL_SEGMENTS,
      }),
      {
        label: "Small multifamily versus large multifamily",
        reason: "Not published because community-size fields conflict for known Cleveland communities. Apartments remain grouped by bedroom until community identity is corrected.",
      },
    ],
    marketConditions: historicalPulse ? {
      heading: historicalPulse.historical.newListingsChange >= 0 ? "New listing supply expanded into the cutoff" : "New listing supply contracted into the cutoff",
      narrative: `${historicalPulse.decisionRead} These are Total IQ listing-activity measures and are kept separate from Trends IQ rent statistics.`,
      historical: historicalPulse.historical,
    } : {
      heading: "Historical listing context is not available",
      narrative: "No historical listing measure is substituted. Trends IQ remains the exclusive source for every published rent level and rent change.",
      historical: null,
    },
    marketActivity: marketActivityAvailability,
    sources: [
      { name: "Dwellsy IQ Trends", availableThrough: trendAvailableThrough, observationCount: null, note: "The exclusive source for every published aggregated rent level and rent change. Overall product summaries use the stored median and an exact prior-year comparison from Trends IQ all-bedroom rows. Every available Trends IQ value is reportable." },
      ...(historicalPulse ? [{ name: "Total IQ observed listings", availableThrough: historicalPulse.historicalSource.availableThrough, observationCount: historicalPulse.historicalSource.recordCount, note: "Used only for listing volume, velocity, days on market, and geographic coverage. It is not used to calculate aggregated prices." }] : []),
      ...(activityAvailableThrough ? [{ name: "Total IQ listing activity feed", availableThrough: activityAvailableThrough, observationCount: marketActivity?.events.length ?? null, note: "Used only for observed daily listing activity, including new listings, asking-rent changes, delistings, and live-age threshold crossings. It is not used to calculate aggregated prices." }] : []),
      { name: "U.S. Census Bureau ZCTAs", availableThrough: "2020-01-01", observationCount: REPORT_ZIPS.length - 1, note: "Provides 101 shaded ZIP Code Tabulation Area boundaries for the 102 active postal ZIPs in the Dwellsy Cleveland-Elyria MSA definition. Postal ZIP 44061 has no Census ZCTA polygon." },
    ],
  });
}

export const loadCachedClevelandMarketIqReportSnapshot = unstable_cache(
  () => buildClevelandMarketIqReportSnapshot(),
  // Bump this key whenever the source adapter or reportability rules change.
  // The callback itself is intentionally small, so relying on its function
  // string would otherwise preserve an obsolete cross-deployment snapshot.
  ["market-iq-cleveland-live-snapshot-v14"],
  { revalidate: 900 },
);

export type PublicMarketIqReportState =
  | { state: "available"; report: MarketIqReportSnapshot }
  | { state: "unavailable" }
  | { state: "not_found" };

export async function loadPublicMarketIqReportState(publicToken: string): Promise<PublicMarketIqReportState> {
  const stored = await prisma.marketIqReport.findUnique({
    where: { publicToken },
    select: { status: true, snapshot: true },
  }).catch(() => null);
  if (!stored || !isPublicMarketIqReportStatus(stored.status)) return { state: "not_found" };
  const report = parseMarketIqReportSnapshot(stored.snapshot);
  return report ? { state: "available", report } : { state: "unavailable" };
}

export async function loadPublicMarketIqReport(publicToken: string): Promise<MarketIqReportSnapshot | null> {
  const result = await loadPublicMarketIqReportState(publicToken);
  return result.state === "available" ? result.report : null;
}
