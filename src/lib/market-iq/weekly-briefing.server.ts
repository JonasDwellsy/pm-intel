import "server-only";
import type { MarketEntitlement } from "@/lib/auth/market-entitlements";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { rankMarketIqHomeMarkets } from "@/lib/market-iq/home-summary";
import { loadMarketIqMarketSummaries } from "@/lib/market-iq/market-summary.server";
import { buildMarketIqWeeklyBriefing, parseMarketIqEditionComparison } from "@/lib/market-iq/weekly-briefing";
import { prisma } from "@/lib/prisma";

export async function loadMarketIqWeeklyBriefing(input: {
  organizationId: string;
  entitlement: MarketEntitlement;
  clientAdvisoryEnabled: boolean;
}) {
  const entitledMarkets = listEntitledMarketIqMarkets(input.entitlement);
  const workspace = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      name: true,
      brandProfile: true,
      marketIqMarketPreferences: true,
      marketIqEditionDrafts: {
        where: { status: { in: ["ready", "reviewing"] } },
        orderBy: { detectedAt: "desc" },
        select: { id: true, marketId: true, periodEnd: true, materialChangeCount: true, comparison: true },
      },
      marketIqReports: {
        where: { status: "published" },
        orderBy: { publishedAt: "desc" },
        select: { marketId: true, publishedAt: true },
      },
    },
  });
  if (!workspace) return null;

  const summaryByMarket = await loadMarketIqMarketSummaries(entitledMarkets.map((market) => market.id));
  const draftByMarket = new Map(workspace.marketIqEditionDrafts.map((draft) => [draft.marketId, draft]));
  const preferenceByMarket = new Map(workspace.marketIqMarketPreferences.map((preference) => [preference.marketId, preference]));
  const latestReportByMarket = new Map<string, Date>();
  for (const report of workspace.marketIqReports) {
    if (report.publishedAt && !latestReportByMarket.has(report.marketId)) latestReportByMarket.set(report.marketId, report.publishedAt);
  }

  const summaries = rankMarketIqHomeMarkets(entitledMarkets.map((market) => {
    const marketSummary = summaryByMarket.get(market.id) ?? null;
    const preference = preferenceByMarket.get(market.id);
    return {
      market,
      marketSummary,
      source: marketSummary ? "dwellsy_trends" : "unavailable",
      configured: Boolean(preference?.configuredAt),
      recurringEnabled: Boolean(preference?.recurringEditionsEnabled),
      draft: draftByMarket.get(market.id) ?? null,
      latestPublishedAt: latestReportByMarket.get(market.id) ?? null,
      clientAdvisoryEnabled: input.clientAdvisoryEnabled,
    };
  }));
  return {
    summaries,
    briefing: buildMarketIqWeeklyBriefing(summaries.map((summary) => ({
      summary,
      comparison: parseMarketIqEditionComparison(draftByMarket.get(summary.market.id)?.comparison),
    }))),
  };
}
