import "server-only";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { marketIqPrisma } from "@/lib/market-iq/prisma";
import { buildMarketIqTrendPulse, type MarketIqTrendPulse } from "@/lib/market-iq/trends";
import { trendSnapshotFreshness } from "@/lib/market-iq/source-refresh";
import { loadCachedClevelandMarketIqReportSnapshot } from "@/lib/market-iq/report/build.server";
import type { MarketIqMarketCell } from "@/lib/market-iq/report/report";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";

function displayLabel(type: string, value: string) {
  if (type === "msa") return "Cleveland–Elyria, OH";
  if (type === "zip") return `ZIP ${value}`;
  return value.replace(/, OH$/, "");
}

const MARKET_READ_SEGMENTS = [
  { propertyType: "apartment", bedrooms: 0, label: "Studio apartment" },
  { propertyType: "apartment", bedrooms: 1, label: "1-bed apartment" },
  { propertyType: "apartment", bedrooms: 2, label: "2-bed apartment" },
  { propertyType: "house", bedrooms: 2, label: "2-bed house" },
  { propertyType: "house", bedrooms: 3, label: "3-bed house" },
  { propertyType: "house", bedrooms: 4, label: "4-bed house" },
] as const;

function reportPulse(cells: MarketIqMarketCell[]): MarketIqTrendPulse | null {
  const reportable = cells.filter((cell) => cell.status === "reportable" && cell.rent !== null && cell.month);
  const segments = MARKET_READ_SEGMENTS.flatMap((segment) => {
    const cell = reportable.find((candidate) => candidate.propertyType === segment.propertyType && candidate.bedrooms === segment.bedrooms);
    if (!cell) return [];
    return [{
      label: segment.label,
      rent: cell.rent ?? 0,
      yoy: cell.yearOverYearPct ?? 0,
      observations: cell.observations,
    }];
  });
  const first = reportable[0];
  if (!first || !segments.length) return null;
  const largestMove = [...segments].sort((a, b) => Math.abs(b.yoy) - Math.abs(a.yoy))[0];
  const direction = largestMove.yoy >= 0 ? "rose" : "fell";
  return {
    trendSource: {
      name: "Dwellsy IQ Trends",
      availableThrough: first.month ?? "",
      geographyType: first.geographyType,
      geographyValue: first.geographyValue,
      displayLabel: first.geographyLabel,
    },
    segments,
    signal: {
      heading: `${largestMove.label[0].toUpperCase()}${largestMove.label.slice(1)} moved the most`,
      narrative: `${largestMove.label[0].toUpperCase()}${largestMove.label.slice(1)} asking rent ${direction} ${Math.abs(largestMove.yoy).toFixed(1)}% year over year to $${largestMove.rent.toLocaleString("en-US")}.`,
    },
    alerts: [],
  };
}

async function loadClevelandReportPulses() {
  const snapshot = await loadCachedClevelandMarketIqReportSnapshot();
  const grouped = new Map<string, MarketIqMarketCell[]>();
  for (const cell of snapshot.marketRead.cells) {
    const key = `${cell.geographyType}:${cell.geographyValue}`;
    grouped.set(key, [...(grouped.get(key) ?? []), cell]);
  }
  return [...grouped.values()].flatMap((cells) => {
    const pulse = reportPulse(cells);
    return pulse ? [pulse] : [];
  });
}

export async function loadClevelandTrendPulses() {
  const imports = await marketIqPrisma.marketIqDataImport.findMany({
    where: { marketId: CLEVELAND_MARKET_ID, sourceKind: "trends", status: "complete" },
    orderBy: { importedAt: "desc" },
    include: { trendObservations: { orderBy: { month: "desc" } } },
  });
  const seen = new Set<string>();
  const pulses: MarketIqTrendPulse[] = [];
  for (const dataImport of imports) {
    if (trendSnapshotFreshness(dataImport.availableThrough) !== "fresh") continue;
    const first = dataImport.trendObservations[0];
    if (!first) continue;
    const key = `${first.geographyType}:${first.geographyValue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const alerts = await marketIqPrisma.marketIqAlert.findMany({
      where: { sourceImportId: dataImport.id },
      orderBy: { createdAt: "desc" },
    });
    alerts.sort((a, b) => Number(b.severity === "material") - Number(a.severity === "material"));
    try {
      pulses.push(buildMarketIqTrendPulse({
        sourceName: dataImport.sourceName,
        geographyType: first.geographyType,
        geographyValue: first.geographyValue,
        displayLabel: displayLabel(first.geographyType, first.geographyValue),
        points: dataImport.trendObservations,
        alerts: alerts.slice(0, 4).map((alert) => ({
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

export async function loadClevelandMarketReadTrendPulses() {
  const importedPulses = await loadClevelandTrendPulses().catch(() => []);
  if (importedPulses.length || !marketIqPreviewEnabled()) return importedPulses;
  const reportPulses = await loadClevelandReportPulses();
  return reportPulses.sort((a, b) => {
    const rank = (type: string) => type === "msa" ? 0 : type === "city" ? 1 : 2;
    return rank(a.trendSource.geographyType) - rank(b.trendSource.geographyType) ||
      a.trendSource.displayLabel.localeCompare(b.trendSource.displayLabel);
  });
}
