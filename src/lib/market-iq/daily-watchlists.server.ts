import "server-only";

import {
  parseMarketIqDailyWatchlistFilters,
  type MarketIqDailyWatchlistView,
} from "@/lib/market-iq/daily-watchlists";
import { isMissingDailyWatchlistTableError } from "@/lib/market-iq/daily-watchlists-persistence";
import { prisma } from "@/lib/prisma";

export async function loadMarketIqDailyWatchlists(input: {
  organizationId: string;
  userId: string;
  marketId: string;
}): Promise<MarketIqDailyWatchlistView[]> {
  const rows = await prisma.marketIqDailyWatchlist.findMany({
    where: input,
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    select: { id: true, name: true, marketId: true, version: true, filters: true, createdAt: true, updatedAt: true },
  }).catch((error: unknown) => {
    if (isMissingDailyWatchlistTableError(error)) return [];
    throw error;
  });
  return rows.flatMap((row) => {
    const filters = row.version === 1 ? parseMarketIqDailyWatchlistFilters(row.filters) : null;
    return filters ? [{
      id: row.id,
      name: row.name,
      marketId: row.marketId,
      filters,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }] : [];
  });
}
