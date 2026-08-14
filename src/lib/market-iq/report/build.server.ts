import "server-only";

import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { prisma } from "@/lib/prisma";
import { loadClevelandHistoricalPulse } from "@/lib/market-iq/historical.server";
import { resolveHistoricalAnalysisCutoff } from "@/lib/market-iq/historical";
import { marketIqPrisma } from "@/lib/market-iq/prisma";
import { loadClevelandTrendPulses } from "@/lib/market-iq/trends.server";
import {
  buildMarketIqReportSnapshot,
  parseMarketIqReportSnapshot,
  type MarketIqPortfolioObservation,
  type MarketIqReportSnapshot,
} from "@/lib/market-iq/report/report";
import {
  SEEDED_CLEVELAND_REPORT_TOKEN,
  seededClevelandMarketReport,
} from "@/lib/market-iq/report/seeded-cleveland";

const DECLARED_CLEVELAND_CUTOFF = new Date("2026-07-31T00:00:00.000Z");
const PORTFOLIO_POSTAL_CODES = ["44102", "44103", "44106", "44114", "44115"];

type PortfolioProperty = {
  key: string;
  communityNames: string[];
  addressPrefixes: string[];
};

const CLEVELAND_DEMO_PORTFOLIO: PortfolioProperty[] = [
  { key: "foundry-lofts", communityNames: ["foundrylofts"], addressPrefixes: ["7218euclidave"] },
  { key: "1750-ansel-road", communityNames: ["1750anselrd"], addressPrefixes: ["1750anselrd"] },
  { key: "1250-west-75th", communityNames: ["1250w75thst", "rlbpl"], addressPrefixes: ["1250w75thst"] },
  { key: "2000-east-9th", communityNames: ["2000e9thst"], addressPrefixes: ["2000e9thst"] },
  { key: "1120-chester", communityNames: ["1120chesterave"], addressPrefixes: ["1120chesterave"] },
];

const SUBMARKET_BY_POSTAL_CODE: Record<string, string> = {
  "44102": "West Cleveland",
  "44103": "Midtown / University",
  "44106": "Midtown / University",
  "44114": "Downtown",
  "44115": "Downtown",
};

