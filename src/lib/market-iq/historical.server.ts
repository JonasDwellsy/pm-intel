import "server-only";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { prisma } from "@/lib/prisma";
import { buildHistoricalListingPulse, historicalWindows, resolveHistoricalAnalysisCutoff } from "@/lib/market-iq/historical";

const CORE_PROPERTY_TYPES = ["apartment", "house"];

export async function loadClevelandHistoricalPulse() {
  const dataImport = await prisma.marketIqDataImport.findFirst({
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

  const analysisCutoff = resolveHistoricalAnalysisCutoff(dataImport.availableThrough, dataImport.metadata);
  const { cutoffEnd, priorStart } = historicalWindows(analysisCutoff);
  const [activeListings, recentListings] = await Promise.all([
    prisma.marketIqListing.findMany({
      where: {
        importId: dataImport.id,
        propertyType: { in: CORE_PROPERTY_TYPES },
        activatedAt: { lte: cutoffEnd },
        OR: [{ deactivatedAt: null }, { deactivatedAt: { gt: cutoffEnd } }],
      },
      select: { city: true, askingRent: true, squareFeet: true, activatedAt: true },
    }),
    prisma.marketIqListing.findMany({
      where: {
        importId: dataImport.id,
        propertyType: { in: CORE_PROPERTY_TYPES },
        activatedAt: { gte: priorStart, lte: cutoffEnd },
      },
      select: { city: true, activatedAt: true },
    }),
  ]);

  return buildHistoricalListingPulse({
    availableThrough: analysisCutoff,
    recordCount: dataImport.recordCount,
    activeListings,
    recentListings,
  });
}
