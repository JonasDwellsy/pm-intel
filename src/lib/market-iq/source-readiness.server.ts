import "server-only";

import { marketIqDatabaseConfigured, marketIqPrisma } from "@/lib/market-iq/prisma";
import {
  resolveMarketIqRecordedSourceReadiness,
  type MarketIqRecordedSourceReadiness,
} from "@/lib/market-iq/source-readiness";
import { parseCurrentMarketIqReportSourceSnapshot } from "@/lib/market-iq/report/report";

export async function loadMarketIqRecordedSourceReadiness(
  marketId: string,
): Promise<MarketIqRecordedSourceReadiness> {
  const sourceConfigured = Boolean(process.env.DWELLSY_DATABASE_URL?.trim());
  if (!marketIqDatabaseConfigured()) {
    return resolveMarketIqRecordedSourceReadiness({
      sourceConfigured,
      evidenceStoreReachable: false,
      savedSnapshot: null,
      lastAttempt: null,
    });
  }

  try {
    const [savedSnapshots, lastAttempt] = await Promise.all([
      marketIqPrisma.marketIqReportSourceSnapshot.findMany({
        where: { marketId, sourceKind: "dwellsy_trends" },
        orderBy: [{ sourceAvailableThrough: "desc" }, { generatedAt: "desc" }],
        take: 20,
        select: { sourceAvailableThrough: true, generatedAt: true, snapshot: true },
      }),
      marketIqPrisma.marketIqSourceRefresh.findFirst({
        where: { marketId, sourceKind: "trends" },
        orderBy: { startedAt: "desc" },
        select: { status: true, startedAt: true, completedAt: true },
      }),
    ]);
    const compatibleSnapshot = savedSnapshots.find(
      (candidate) => parseCurrentMarketIqReportSourceSnapshot(candidate.snapshot) !== null,
    );
    const savedSnapshot = compatibleSnapshot ?? savedSnapshots[0] ?? null;
    return resolveMarketIqRecordedSourceReadiness({
      sourceConfigured,
      evidenceStoreReachable: true,
      savedSnapshot: savedSnapshot ? {
        sourceAvailableThrough: savedSnapshot.sourceAvailableThrough,
        generatedAt: savedSnapshot.generatedAt,
        contractCompatible: Boolean(compatibleSnapshot),
      } : null,
      lastAttempt,
    });
  } catch (error) {
    console.error("[Market IQ] Recorded source readiness unavailable", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return resolveMarketIqRecordedSourceReadiness({
      sourceConfigured,
      evidenceStoreReachable: false,
      savedSnapshot: null,
      lastAttempt: null,
    });
  }
}
