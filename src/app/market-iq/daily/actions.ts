"use server";

import { revalidatePath } from "next/cache";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import {
  parseMarketIqDailySavedView,
  type MarketIqDailySavedViewFilters,
} from "@/lib/market-iq/daily-event-explorer";
import {
  parseMarketIqDailyWatchlistInput,
  type MarketIqDailyWatchlistActionResult,
  type MarketIqDailyWatchlistInput,
} from "@/lib/market-iq/daily-watchlists";
import { isMissingDailyWatchlistTableError } from "@/lib/market-iq/daily-watchlists-persistence";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export type MarketIqDailyViewActionResult = { ok: true } | { ok: false; message: string };

async function authorizedContext(marketId: string) {
  if (!marketIqPreviewEnabled()) return null;
  const [{ userId, organizationId }, access] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
  ]);
  if (!userId || !organizationId || !access.hasProduct) return null;
  const entitled = listEntitledMarketIqMarkets(access.entitlement).some((market) => market.id === marketId);
  return entitled ? { userId, organizationId } : null;
}

export async function saveMarketIqDailyViewPreference(
  marketId: string,
  input: MarketIqDailySavedViewFilters,
): Promise<MarketIqDailyViewActionResult> {
  const context = await authorizedContext(marketId);
  if (!context) return { ok: false, message: "This market view could not be saved." };
  const filters = parseMarketIqDailySavedView(JSON.stringify(input));
  if (!filters) return { ok: false, message: "These filters could not be saved." };

  await prisma.marketIqDailyViewPreference.upsert({
    where: { organizationId_userId_marketId: { ...context, marketId } },
    create: { ...context, marketId, version: 1, filters: JSON.stringify(filters) },
    update: { version: 1, filters: JSON.stringify(filters) },
  });
  revalidatePath("/market-iq/daily");
  return { ok: true };
}

export async function clearMarketIqDailyViewPreference(marketId: string): Promise<MarketIqDailyViewActionResult> {
  const context = await authorizedContext(marketId);
  if (!context) return { ok: false, message: "This saved view could not be cleared." };
  await prisma.marketIqDailyViewPreference.deleteMany({ where: { ...context, marketId } });
  revalidatePath("/market-iq/daily");
  return { ok: true };
}

export async function saveMarketIqDailyWatchlist(
  marketId: string,
  input: MarketIqDailyWatchlistInput,
): Promise<MarketIqDailyWatchlistActionResult> {
  const context = await authorizedContext(marketId);
  if (!context) return { ok: false, message: "This watchlist could not be saved." };
  const parsed = parseMarketIqDailyWatchlistInput(input);
  if (!parsed.ok) return { ok: false, message: parsed.error };

  try {
    const serialized = JSON.stringify(parsed.value.filters);
    const row = parsed.value.id
      ? await prisma.marketIqDailyWatchlist.updateMany({
        where: { id: parsed.value.id, ...context, marketId },
        data: { name: parsed.value.name, version: 1, filters: serialized },
      }).then(async (result) => result.count === 1
        ? prisma.marketIqDailyWatchlist.findFirst({
          where: { id: parsed.value.id, ...context, marketId },
          select: { id: true, name: true, marketId: true, filters: true, createdAt: true, updatedAt: true },
        })
        : null)
      : await prisma.marketIqDailyWatchlist.create({
        data: { ...context, marketId, name: parsed.value.name, version: 1, filters: serialized },
        select: { id: true, name: true, marketId: true, filters: true, createdAt: true, updatedAt: true },
      });
    if (!row) return { ok: false, message: "This watchlist could not be found." };
    revalidatePath("/market-iq/daily");
    return { ok: true, watchlist: {
      id: row.id,
      name: row.name,
      marketId: row.marketId,
      filters: parsed.value.filters,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    } };
  } catch (error) {
    if (isMissingDailyWatchlistTableError(error)) {
      return { ok: false, message: "Daily Watchlists are not available in this environment yet." };
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return { ok: false, message: "Use a different name for this market watchlist." };
    }
    throw error;
  }
}

export async function deleteMarketIqDailyWatchlist(
  marketId: string,
  watchlistId: string,
): Promise<MarketIqDailyWatchlistActionResult> {
  const context = await authorizedContext(marketId);
  if (!context || !watchlistId) return { ok: false, message: "This watchlist could not be removed." };
  try {
    const deleted = await prisma.marketIqDailyWatchlist.deleteMany({
      where: { id: watchlistId, ...context, marketId },
    });
    if (!deleted.count) return { ok: false, message: "This watchlist could not be found." };
    revalidatePath("/market-iq/daily");
    return { ok: true };
  } catch (error) {
    if (isMissingDailyWatchlistTableError(error)) {
      return { ok: false, message: "Daily Watchlists are not available in this environment yet." };
    }
    throw error;
  }
}
