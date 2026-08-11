import "server-only";
import { prisma } from "@/lib/prisma";
import { buildSourceRefreshManifest, summarizeSourceRefreshItems, validateTrendRefreshItem, type SourceRefreshTrendRow } from "@/lib/market-iq/source-refresh";
import { refreshPortfolioWatchSignals } from "@/lib/portfolio-iq/watch.server";
import { runPortfolioMonitoringForPortfolio } from "@/lib/portfolio-iq/monitoring-run.server";

export async function createMarketIqSourceRefresh(input: { marketId: string; startedBy: string; triggerKind?: "manual" | "scheduled" | "mcp" }) {
  const portfolios = await prisma.portfolioIqPortfolio.findMany({
    where: { marketId: input.marketId, status: { not: "archived" } },
    include: { assets: { select: { city: true, postalCode: true, assetType: true } } },
  });
  const assets = portfolios.flatMap((portfolio) => portfolio.assets);
  if (!assets.length) throw new Error("No portfolio exposure defines the requested refresh scope.");
  const manifest = buildSourceRefreshManifest(input.marketId, assets);
  return prisma.marketIqSourceRefresh.create({
    data: {
      marketId: input.marketId,
      sourceKind: "trends",
      triggerKind: input.triggerKind ?? "manual",
      status: "awaiting_source",
      requiredManifest: JSON.stringify(manifest),
      requiredGeographies: manifest.length,
      startedBy: input.startedBy,
      items: { create: manifest.map((item) => ({ geographyType: item.geographyType, geographyValue: item.geographyValue, requiredSegments: JSON.stringify(item.requiredSegments) })) },
    },
    include: { items: { orderBy: [{ geographyType: "asc" }, { geographyValue: "asc" }] } },
  });
}

export async function validateRefreshTarget(refreshId: string, geographyType: string, geographyValue: string) {
  return prisma.marketIqSourceRefreshItem.findFirst({
    where: { refreshId, geographyType, geographyValue, refresh: { sourceKind: "trends", status: { in: ["awaiting_source", "receiving"] } } },
    include: { refresh: true },
  });
}

export async function recordTrendRefreshImport(input: {
  refreshId: string;
  geographyType: string;
  geographyValue: string;
  importId: string;
  rows: SourceRefreshTrendRow[];
}) {
  const item = await validateRefreshTarget(input.refreshId, input.geographyType, input.geographyValue);
  if (!item) throw new Error("Refresh target is not awaiting this geography.");
  const requiredSegments = JSON.parse(item.requiredSegments) as Array<{ propertyType: "apartment" | "house"; bedrooms: number }>;
  const validation = validateTrendRefreshItem({ rows: input.rows, requiredSegments });
  await prisma.marketIqSourceRefreshItem.update({
    where: { id: item.id },
    data: {
      status: validation.status,
      importId: input.importId,
      sourceAvailableThrough: validation.availableThrough,
      recordCount: input.rows.length,
      reportableSegments: validation.reportableSegments,
      validation: JSON.stringify({ missingSegments: validation.missingSegments }),
      receivedAt: new Date(),
    },
  });
  const items = await prisma.marketIqSourceRefreshItem.findMany({ where: { refreshId: input.refreshId } });
  const summary = summarizeSourceRefreshItems(items);
  const terminal = summary.pending === 0;
  await prisma.marketIqSourceRefresh.update({
    where: { id: input.refreshId },
    data: {
      status: summary.status,
      receivedGeographies: summary.received,
      recordCount: summary.recordCount,
      sourceAvailableThrough: summary.sourceAvailableThrough,
      completedAt: terminal ? new Date() : null,
    },
  });
  if (!terminal || summary.status !== "complete") return { ...summary, processing: null };

  const portfolios = await prisma.portfolioIqPortfolio.findMany({
    where: { marketId: item.refresh.marketId, status: { not: "archived" } },
    select: { id: true, status: true, launchBriefing: { select: { status: true } } },
  });
  const processed: Array<{ portfolioId: string; watch: boolean; monitoring: boolean; error?: string }> = [];
  for (const portfolio of portfolios) {
    try {
      await refreshPortfolioWatchSignals(portfolio.id);
      const monitoring = portfolio.status === "ready" && portfolio.launchBriefing?.status === "approved";
      if (monitoring) await runPortfolioMonitoringForPortfolio(portfolio.id, { triggerKind: "scheduled" });
      processed.push({ portfolioId: portfolio.id, watch: true, monitoring });
    } catch (error) {
      processed.push({ portfolioId: portfolio.id, watch: false, monitoring: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const failed = processed.filter((result) => result.error);
  if (failed.length) {
    await prisma.marketIqSourceRefresh.update({ where: { id: input.refreshId }, data: { error: JSON.stringify(failed).slice(0, 4_000) } });
  }
  return { ...summary, processing: processed };
}
