"use server";

import { revalidatePath } from "next/cache";

import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { parseMarketIqCompetitiveSetSignalRuleInput, type MarketIqCompetitiveSetSignalRuleActionResult, type MarketIqCompetitiveSetSignalRuleInput } from "@/lib/market-iq/competitive-set-signal-rules";
import { loadMarketIqCompetitiveSetWatchlist } from "@/lib/market-iq/daily-watchlists.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

async function authorizedRuleContext(watchlistId: string) {
  if (!marketIqPreviewEnabled() || !watchlistId || watchlistId.length > 100) return null;
  const [{ userId, organizationId }, access] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
  ]);
  if (!userId || !organizationId || !access.hasProduct) return null;
  const watchlist = await loadMarketIqCompetitiveSetWatchlist({ organizationId, userId, watchlistId });
  if (!watchlist || !watchlist.isFollowing || !isMarketEntitled(access.entitlement, watchlist.marketId)) return null;
  return { userId, organizationId, watchlist };
}

function revalidateRulePaths(watchlistId: string) {
  revalidatePath(`/market-iq/competitive-sets/${watchlistId}`);
  revalidatePath("/market-iq/alerts");
  revalidatePath("/market-iq/daily");
}

export async function saveMarketIqCompetitiveSetSignalRule(
  watchlistId: string,
  input: MarketIqCompetitiveSetSignalRuleInput,
): Promise<MarketIqCompetitiveSetSignalRuleActionResult> {
  const parsed = parseMarketIqCompetitiveSetSignalRuleInput(input);
  const context = await authorizedRuleContext(watchlistId);
  if (!parsed.ok || !context) return { ok: false, message: parsed.ok ? "This signal rule could not be saved." : parsed.error };
  const identity = {
    watchlistId_userId_eventType_propertyScope_windowDays_condition: {
      watchlistId,
      userId: context.userId,
      eventType: parsed.value.eventType,
      propertyScope: parsed.value.propertyScope,
      windowDays: parsed.value.windowDays,
      condition: parsed.value.condition,
    },
  };
  const row = await prisma.marketIqCompetitiveSetSignalRule.upsert({
    where: identity,
    create: {
      organizationId: context.organizationId,
      userId: context.userId,
      watchlistId,
      ...parsed.value,
    },
    update: { threshold: parsed.value.threshold, enabled: parsed.value.enabled },
  });
  revalidateRulePaths(watchlistId);
  return { ok: true, rule: { id: row.id, watchlistId, ...parsed.value, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } };
}

export async function deleteMarketIqCompetitiveSetSignalRule(
  watchlistId: string,
  ruleId: string,
): Promise<MarketIqCompetitiveSetSignalRuleActionResult> {
  const context = await authorizedRuleContext(watchlistId);
  if (!context || !ruleId || ruleId.length > 100) return { ok: false, message: "This signal rule could not be removed." };
  const result = await prisma.marketIqCompetitiveSetSignalRule.deleteMany({
    where: { id: ruleId, organizationId: context.organizationId, userId: context.userId, watchlistId },
  });
  if (!result.count) return { ok: false, message: "This signal rule could not be found." };
  revalidateRulePaths(watchlistId);
  return { ok: true };
}
