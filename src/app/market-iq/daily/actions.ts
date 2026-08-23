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
  type MarketIqDailyWatchlistFollowResult,
  type MarketIqDailyWatchlistInput,
} from "@/lib/market-iq/daily-watchlists";
import { isMissingDailyWatchlistTableError } from "@/lib/market-iq/daily-watchlists-persistence";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";
import { parseMarketIqDailyDeliveryCadence, type MarketIqDailyDeliveryCadence } from "@/lib/market-iq/daily-watchlist-delivery";
import {
  parseMarketIqDailyTriageNote,
  parseMarketIqDailyTriageStatus,
  type MarketIqDailyTriageMutationResult,
  type MarketIqDailyTriageStatus,
} from "@/lib/market-iq/daily-watchlist-triage";

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
        data: { name: parsed.value.name, version: 1, filters: serialized, visibility: parsed.value.visibility },
      }).then(async (result) => result.count === 1
        ? prisma.marketIqDailyWatchlist.findFirst({
          where: { id: parsed.value.id, ...context, marketId },
          select: { id: true, name: true, marketId: true, filters: true, visibility: true, createdAt: true, updatedAt: true },
        })
        : null)
      : await prisma.marketIqDailyWatchlist.create({
        data: { ...context, marketId, name: parsed.value.name, version: 1, filters: serialized, visibility: parsed.value.visibility },
        select: { id: true, name: true, marketId: true, filters: true, visibility: true, createdAt: true, updatedAt: true },
      });
    if (!row) return { ok: false, message: "This watchlist could not be found." };
    revalidatePath("/market-iq/daily");
    return { ok: true, watchlist: {
      id: row.id,
      name: row.name,
      marketId: row.marketId,
      filters: parsed.value.filters,
      visibility: row.visibility === "organization" ? "organization" : "private",
      isOwner: true,
      isFollowing: true,
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

export async function followMarketIqDailyWatchlist(
  marketId: string,
  watchlistId: string,
  follow: boolean,
): Promise<MarketIqDailyWatchlistFollowResult> {
  const context = await authorizedContext(marketId);
  if (!context || !watchlistId || typeof follow !== "boolean") return { ok: false, message: "This team watchlist could not be updated." };
  const watchlist = await prisma.marketIqDailyWatchlist.findFirst({
    where: { id: watchlistId, organizationId: context.organizationId, marketId, visibility: "organization" },
    select: { id: true, userId: true },
  });
  if (!watchlist) return { ok: false, message: "This team watchlist could not be found." };
  if (watchlist.userId === context.userId) return { ok: true, isFollowing: true };
  if (follow) {
    await prisma.marketIqDailyWatchlistSubscription.upsert({
      where: { watchlistId_userId: { watchlistId, userId: context.userId } },
      create: { organizationId: context.organizationId, watchlistId, userId: context.userId },
      update: {},
    });
  } else {
    await prisma.marketIqDailyWatchlistSubscription.deleteMany({
      where: { organizationId: context.organizationId, watchlistId, userId: context.userId },
    });
  }
  revalidatePath("/market-iq/daily");
  return { ok: true, isFollowing: follow };
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

export async function saveMarketIqDailyDeliveryPreference(
  cadence: MarketIqDailyDeliveryCadence,
): Promise<MarketIqDailyViewActionResult> {
  const parsed = parseMarketIqDailyDeliveryCadence(cadence);
  if (!parsed || !marketIqPreviewEnabled()) return { ok: false, message: "This delivery preference could not be saved." };
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId || !organizationId || !access.hasProduct) return { ok: false, message: "This delivery preference could not be saved." };
  const current = await prisma.marketIqDailyDeliveryPreference.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { cadence: true },
  });
  const beginsEmailDelivery = parsed !== "in_app_only" && (!current || current.cadence === "in_app_only");
  await prisma.marketIqDailyDeliveryPreference.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    create: { organizationId, userId, cadence: parsed, lastDeliveredAt: beginsEmailDelivery ? new Date() : null },
    update: { cadence: parsed, ...(beginsEmailDelivery ? { lastDeliveredAt: new Date() } : {}) },
  });
  revalidatePath("/market-iq/daily");
  return { ok: true };
}

export async function markMarketIqDailyMatchesRead(matchIds: string[]): Promise<MarketIqDailyViewActionResult> {
  if (!marketIqPreviewEnabled() || !Array.isArray(matchIds) || matchIds.length > 100 || matchIds.some((id) => typeof id !== "string" || !id)) return { ok: false, message: "These matches could not be updated." };
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId || !organizationId || !access.hasProduct) return { ok: false, message: "These matches could not be updated." };
  await prisma.marketIqDailyWatchlistMatch.updateMany({ where: { id: { in: matchIds }, organizationId, userId }, data: { readAt: new Date() } });
  revalidatePath("/market-iq/daily");
  return { ok: true };
}

