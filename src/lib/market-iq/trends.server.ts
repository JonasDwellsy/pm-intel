import "server-only";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { prisma } from "@/lib/prisma";
import { buildMarketIqTrendPulse } from "@/lib/market-iq/trends";

const CLEVELAND_MSA_CODE = "17460";

export async function loadClevelandTrendPulse() {
  const dataImport = await prisma.marketIqDataImport.findFirst({
    where: { marketId: CLEVELAND_MARKET_ID, sourceKind: "trends", status: "complete" },
    orderBy: { importedAt: "desc" },
    select: { id: true, sourceName: true },
  });
  if (!dataImport) return null;
  const points = await prisma.marketIqTrendObservation.findMany({
    where: {
      importId: dataImport.id,
      geographyType: "msa",
      geographyValue: CLEVELAND_MSA_CODE,
    },
    orderBy: { month: "desc" },
  });
  return buildMarketIqTrendPulse({
    sourceName: dataImport.sourceName,
    geographyType: "msa",
    geographyValue: CLEVELAND_MSA_CODE,
    points,
  });
}
