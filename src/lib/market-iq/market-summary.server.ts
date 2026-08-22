import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/market-iq";
import { marketIqPrisma } from "@/lib/market-iq/prisma";
import { parseMarketIqReportSnapshot, type MarketIqReportSnapshot } from "@/lib/market-iq/report/report";

export type MarketIqSummaryCell = {
  geographyLabel: string;
  geographyType: string;
  label: string;
  propertyType: string;
  bedrooms: number;
  rent: number;
  yearOverYearPct: number | null;
};

export type MarketIqPersistedMarketSummary = {
  version: 1;
  marketId: string;
  sourceAvailableThrough: string;
  generatedAt: string;
  apartment1: MarketIqSummaryCell | null;
  house3: MarketIqSummaryCell | null;
  notable: MarketIqSummaryCell | null;
};

function compactCell(cell: MarketIqReportSnapshot["marketRead"]["cells"][number] | undefined): MarketIqSummaryCell | null {
  if (!cell || cell.rent === null) return null;
  return {
    geographyLabel: cell.geographyLabel,
    geographyType: cell.geographyType,
    label: cell.label,
    propertyType: cell.propertyType,
    bedrooms: cell.bedrooms,
    rent: cell.rent,
    yearOverYearPct: cell.yearOverYearPct,
  };
}

export function summarizeMarketIqSnapshot(snapshot: MarketIqReportSnapshot): MarketIqPersistedMarketSummary {
  const reportable = snapshot.marketRead.cells.filter((cell) => cell.status === "reportable");
  const msa = (propertyType: "apartment" | "house", bedrooms: number) => reportable.find((cell) =>
    cell.geographyType === "msa" && cell.propertyType === propertyType && cell.bedrooms === bedrooms,
  );
  const notable = reportable
    .filter((cell) => cell.geographyType !== "msa" && cell.yearOverYearPct !== null)
    .sort((a, b) => Math.abs(b.yearOverYearPct ?? 0) - Math.abs(a.yearOverYearPct ?? 0))[0];
  return {
    version: 1,
    marketId: snapshot.scope.marketId,
    sourceAvailableThrough: snapshot.scope.periodEnd,
    generatedAt: snapshot.generatedAt,
    apartment1: compactCell(msa("apartment", 1)),
    house3: compactCell(msa("house", 3)),
    notable: compactCell(notable),
  };
}

type MarketIqSummaryPersistenceClient = Pick<Prisma.TransactionClient, "marketIqMarketSummary">;

export async function storeMarketIqMarketSummary(
  snapshot: MarketIqReportSnapshot,
  client: MarketIqSummaryPersistenceClient = marketIqPrisma,
) {
  const summary = summarizeMarketIqSnapshot(snapshot);
  const serialized = JSON.stringify(summary);
  const checksum = createHash("sha256").update(serialized).digest("hex");
  return client.marketIqMarketSummary.upsert({
    where: { marketId: summary.marketId },
    create: {
      marketId: summary.marketId,
      sourceAvailableThrough: new Date(`${summary.sourceAvailableThrough.slice(0, 10)}T00:00:00.000Z`),
      generatedAt: new Date(summary.generatedAt),
      summary: serialized,
      checksum,
    },
    update: {
      sourceAvailableThrough: new Date(`${summary.sourceAvailableThrough.slice(0, 10)}T00:00:00.000Z`),
      generatedAt: new Date(summary.generatedAt),
      summary: serialized,
      checksum,
    },
  });
}

function parseSummary(value: string): MarketIqPersistedMarketSummary | null {
  try { return JSON.parse(value) as MarketIqPersistedMarketSummary; } catch { return null; }
}

export async function loadMarketIqMarketSummaries(marketIds: string[]) {
  const result = new Map<string, MarketIqPersistedMarketSummary>();
  if (!marketIds.length) return result;
  const stored = await marketIqPrisma.marketIqMarketSummary.findMany({ where: { marketId: { in: marketIds } } });
  for (const row of stored) {
    const parsed = parseSummary(row.summary);
    if (parsed) result.set(row.marketId, parsed);
  }
  const missing = marketIds.filter((id) => !result.has(id));
  if (!missing.length) return result;
  const snapshots = await marketIqPrisma.marketIqReportSourceSnapshot.findMany({
    where: { marketId: { in: missing }, sourceKind: "dwellsy_trends" },
    orderBy: [{ sourceAvailableThrough: "desc" }, { generatedAt: "desc" }],
    select: { marketId: true, snapshot: true },
  });
  for (const row of snapshots) {
    if (result.has(row.marketId)) continue;
    try {
      const snapshot = parseMarketIqReportSnapshot(row.snapshot);
      if (!snapshot) continue;
      const summary = summarizeMarketIqSnapshot(snapshot);
      result.set(row.marketId, summary);
      await storeMarketIqMarketSummary(snapshot);
    } catch {}
  }
  return result;
}