function normalized(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function portfolioPropertyFor(communityName: string | null, address: string | null) {
  const community = normalized(communityName);
  const normalizedAddress = normalized(address);
  return CLEVELAND_DEMO_PORTFOLIO.find((property) =>
    property.communityNames.includes(community) ||
    property.addressPrefixes.some((prefix) => normalizedAddress.startsWith(prefix))
  ) ?? null;
}

function externalPropertyKey(communityName: string | null, address: string | null) {
  const community = normalized(communityName);
  if (community) return `community:${community}`;
  const streetAddress = (address ?? "").split(",")[0];
  return `address:${normalized(streetAddress)}`;
}

function observedUnitKey(rawData: string, fallback: string) {
  try {
    const parsed = JSON.parse(rawData) as Record<string, unknown>;
    const addressId = parsed.dwellsy_address_id;
    if (typeof addressId === "string" || typeof addressId === "number") return String(addressId);
  } catch {
    // A malformed source payload still represents one observed listing.
  }
  return fallback;
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
    throw new Error("Market IQ has no completed Cleveland historical import.");
  }

  const metadataCutoff = resolveHistoricalAnalysisCutoff(dataImport.availableThrough, dataImport.metadata);
  const periodEnd = new Date(Math.min(metadataCutoff.getTime(), DECLARED_CLEVELAND_CUTOFF.getTime()));
  const periodStart = new Date(periodEnd);
  periodStart.setUTCFullYear(periodStart.getUTCFullYear() - 1);
  periodStart.setUTCDate(periodStart.getUTCDate() + 1);
  const cutoffEnd = new Date(periodEnd.getTime() + 86_400_000 - 1);

  const listings = await marketIqPrisma.marketIqListing.findMany({
    where: {
      importId: dataImport.id,
      propertyType: "apartment",
      postalCode: { in: PORTFOLIO_POSTAL_CODES },
      activatedAt: { gte: periodStart, lte: cutoffEnd },
      askingRent: { gt: 0 },
      bedrooms: { in: [0, 1, 2] },
    },
    select: {
      sourceRecordId: true,
      address: true,
      postalCode: true,
      askingRent: true,
      bedrooms: true,
      communityName: true,
      rawData: true,
    },
  });

  const observations: MarketIqPortfolioObservation[] = listings.flatMap((listing) => {
    const postalCode = listing.postalCode ?? "";
    const submarket = SUBMARKET_BY_POSTAL_CODE[postalCode];
    const bedroomCount = listing.bedrooms;
    const askingRent = listing.askingRent;
    if (!submarket || bedroomCount === null || askingRent === null || !Number.isInteger(bedroomCount)) return [];
    const portfolioProperty = portfolioPropertyFor(listing.communityName, listing.address);
    return [{
      id: listing.sourceRecordId,
      propertyKey: portfolioProperty?.key ?? externalPropertyKey(listing.communityName, listing.address),
      propertyType: "apartment" as const,
      bedrooms: bedroomCount,
      postalCode,
      submarket,
      askingRent,
      inPortfolio: Boolean(portfolioProperty),
    }];
  });

  const portfolioObservations = observations.filter((item) => item.inPortfolio);
  const observedUnits = new Set(listings.flatMap((listing) => {
    if (!portfolioPropertyFor(listing.communityName, listing.address)) return [];
    return [observedUnitKey(listing.rawData, listing.sourceRecordId)];
  })).size;
  const observedProperties = new Set(portfolioObservations.map((item) => item.propertyKey));
  if (observedProperties.size !== CLEVELAND_DEMO_PORTFOLIO.length) {
    throw new Error(`The Cleveland seed resolved ${observedProperties.size} of ${CLEVELAND_DEMO_PORTFOLIO.length} portfolio communities.`);
  }

  const [historicalPulse, trendPulses] = await Promise.all([
    loadClevelandHistoricalPulse(),
    loadClevelandTrendPulses().catch(() => []),
  ]);
  const msaTrend = trendPulses.find((pulse) => pulse.trendSource.geographyType === "msa") ?? null;
  const relevantTrendSegments = msaTrend?.segments.filter((segment) =>
    segment.label === "1-bed apartment" || segment.label === "2-bed apartment"
  ) ?? [];
  const changeDirection = historicalPulse.historical.newListingsChange >= 0 ? "expanded" : "contracted";

  return buildMarketIqReportSnapshot({
    generatedAt: input?.generatedAt ?? new Date(),
    brand: input?.brand ?? seededClevelandMarketReport.brand,
    scope: {
      marketId: CLEVELAND_MARKET_ID,
      marketName: "Cleveland–Elyria, OH",
      portfolioLabel: "Cleveland Managed Portfolio",
      propertyCount: observedProperties.size,
      observedUnits,
      observedListings: portfolioObservations.length,
      submarkets: [...new Set(portfolioObservations.map((item) => item.submarket))].sort(),
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      seededExample: true,
    },
    observations,
    marketConditions: {
      heading: `Competitive supply ${changeDirection} into the July cutoff`,
      narrative: msaTrend
        ? `${historicalPulse.decisionRead} ${msaTrend.signal.narrative}`
        : historicalPulse.decisionRead,
      trendSegments: relevantTrendSegments,
      historical: historicalPulse.historical,
    },
    sources: [
      {
        name: historicalPulse.historicalSource.name,
        availableThrough: historicalPulse.historicalSource.availableThrough,
        observationCount: dataImport.recordCount,
        note: "Portfolio and external market samples use listing activity observed during the trailing 12 months.",
      },
      ...(msaTrend ? [{
        name: msaTrend.trendSource.name,
        availableThrough: msaTrend.trendSource.availableThrough,
        observationCount: relevantTrendSegments.reduce((sum, segment) => sum + segment.observations, 0),
        note: "Authoritative asking-rent trends for the Cleveland MSA, limited to the portfolio's apartment bedroom segments.",
      }] : []),
    ],
  });
}

export async function loadPublicMarketIqReport(publicToken: string): Promise<MarketIqReportSnapshot | null> {
  const stored = await prisma.marketIqReport.findUnique({
    where: { publicToken },
    select: { status: true, snapshot: true },
  }).catch(() => null);
  if (stored?.status === "published") return parseMarketIqReportSnapshot(stored.snapshot);

  const previewEnabled = process.env.MARKET_IQ_PREVIEW_ENABLED === "1" || process.env.NODE_ENV !== "production";
  if (previewEnabled && publicToken === SEEDED_CLEVELAND_REPORT_TOKEN) return seededClevelandMarketReport;
  return null;
}
