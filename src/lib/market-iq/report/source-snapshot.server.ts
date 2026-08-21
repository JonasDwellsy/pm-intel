import "server-only";

import { createHash } from "node:crypto";

import { marketIqPrisma } from "@/lib/market-iq/prisma";
import {
  parseCurrentMarketIqReportSourceSnapshot,
  type MarketIqReportSnapshot,
} from "@/lib/market-iq/report/report";
import { storeMarketIqMarketSummary } from "@/lib/market-iq/market-summary.server";

function sourceAvailableThrough(snapshot: MarketIqReportSnapshot): Date {
  const trendsSource = snapshot.sources.find((source) => source.name === "Dwellsy IQ Trends");
  const value = trendsSource?.availableThrough ?? snapshot.scope.periodEnd;
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("The report snapshot has no valid Trends source date.");
  return date;
}

export async function loadLatestMarketIqReportSourceSnapshot(
  marketId: string,
): Promise<MarketIqReportSnapshot | null> {
  const stored = await marketIqPrisma.marketIqReportSourceSnapshot.findMany({
    where: { marketId, sourceKind: "dwellsy_trends" },
    orderBy: [{ sourceAvailableThrough: "desc" }, { generatedAt: "desc" }],
    take: 20,
    select: { snapshot: true },
  });
  for (const candidate of stored) {
    const snapshot = parseCurrentMarketIqReportSourceSnapshot(candidate.snapshot);
    if (snapshot) return snapshot;
  }
  return null;
}

export async function storeMarketIqReportSourceSnapshot(snapshot: MarketIqReportSnapshot) {
  const serialized = JSON.stringify(snapshot);
  if (!parseCurrentMarketIqReportSourceSnapshot(serialized)) {
    throw new Error("The Market IQ source snapshot does not satisfy the current analytical contract.");
  }
  const checksum = createHash("sha256").update(serialized).digest("hex");
  const stored = await marketIqPrisma.marketIqReportSourceSnapshot.upsert({
    where: { marketId_checksum: { marketId: snapshot.scope.marketId, checksum } },
    create: {
      marketId: snapshot.scope.marketId,
      sourceKind: "dwellsy_trends",
      sourceAvailableThrough: sourceAvailableThrough(snapshot),
      generatedAt: new Date(snapshot.generatedAt),
      snapshot: serialized,
      checksum,
    },
    update: {},
    select: {
      id: true,
      marketId: true,
      sourceAvailableThrough: true,
      generatedAt: true,
      checksum: true,
    },
  });
  await storeMarketIqMarketSummary(snapshot);
  return stored;
}
