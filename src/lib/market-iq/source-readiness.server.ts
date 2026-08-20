import "server-only";

import { marketIqDatabaseConfigured, marketIqPrisma } from "@/lib/market-iq/prisma";
import {
  resolveMarketIqRecordedSourceReadiness,
  type MarketIqRecordedSourceReadiness,
} from "@/lib/market-iq/source-readiness";

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
    const [savedSnapshot, lastAttempt] = await Promise.all([
      marketIqPrisma.marketIqReportSourceSnapshot.findFirst({
        where: { marketId, sourceKind: "dwellsy_trends" },
        orderBy: [{ sourceAvailableThrough: "desc" }, { generatedAt: "desc" }],
        select: { sourceAvailableThrough: true, generatedAt: true },
      }),
      marketIqPrisma.marketIqSourceRefresh.findFirst({
        where: { marketId, sourceKind: "trends" },
        orderBy: { startedAt: "desc" },
        select: { status: true, startedAt: true, completedAt: true },
      }),
    ]);
    return resolveMarketIqRecordedSourceReadiness({
      sourceConfigured,
      evidenceStoreReachable: true,
      savedSnapshot,
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
