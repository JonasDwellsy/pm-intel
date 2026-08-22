import "server-only";

import { marketIqPrisma } from "@/lib/market-iq/prisma";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { storeMarketIqReportSourceSnapshot } from "@/lib/market-iq/report/source-snapshot.server";
import {
  MARKET_IQ_REFRESH_STALE_AFTER_MS,
  recordedMarketIqRefreshFailure,
  type MarketIqRefreshFailureStage,
} from "@/lib/market-iq/report-refresh-reliability";

export async function beginMarketIqReportSourceRefresh(input: {
  marketId: string;
  startedBy: string;
  triggerKind?: "manual" | "scheduled";
  now?: Date;
}): Promise<{ state: "acquired"; refreshId: string } | { state: "already_running" }> {
  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - MARKET_IQ_REFRESH_STALE_AFTER_MS);
  await marketIqPrisma.marketIqSourceRefresh.updateMany({
    where: {
      marketId: input.marketId,
      sourceKind: "trends",
      status: "running",
      startedAt: { lt: staleBefore },
    },
    data: {
      status: "blocked",
      error: JSON.stringify(recordedMarketIqRefreshFailure({
        stage: "coordination",
        category: "stale_run",
      })),
      completedAt: now,
    },
  });

  const refresh = await marketIqPrisma.marketIqSourceRefresh.create({
    data: {
      marketId: input.marketId,
      sourceKind: "trends",
      triggerKind: input.triggerKind ?? "manual",
      status: "running",
      requiredManifest: JSON.stringify([{ marketId: input.marketId }]),
      requiredGeographies: 1,
      startedBy: input.startedBy,
    },
    select: { id: true },
  });
  const active = await marketIqPrisma.marketIqSourceRefresh.findFirst({
    where: {
      marketId: input.marketId,
      sourceKind: "trends",
      status: "running",
    },
    orderBy: [{ startedAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (active?.id === refresh.id) return { state: "acquired", refreshId: refresh.id };

  await marketIqPrisma.marketIqSourceRefresh.update({
    where: { id: refresh.id },
    data: {
      status: "blocked",
      error: JSON.stringify(recordedMarketIqRefreshFailure({
        stage: "coordination",
        category: "already_running",
      })),
      completedAt: now,
    },
  });
  return { state: "already_running" };
}

export async function completeMarketIqReportSourceRefresh(input: {
  refreshId: string;
  snapshot: MarketIqReportSnapshot;
  observationCount: number;
}) {
  return marketIqPrisma.$transaction(async (transaction) => {
    const stored = await storeMarketIqReportSourceSnapshot(input.snapshot, transaction);
    const completed = await transaction.marketIqSourceRefresh.updateMany({
      where: { id: input.refreshId, status: "running" },
      data: {
        status: "complete",
        sourceAvailableThrough: stored.sourceAvailableThrough,
        receivedGeographies: 1,
        recordCount: input.observationCount,
        error: null,
        completedAt: new Date(),
      },
    });
    if (completed.count !== 1) {
      throw new Error("The active Market IQ refresh lease was lost before persistence.");
    }
    return stored;
  }, { maxWait: 5_000, timeout: 30_000 });
}

export async function blockMarketIqReportSourceRefresh(input: {
  refreshId: string;
  stage: MarketIqRefreshFailureStage;
  error: unknown;
}) {
  return marketIqPrisma.marketIqSourceRefresh.updateMany({
    where: { id: input.refreshId, status: "running" },
    data: {
      status: "blocked",
      error: JSON.stringify(recordedMarketIqRefreshFailure(input)),
      completedAt: new Date(),
    },
  });
}