async function authorizedDailyMatch(matchId: string) {
  if (!marketIqPreviewEnabled() || !matchId) return null;
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId || !organizationId || !access.hasProduct) return null;
  const match = await prisma.marketIqDailyWatchlistMatch.findFirst({
    where: { id: matchId, organizationId, userId },
    select: {
      eventKey: true,
      watchlistId: true,
      watchlist: { select: { userId: true, visibility: true } },
    },
  });
  if (!match || match.watchlist.userId !== userId && match.watchlist.visibility !== "organization") return null;
  return { userId, organizationId, match };
}

async function validAssignee(input: { organizationId: string; ownerUserId: string; assignedToUserId: string | null }) {
  if (!input.assignedToUserId) return true;
  if (input.assignedToUserId === input.ownerUserId) return true;
  return Boolean(await prisma.organizationMembership.findUnique({
    where: { userId_organizationId: { userId: input.assignedToUserId, organizationId: input.organizationId } },
    select: { id: true },
  }));
}

export async function updateMarketIqDailyMatchTriage(
  matchId: string,
  input: { status: MarketIqDailyTriageStatus; assignedToUserId: string | null },
): Promise<MarketIqDailyTriageMutationResult> {
  const status = parseMarketIqDailyTriageStatus(input?.status);
  const assignedToUserId = input?.assignedToUserId === null || typeof input?.assignedToUserId === "string" && input.assignedToUserId.length <= 100
    ? input.assignedToUserId
    : undefined;
  if (!status || assignedToUserId === undefined) return { ok: false, message: "This match could not be updated." };
  const context = await authorizedDailyMatch(matchId);
  if (!context) return { ok: false, message: "This match could not be updated." };
  if (!await validAssignee({ organizationId: context.organizationId, ownerUserId: context.match.watchlist.userId, assignedToUserId })) {
    return { ok: false, message: "Choose a current workspace member." };
  }
  const triage = await prisma.marketIqDailyWatchlistTriage.upsert({
    where: { watchlistId_eventKey: { watchlistId: context.match.watchlistId, eventKey: context.match.eventKey } },
    create: {
      organizationId: context.organizationId,
      watchlistId: context.match.watchlistId,
      eventKey: context.match.eventKey,
      status,
      assignedToUserId,
      updatedByUserId: context.userId,
    },
    update: { status, assignedToUserId, updatedByUserId: context.userId },
    select: { status: true, assignedToUserId: true },
  });
  revalidatePath("/market-iq/daily");
  return {
    ok: true,
    status: parseMarketIqDailyTriageStatus(triage.status) ?? "new",
    assignedToUserId: triage.assignedToUserId,
  };
}

export async function addMarketIqDailyMatchNote(matchId: string, value: string): Promise<MarketIqDailyTriageMutationResult> {
  const body = parseMarketIqDailyTriageNote(value);
  if (!body) return { ok: false, message: "Enter a note of 1,000 characters or fewer." };
  const context = await authorizedDailyMatch(matchId);
  if (!context) return { ok: false, message: "This match could not be updated." };
  const actorUserId = context.userId;
  const result = await prisma.$transaction(async (transaction) => {
    const triage = await transaction.marketIqDailyWatchlistTriage.upsert({
      where: { watchlistId_eventKey: { watchlistId: context.match.watchlistId, eventKey: context.match.eventKey } },
      create: {
        organizationId: context.organizationId,
        watchlistId: context.match.watchlistId,
        eventKey: context.match.eventKey,
        updatedByUserId: actorUserId,
      },
      update: { updatedByUserId: actorUserId },
      select: { id: true, status: true, assignedToUserId: true },
    });
    const note = await transaction.marketIqDailyWatchlistNote.create({
      data: { organizationId: context.organizationId, triageId: triage.id, authorUserId: actorUserId, body },
      select: { id: true, authorUserId: true, body: true, createdAt: true },
    });
    return { triage, note };
  });
  revalidatePath("/market-iq/daily");
  return {
    ok: true,
    status: parseMarketIqDailyTriageStatus(result.triage.status) ?? "new",
    assignedToUserId: result.triage.assignedToUserId,
    note: {
      id: result.note.id,
      authorUserId: result.note.authorUserId,
      authorName: "You",
      body: result.note.body,
      createdAt: result.note.createdAt.toISOString(),
    },
  };
}
