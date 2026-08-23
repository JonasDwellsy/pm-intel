"use server";

import { revalidatePath } from "next/cache";

import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import {
  parseMarketIqAlertWorkbenchBulkInput,
  type MarketIqAlertWorkbenchBulkInput,
  type MarketIqAlertWorkbenchBulkResult,
} from "@/lib/market-iq/daily-alert-workbench";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

async function alertWorkbenchContext() {
  if (!marketIqPreviewEnabled()) return null;
  const [{ userId, organizationId }, access] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
  ]);
  if (!userId || !organizationId || !access.hasProduct) return null;
  return {
    userId,
    organizationId,
    marketIds: listEntitledMarketIqMarkets(access.entitlement).map((market) => market.id),
  };
}

export async function bulkUpdateMarketIqAlerts(
  matchIds: string[],
  input: MarketIqAlertWorkbenchBulkInput,
): Promise<MarketIqAlertWorkbenchBulkResult> {
  const uniqueMatchIds = Array.isArray(matchIds) ? [...new Set(matchIds)] : [];
  if (!uniqueMatchIds.length || uniqueMatchIds.length > 100
    || uniqueMatchIds.some((id) => typeof id !== "string" || !id || id.length > 100)) {
    return { ok: false, message: "Select between 1 and 100 alerts." };
  }
  const parsed = parseMarketIqAlertWorkbenchBulkInput(input);
  if (!parsed.ok) return { ok: false, message: parsed.error };
  const context = await alertWorkbenchContext();
  if (!context) return { ok: false, message: "These alerts could not be updated." };

  const matches = await prisma.marketIqDailyWatchlistMatch.findMany({
    where: {
      id: { in: uniqueMatchIds },
      organizationId: context.organizationId,
      userId: context.userId,
      marketId: { in: context.marketIds },
      watchlist: { OR: [{ userId: context.userId }, { visibility: "organization" }] },
    },
    select: { id: true, watchlistId: true, eventKey: true },
  });
  if (matches.length !== uniqueMatchIds.length) {
    return { ok: false, message: "One or more selected alerts are no longer available." };
  }

  if (parsed.value.assignedToUserId && parsed.value.assignedToUserId !== context.userId) {
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: parsed.value.assignedToUserId,
          organizationId: context.organizationId,
        },
      },
      select: { id: true },
    });
    if (!membership) return { ok: false, message: "Choose a current workspace member." };
  }

  await prisma.$transaction(matches.map((match) => prisma.marketIqDailyWatchlistTriage.upsert({
    where: { watchlistId_eventKey: { watchlistId: match.watchlistId, eventKey: match.eventKey } },
    create: {
      organizationId: context.organizationId,
      watchlistId: match.watchlistId,
      eventKey: match.eventKey,
      status: parsed.value.status ?? "new",
      assignedToUserId: parsed.value.assignedToUserId ?? null,
      updatedByUserId: context.userId,
    },
    update: {
      ...(parsed.value.status !== undefined ? { status: parsed.value.status } : {}),
      ...(parsed.value.assignedToUserId !== undefined ? { assignedToUserId: parsed.value.assignedToUserId } : {}),
      updatedByUserId: context.userId,
    },
  })));
  revalidatePath("/market-iq/alerts");
  revalidatePath("/market-iq/daily");
  return { ok: true, updatedMatchIds: matches.map((match) => match.id) };
}
