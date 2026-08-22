import "server-only";

import type { ListingSupplyHistoryPoint } from "@/lib/market-iq/listing-supply";
import { marketIqPrisma } from "@/lib/market-iq/prisma";

const HISTORY_WINDOW_DAYS = 93;

export async function loadListingSupplyHistory(
  marketId: string,
  asOf = new Date(),
): Promise<ListingSupplyHistoryPoint[]> {
  const windowStart = new Date(asOf);
  windowStart.setUTCDate(windowStart.getUTCDate() - HISTORY_WINDOW_DAYS);

  const snapshots = await marketIqPrisma.marketIqListingSupplySnapshot.findMany({
    where: {
      marketId,
      snapshotDate: { gte: windowStart },
    },
    orderBy: { snapshotDate: "asc" },
    select: {
      snapshotDate: true,
      sourceAvailableThrough: true,
      activeListings: true,
      medianActiveAgeDays: true,
    },
  });

  return snapshots.map((snapshot) => ({
    snapshotDate: snapshot.snapshotDate.toISOString().slice(0, 10),
    sourceAvailableThrough: snapshot.sourceAvailableThrough.toISOString(),
    activeListings: snapshot.activeListings,
    medianActiveAgeDays: snapshot.medianActiveAgeDays,
  }));
}
