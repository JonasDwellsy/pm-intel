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
    where: {
      organizationId: input.organizationId,
      marketId: input.marketId,
      OR: [{ userId: input.userId }, { visibility: "organization" }],
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    select: {
      id: true,
      userId: true,
      name: true,
      marketId: true,
      version: true,
      filters: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
      subscriptions: { where: { userId: input.userId }, select: { id: true }, take: 1 },
    },
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
      visibility: row.visibility === "organization" ? "organization" as const : "private" as const,
      isOwner: row.userId === input.userId,
      isFollowing: row.userId === input.userId || row.subscriptions.length > 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }] : [];
  }).sort((left, right) => Number(right.isOwner) - Number(left.isOwner) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export async function loadMarketIqCompetitiveSetWatchlist(input: {
  organizationId: string;
  userId: string;
  watchlistId: string;
}): Promise<MarketIqDailyWatchlistView | null> {
  const row = await prisma.marketIqDailyWatchlist.findFirst({
    where: {
      id: input.watchlistId,
      organizationId: input.organizationId,
      OR: [{ userId: input.userId }, { visibility: "organization" }],
    },
    select: {
      id: true,
      userId: true,
      name: true,
      marketId: true,
      version: true,
      filters: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
      subscriptions: { where: { userId: input.userId }, select: { id: true }, take: 1 },
    },
  }).catch((error: unknown) => {
    if (isMissingDailyWatchlistTableError(error)) return null;
    throw error;
  });
  if (!row) return null;
  const filters = row.version === 1 ? parseMarketIqDailyWatchlistFilters(row.filters) : null;
  if (!filters?.competitiveSet) return null;
  return {
    id: row.id,
    name: row.name,
    marketId: row.marketId,
    filters,
    visibility: row.visibility === "organization" ? "organization" : "private",
    isOwner: row.userId === input.userId,
    isFollowing: row.userId === input.userId || row.subscriptions.length > 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
