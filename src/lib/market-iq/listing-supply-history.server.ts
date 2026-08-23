import "server-only";

import type { ListingSupplyHistoryPoint } from "@/lib/market-iq/listing-supply";
import { marketIqPrisma } from "@/lib/market-iq/prisma";

const HISTORY_WINDOW_DAYS = 93;

export async function loadListingSupplyHistory(
  input: { marketId: string; cbsaCode: string },
  asOf = new Date(),
): Promise<ListingSupplyHistoryPoint[]> {
  const windowStart = new Date(asOf);
  windowStart.setUTCDate(windowStart.getUTCDate() - HISTORY_WINDOW_DAYS);

  try {
    const select = {
      snapshotDate: true,
      sourceAvailableThrough: true,
      activeListings: true,
      medianActiveAgeDays: true,
      capturedAt: true,
    } as const;
    const [marketSnapshots, nationalSnapshots] = await Promise.all([
      marketIqPrisma.marketIqListingSupplySnapshot.findMany({
        where: { marketId: input.marketId, snapshotDate: { gte: windowStart } },
        orderBy: { snapshotDate: "asc" },
        select,
      }),
      marketIqPrisma.marketIqNationalSupplySnapshot.findMany({
        where: {
          cbsaCode: input.cbsaCode,
          coverageStatus: "eligible",
          snapshotDate: { gte: windowStart },
        },
        orderBy: { snapshotDate: "asc" },
        select,
      }),
    ]);
    const byDate = new Map<string, (typeof marketSnapshots)[number] | (typeof nationalSnapshots)[number]>();
    for (const snapshot of [...marketSnapshots, ...nationalSnapshots]) {
      const key = snapshot.snapshotDate.toISOString().slice(0, 10);
      const existing = byDate.get(key);
      if (!existing || snapshot.capturedAt > existing.capturedAt) byDate.set(key, snapshot);
    }
    return [...byDate.values()]
      .sort((a, b) => a.snapshotDate.getTime() - b.snapshotDate.getTime())
      .flatMap((snapshot) => snapshot.sourceAvailableThrough ? [{
        snapshotDate: snapshot.snapshotDate.toISOString().slice(0, 10),
        sourceAvailableThrough: snapshot.sourceAvailableThrough.toISOString(),
        activeListings: snapshot.activeListings,
        medianActiveAgeDays: snapshot.medianActiveAgeDays,
      }] : []);
  } catch (error) {
    console.warn("[Market IQ] Listing supply history unavailable", {
      marketId: input.marketId,
      cbsaCode: input.cbsaCode,
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return [];
  }

}
