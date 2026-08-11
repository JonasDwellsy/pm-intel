import "server-only";
import { loadDwellsyIqInsights } from "@/lib/dwellsy-iq/insights.server";
import { loadOperatorResponseContexts } from "@/lib/dwellsy-iq/operator-response.server";
import { loadClevelandHistoricalPulse } from "@/lib/market-iq/historical.server";
import { loadClevelandTrendPulses } from "@/lib/market-iq/trends.server";
import { prisma } from "@/lib/prisma";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";
import { LAUNCH_BRIEFING_VERSION, parseLaunchBriefingSnapshot, type LaunchBriefingSnapshot } from "@/lib/portfolio-iq/launch-briefing";
import { loadPortfolioIqProperty } from "@/lib/portfolio-iq/property.server";
import { loadPortfolioWatchSignals } from "@/lib/portfolio-iq/watch.server";

export async function buildLaunchBriefingSnapshot(input: { organizationId: string; userId: string }): Promise<LaunchBriefingSnapshot | null> {
  const portfolio = await loadPortfolioIqHome(input);
  if (!portfolio) return null;
  const [historical, trends, unifiedInsights, fallbackSignals, operatorContexts, propertyResults] = await Promise.all([
    loadClevelandHistoricalPulse().catch(() => null),
    loadClevelandTrendPulses().catch(() => []),
    loadDwellsyIqInsights(portfolio.id),
    loadPortfolioWatchSignals(portfolio.id),
    loadOperatorResponseContexts({ marketId: portfolio.marketId, assets: portfolio.assets }),
    Promise.all(portfolio.assets.map((asset) => loadPortfolioIqProperty({ ...input, slug: asset.slug }))),
  ]);
  const signalRows = unifiedInsights.length ? unifiedInsights : fallbackSignals;
  const properties = new Map(propertyResults.flatMap((property) => property ? [[property.asset.id, property] as const] : []));
  const monitoring = portfolio.assets.filter((asset) => ["ready", "monitoring"].includes(asset.readinessStatus)).length;
  const matched = portfolio.assets.filter((asset) => asset.matchStatus === "matched").length;
  const uruCovered = portfolio.assets.filter((asset) => ["observed", "partial"].includes(asset.uruStatus)).length;
  const compsLocked = portfolio.assets.filter((asset) => asset.compSet?.status === "locked").length;
  const openTasks = portfolio.assets.flatMap((asset) => asset.activationTasks).filter((task) => task.status !== "complete").length;
  const marketTrend = trends.find((trend) => trend.trendSource.geographyType === "msa") ?? trends[0] ?? null;
  const readinessPhrase = monitoring === portfolio.assets.length ? "all assets monitoring" : `${monitoring} of ${portfolio.assets.length} assets monitoring`;
  const evidencePhrase = compsLocked ? `${compsLocked} comp ${compsLocked === 1 ? "set is" : "sets are"} locked` : "comparable review is still in progress";

  const assets = portfolio.assets.map((asset) => {
    const property = properties.get(asset.id);
    const operator = operatorContexts.get(asset.id);
    return {
      id: asset.id,
      slug: asset.slug,
      name: asset.name,
      location: `${asset.city}, ${asset.state} ${asset.postalCode}`,
      product: asset.assetType === "single_family" ? "Single-family rental" : "Multifamily",
      buildings: asset.buildings.length,
      readinessStatus: asset.readinessStatus,
      matchStatus: asset.matchStatus,
      uruStatus: asset.uruStatus,
      compStatus: property?.compSet?.status ?? "not_started",
      observationCount: property?.performance.observationCount ?? 0,
      askingRent: property?.performance.askingRent ?? null,
      askingRentVsComps: property?.compSet?.status === "locked" ? property.performance.askingRentVsComps : null,
      observedOperatorName: asset.observedOperatorName,
      operatorStatus: operator?.status ?? "unresolved",
      operatorRank: operator?.status === "matched" && operator.overallRank && operator.overallRankTotal ? `#${operator.overallRank} of ${operator.overallRankTotal}` : null,
    };
  });
  const exceptions = portfolio.assets.flatMap((asset) => {
    const rows: LaunchBriefingSnapshot["exceptions"] = [];
    if (asset.matchStatus !== "matched") rows.push({ assetName: asset.name, type: "Property identity", detail: "Dwellsy is still confirming the property match." });
    if (!["observed", "partial"].includes(asset.uruStatus)) rows.push({ assetName: asset.name, type: "Listing coverage", detail: "URU or listing coverage has not yet been confirmed." });
    if (asset.compSet?.status !== "locked") rows.push({ assetName: asset.name, type: "Comparable review", detail: "The initial comparable set is not yet locked." });
    if (!asset.observedOperatorName) rows.push({ assetName: asset.name, type: "Operator context", detail: "The observed property manager is still being resolved." });
    return rows;
  });
  const sourceAvailableThrough = historical?.historicalSource.availableThrough ?? marketTrend?.trendSource.availableThrough ?? null;
  return {
    version: LAUNCH_BRIEFING_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAvailableThrough,
    portfolio: { id: portfolio.id, name: portfolio.name, marketId: portfolio.marketId, assetCount: portfolio.assets.length, buildingCount: portfolio.assets.reduce((sum, asset) => sum + asset.buildings.length, 0) },
    executiveRead: `${portfolio.name} enters launch with ${readinessPhrase}; ${evidencePhrase}. ${marketTrend?.signal.heading ? `${marketTrend.signal.heading}.` : "Cleveland market evidence is being refreshed."}`,
    readiness: { monitoring, matched, uruCovered, compsLocked, openTasks },
    market: {
      heading: marketTrend?.signal.heading ?? "Cleveland asking-market baseline",
      narrative: marketTrend?.signal.narrative ?? "Market-level trend evidence is awaiting its next source refresh.",
      historicalRead: historical?.decisionRead ?? null,
      sourceLabel: sourceAvailableThrough ? `Asking-market evidence through ${sourceAvailableThrough}` : "Source refresh pending",
    },
    decisions: signalRows.slice(0, 3).map((signal) => ({ signalId: signal.id, assetSlug: signal.asset?.slug ?? null, assetName: signal.asset?.name ?? null, severity: signal.severity, headline: signal.headline, narrative: signal.narrative, ownerQuestion: signal.ownerQuestion })),
    assets,
    exceptions,
  };
}

export async function loadLaunchBriefing(input: { organizationId: string; userId: string }) {
  const live = await buildLaunchBriefingSnapshot(input);
  if (!live) return null;
  const record = await prisma.portfolioIqLaunchBriefing.findUnique({ where: { portfolioId: live.portfolio.id } });
  const approved = record?.status === "approved" ? parseLaunchBriefingSnapshot(record.snapshot) : null;
  return { snapshot: approved ?? live, liveSnapshot: live, record, isApproved: Boolean(approved) };
}
