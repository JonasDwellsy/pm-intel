import "server-only";

import { parseMarketIqCompetitiveSetSignalRuleInput, type MarketIqCompetitiveSetSignalRuleView } from "@/lib/market-iq/competitive-set-signal-rules";
import { prisma } from "@/lib/prisma";

export async function loadMarketIqCompetitiveSetSignalRules(input: {
  organizationId: string;
  userId: string;
  watchlistId: string;
}): Promise<MarketIqCompetitiveSetSignalRuleView[]> {
  const rows = await prisma.marketIqCompetitiveSetSignalRule.findMany({
    where: input,
    orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
  });
  return rows.flatMap((row) => {
    const parsed = parseMarketIqCompetitiveSetSignalRuleInput({
      eventType: row.eventType,
      propertyScope: row.propertyScope,
      windowDays: row.windowDays,
      condition: row.condition,
      threshold: row.threshold,
      enabled: row.enabled,
    });
    return parsed.ok ? [{
      id: row.id,
      watchlistId: row.watchlistId,
      ...parsed.value,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }] : [];
  });
}
