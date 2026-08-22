"use server";

import { revalidatePath } from "next/cache";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import {
  parseMarketIqDailySavedView,
  type MarketIqDailySavedViewFilters,
} from "@/lib/market-iq/daily-event-explorer";
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
