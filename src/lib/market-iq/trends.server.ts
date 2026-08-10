import "server-only";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { prisma } from "@/lib/prisma";
import { buildMarketIqTrendPulse, type MarketIqTrendPulse } from "@/lib/market-iq/trends";

function displayLabel(type: string, value: string) {
  if (type === "msa") return "Cleveland–Elyria, OH";
  if (type === "zip") return `ZIP ${value}`;
  return value.replace(/, OH$/, "");
}

export async function loadClevelandTrendPulses() {
  const imports = await prisma.marketIqDataImport.findMany({
    where: { marketId: CLEVELAND_MARKET_ID, sourceKind: "trends", status: "complete" },
    orderBy: { importedAt: "desc" },
    include: { trendObservations: { orderBy: { month: "desc" } } },
  });
  const seen = new Set<string>();
  const pulses: MarketIqTrendPulse[] = [];
  for (const dataImport of imports) {
    const first = dataImport.trendObservations[0];
    if (!first) continue;
    const key = `${first.geographyType}:${first.geographyValue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const alerts = await prisma.marketIqAlert.findMany({
      where: { sourceImportId: dataImport.id },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 4,
    });
    try {
      pulses.push(buildMarketIqTrendPulse({
        sourceName: dataImport.sourceName,
        geographyType: first.geographyType,
        geographyValue: first.geographyValue,
        displayLabel: displayLabel(first.geographyType, first.geographyValue),
        points: dataImport.trendObservations,
        alerts: alerts.map((alert) => ({
          id: alert.id,
          severity: alert.severity,
          headline: alert.headline,
          narrative: alert.narrative,
        })),
      }));
    } catch {
      // A sparse geography stays out of the selector until it has at least one
      // reportable segment. No broader geography is substituted.
    }
  }
  return pulses.sort((a, b) => {
    const rank = (type: string) => type === "msa" ? 0 : type === "city" ? 1 : 2;
    return rank(a.trendSource.geographyType) - rank(b.trendSource.geographyType) ||
      a.trendSource.displayLabel.localeCompare(b.trendSource.displayLabel);
  });
}
