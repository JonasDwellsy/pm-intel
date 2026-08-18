import "server-only";
import type { MarketEntitlement } from "@/lib/auth/market-entitlements";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { rankMarketIqHomeMarkets } from "@/lib/market-iq/home-summary";
import { buildMarketIqComposerPreview, defaultMarketIqReportBrand } from "@/lib/market-iq/report/composer.server";
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

  const brand = workspace.brandProfile ?? defaultMarketIqReportBrand(workspace.name);
  const snapshots = await Promise.all(entitledMarkets.map(async (market) => {
    try {
      const preview = await buildMarketIqComposerPreview(market.id, brand);
      return { marketId: market.id, snapshot: preview.snapshot, source: preview.source as "dwellsy_trends" | "verified_seed" };
    } catch {
      return { marketId: market.id, snapshot: null, source: "unavailable" as const };
    }
  }));
  const snapshotByMarket = new Map(snapshots.map((item) => [item.marketId, item]));
  const draftByMarket = new Map(workspace.marketIqEditionDrafts.map((draft) => [draft.marketId, draft]));
  const preferenceByMarket = new Map(workspace.marketIqMarketPreferences.map((preference) => [preference.marketId, preference]));
  const latestReportByMarket = new Map<string, Date>();
  for (const report of workspace.marketIqReports) {
    if (report.publishedAt && !latestReportByMarket.has(report.marketId)) latestReportByMarket.set(report.marketId, report.publishedAt);
  }

  const summaries = rankMarketIqHomeMarkets(entitledMarkets.map((market) => {
    const source = snapshotByMarket.get(market.id);
    const preference = preferenceByMarket.get(market.id);
    return {
      market,
      snapshot: source?.snapshot ?? null,
      source: source?.source ?? "unavailable",
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
