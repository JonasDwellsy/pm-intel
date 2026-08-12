import "server-only";
import { prisma } from "@/lib/prisma";
import { loadClevelandTrendPulses } from "@/lib/market-iq/trends.server";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";
import { loadPortfolioIqProperty } from "@/lib/portfolio-iq/property.server";
import { loadPortfolioDecisionHistory, loadPortfolioWatchSignals } from "@/lib/portfolio-iq/watch.server";
import { buildOwnerAttentionQueue } from "@/lib/portfolio-iq/today";
import { loadDwellsyIqInsights } from "@/lib/dwellsy-iq/insights.server";
import { loadOperatorResponseContexts } from "@/lib/dwellsy-iq/operator-response.server";
import { calculateFinancialImpact, financialImpactPriority } from "@/lib/portfolio-iq/financial";

export async function loadOwnerToday(input: { organizationId: string; userId: string; portfolioId?: string }) {
  const portfolio = await loadPortfolioIqHome(input);
  if (!portfolio) return null;

  const [unifiedInsights, fallbackSignals, digestPreference, decisionHistory, trendPulses, findingFeedback, findingCalibrations] = await Promise.all([
    loadDwellsyIqInsights(portfolio.id),
    loadPortfolioWatchSignals(portfolio.id),
    prisma.portfolioIqDigestPreference.findUnique({
      where: { portfolioId_userId: { portfolioId: portfolio.id, userId: input.userId } },
    }),
    loadPortfolioDecisionHistory(portfolio.id),
    loadClevelandTrendPulses().catch(() => []),
    prisma.portfolioIqFindingFeedback.findMany({
      where: { portfolioId: portfolio.id, userId: input.userId },
      orderBy: { reviewedAt: "desc" },
    }),
    prisma.portfolioIqFindingCalibration.findMany({ where: { portfolioId: portfolio.id } }),
  ]);
  const allSignals = unifiedInsights.length ? unifiedInsights : fallbackSignals.map((signal) => ({
    ...signal,
    unifiedInsightId: "",
    sourceAlertId: null,
    geographyType: null,
    geographyValue: null,
    propertyType: null,
    bedrooms: null,
    qualityObservations: null,
    evidenceSources: "[]",
    exposures: [],
  }));
  const feedbackBySignalId = new Map(findingFeedback.map((item) => [item.signalId, item]));
  const signals = allSignals.filter((signal) => !feedbackBySignalId.get(signal.id)?.suppressFromQueue);
  const hiddenSignals = allSignals.flatMap((signal) => {
    const feedback = feedbackBySignalId.get(signal.id);
    return feedback?.suppressFromQueue ? [{ signal, feedback }] : [];
  });
  const uniqueSlugs = [...new Set(allSignals.flatMap((signal) => [
    ...(signal.asset?.slug ? [signal.asset.slug] : []),
    ...signal.exposures.map((exposure) => exposure.asset.slug),
  ]))];
  const propertyResults = await Promise.all(uniqueSlugs.map((slug) => loadPortfolioIqProperty({ ...input, slug })));
  const properties = new Map(propertyResults.flatMap((property) => property ? [[property.asset.slug, property] as const] : []));
  const financialAssumptions = await prisma.portfolioIqFinancialAssumption.findMany({
    where: { assetId: { in: propertyResults.flatMap((property) => property ? [property.asset.id] : []) }, bedrooms: -1 },
  });
  const financialAssumptionMap = new Map(financialAssumptions.map((assumption) => [assumption.assetId, assumption]));
  const financialResults = propertyResults.flatMap((property) => {
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
    return [{ property: property.asset, impact, priority: financialImpactPriority(impact) }];
  });
  const annualFinancialExposureByAssetId = new Map(financialResults.flatMap((item) =>
    item.impact.status === "estimated" && item.impact.annualRealizationAdjusted !== null
      ? [[item.property.id, Math.abs(item.impact.annualRealizationAdjusted)] as const]
      : []
  ));
  const calibrationAdjustments = new Map(findingCalibrations.map((item) => [`${item.scopeKind}:${item.scopeValue}`, item.scoreAdjustment]));
  const attentionQueue = buildOwnerAttentionQueue(signals, { limit: 3, annualFinancialExposureByAssetId, calibrationAdjustments });
  const todaySignals = attentionQueue.today;
  const financialImpacts = financialResults.map((item) => ({
    ...item,
    signal: todaySignals.find((candidate) => candidate.assetId === item.property.id || candidate.exposures.some((exposure) => exposure.assetId === item.property.id)) ?? null,
  })).sort((left, right) => right.priority - left.priority);
  const operatorResponses = await loadOperatorResponseContexts({
    marketId: portfolio.marketId,
    assets: portfolio.assets,
  });

  return { portfolio, signals, todaySignals, attentionQueue, digestPreference, decisionHistory, trendPulses, properties, operatorResponses, financialImpacts, findingFeedback, feedbackBySignalId, hiddenSignals, findingCalibrations };
}
