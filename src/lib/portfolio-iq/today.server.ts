import "server-only";
import { prisma } from "@/lib/prisma";
import { loadClevelandTrendPulses } from "@/lib/market-iq/trends.server";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";
import { loadPortfolioIqProperty } from "@/lib/portfolio-iq/property.server";
import { loadPortfolioDecisionHistory, loadPortfolioWatchSignals } from "@/lib/portfolio-iq/watch.server";
import { selectTodaySignals } from "@/lib/portfolio-iq/today";
import { loadDwellsyIqInsights } from "@/lib/dwellsy-iq/insights.server";
import { loadOperatorResponseContexts } from "@/lib/dwellsy-iq/operator-response.server";
import { calculateFinancialImpact, financialImpactPriority } from "@/lib/portfolio-iq/financial";

export async function loadOwnerToday(input: { organizationId: string; userId: string }) {
  const portfolio = await loadPortfolioIqHome(input);
  if (!portfolio) return null;

  const [unifiedInsights, fallbackSignals, digestPreference, decisionHistory, trendPulses] = await Promise.all([
    loadDwellsyIqInsights(portfolio.id),
    loadPortfolioWatchSignals(portfolio.id),
    prisma.portfolioIqDigestPreference.findUnique({
      where: { portfolioId_userId: { portfolioId: portfolio.id, userId: input.userId } },
    }),
    loadPortfolioDecisionHistory(portfolio.id),
    loadClevelandTrendPulses().catch(() => []),
  ]);
  const signals = unifiedInsights.length ? unifiedInsights : fallbackSignals.map((signal) => ({
    ...signal,
    unifiedInsightId: "",
    sourceAlertId: null,
    geographyType: null,
    geographyValue: null,
    propertyType: null,
    bedrooms: null,
    evidenceSources: "[]",
    exposures: [],
  }));
  const todaySignals = selectTodaySignals(signals, 5);
  const uniqueSlugs = [...new Set(todaySignals.flatMap((signal) => [
    ...(signal.asset?.slug ? [signal.asset.slug] : []),
    ...signal.exposures.map((exposure) => exposure.asset.slug),
  ]))];
  const propertyResults = await Promise.all(uniqueSlugs.map((slug) => loadPortfolioIqProperty({ ...input, slug })));
  const properties = new Map(propertyResults.flatMap((property) => property ? [[property.asset.slug, property] as const] : []));
  const financialAssumptions = await prisma.portfolioIqFinancialAssumption.findMany({
    where: { assetId: { in: propertyResults.flatMap((property) => property ? [property.asset.id] : []) }, bedrooms: -1 },
  });
  const financialAssumptionMap = new Map(financialAssumptions.map((assumption) => [assumption.assetId, assumption]));
  const financialImpacts = propertyResults.flatMap((property) => {
    if (!property) return [];
    const assumption = financialAssumptionMap.get(property.asset.id) ?? null;
    const isSingleFamily = property.asset.assetType === "single_family";
    const impact = calculateFinancialImpact({
      askingRent: property.performance.askingRent,
      compAskingRent: property.performance.compAskingRent,
      observationCount: property.performance.observationCount,
      compCount: property.compSet?.members.length ?? 0,
      compLocked: property.compSet?.status === "locked",
      inventoryUnits: assumption?.inventoryUnits ?? property.asset.unitCount ?? (isSingleFamily ? 1 : null),
      affectedUnits: assumption?.affectedUnits ?? (isSingleFamily ? 1 : null),
      realizationPct: assumption?.realizationPct ?? 0.5,
      assumptionSource: assumption ? "owner" : isSingleFamily ? "single_family_default" : "missing",
    });
    const signal = todaySignals.find((candidate) => candidate.assetId === property.asset.id) ?? null;
    return [{ property: property.asset, impact, signal, priority: financialImpactPriority(impact) }];
  }).sort((left, right) => right.priority - left.priority);
  const operatorResponses = await loadOperatorResponseContexts({
    marketId: portfolio.marketId,
    assets: portfolio.assets,
  });

  return { portfolio, signals, todaySignals, digestPreference, decisionHistory, trendPulses, properties, operatorResponses, financialImpacts };
}
