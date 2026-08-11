import "server-only";
import { prisma } from "@/lib/prisma";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";
import { loadPortfolioIqProperty } from "@/lib/portfolio-iq/property.server";
import { loadOperatorResponseContexts } from "@/lib/dwellsy-iq/operator-response.server";
import { loadClevelandTrendPulses } from "@/lib/market-iq/trends.server";
import { loadDwellsyIqInsights } from "@/lib/dwellsy-iq/insights.server";
import type { DecisionBaselineSnapshot } from "@/lib/portfolio-iq/decision-case";

export async function loadDecisionCase(input: { organizationId: string; userId: string; signalId: string }) {
  const portfolio = await loadPortfolioIqHome(input);
  if (!portfolio) return null;
  const signal = await prisma.portfolioIqSignal.findFirst({
    where: { id: input.signalId, portfolioId: portfolio.id },
    include: {
      asset: { select: { id: true, slug: true, name: true, city: true, postalCode: true, observedOperatorName: true } },
      decision: { include: { events: { orderBy: { createdAt: "desc" }, take: 25 } } },
      unifiedInsight: {
        select: {
          id: true,
          sourceAlertId: true,
          evidenceSources: true,
          geographyType: true,
          geographyValue: true,
          propertyType: true,
          bedrooms: true,
          exposures: {
            orderBy: { relevanceScore: "desc" },
            select: {
              relevanceScore: true,
              asset: { select: { id: true, slug: true, name: true, city: true, postalCode: true, observedOperatorName: true } },
            },
          },
        },
      },
    },
  });
  if (!signal) return null;
  const sharedInsight = (await loadDwellsyIqInsights(portfolio.id)).find((insight) =>
    insight.id === signal.id || Boolean(signal.unifiedInsight?.sourceAlertId && insight.sourceAlertId === signal.unifiedInsight.sourceAlertId)
  ) ?? null;
  const exposureAssets = sharedInsight?.exposures.length
    ? sharedInsight.exposures.map((exposure) => ({
        relevanceScore: exposure.relevanceScore,
        asset: { ...exposure.asset, observedOperatorName: exposure.operatorName },
      }))
    : signal.unifiedInsight?.exposures.length
      ? signal.unifiedInsight.exposures
    : signal.asset
      ? [{ relevanceScore: signal.rankScore, asset: signal.asset }]
      : [];
  const [exposureProperties, operatorResponses, trendPulses] = await Promise.all([
    Promise.all(exposureAssets.map((exposure) => loadPortfolioIqProperty({ ...input, slug: exposure.asset.slug }))),
    loadOperatorResponseContexts({ marketId: portfolio.marketId, assets: portfolio.assets }),
    loadClevelandTrendPulses().catch(() => []),
  ]);
  const exposureContexts = exposureAssets.map((exposure, index) => ({
    ...exposure,
    property: exposureProperties[index],
    operatorResponse: operatorResponses.get(exposure.asset.id) ?? null,
  }));
  const primaryContext = signal.assetId
    ? exposureContexts.find((exposure) => exposure.asset.id === signal.assetId) ?? exposureContexts[0] ?? null
    : exposureContexts[0] ?? null;
  return {
    portfolio,
    signal,
    displayInsight: sharedInsight ? { headline: sharedInsight.headline, narrative: sharedInsight.narrative, ownerQuestion: sharedInsight.ownerQuestion } : { headline: signal.headline, narrative: signal.narrative, ownerQuestion: signal.ownerQuestion },
    property: primaryContext?.property ?? null,
    operatorResponse: primaryContext?.operatorResponse ?? null,
    exposureContexts,
    trendPulses,
  };
}

export function buildDecisionBaseline(caseData: NonNullable<Awaited<ReturnType<typeof loadDecisionCase>>>, capturedAt: Date): DecisionBaselineSnapshot {
  const { signal, property, operatorResponse } = caseData;
  let sources: string[] = [];
  try { sources = signal.unifiedInsight ? JSON.parse(signal.unifiedInsight.evidenceSources) as string[] : []; } catch { sources = []; }
  const propertySnapshot = property ? {
    availableThrough: property.availableThrough?.toISOString() ?? null,
    askingRent: property.performance.askingRent,
    askingRentChange90d: property.performance.askingRentChange90d,
    medianDom: property.performance.medianDom,
    observationCount: property.performance.observationCount,
    compStatus: property.compSet?.status ?? null,
    compCount: property.compSet?.members.length ?? 0,
  } : null;
  const operatorSnapshot = operatorResponse ? {
    status: operatorResponse.status,
    operatorName: operatorResponse.operatorName,
    dataAsOf: operatorResponse.dataAsOf,
    overallRank: operatorResponse.overallRank,
    overallRankTotal: operatorResponse.overallRankTotal,
    leaseUpDom: operatorResponse.leaseUpDom,
    t12Listings: operatorResponse.t12Listings,
  } : null;
  return {
    version: 1,
    capturedAt: capturedAt.toISOString(),
    signal: {
      headline: caseData.displayInsight.headline,
      narrative: caseData.displayInsight.narrative,
      category: signal.category,
      severity: signal.severity,
      confidence: signal.confidence,
      observedAt: signal.observedAt.toISOString(),
      evidence: signal.evidence,
    },
    asset: signal.asset ? {
      name: signal.asset.name,
      city: signal.asset.city,
      postalCode: signal.asset.postalCode,
      observedOperatorName: signal.asset.observedOperatorName,
    } : null,
    sources,
    property: propertySnapshot,
    operator: operatorSnapshot,
    exposures: caseData.exposureContexts.map((exposure) => ({
      asset: exposure.asset,
      relevanceScore: exposure.relevanceScore,
      property: exposure.property ? {
        availableThrough: exposure.property.availableThrough?.toISOString() ?? null,
        askingRent: exposure.property.performance.askingRent,
        askingRentChange90d: exposure.property.performance.askingRentChange90d,
        medianDom: exposure.property.performance.medianDom,
        observationCount: exposure.property.performance.observationCount,
        compStatus: exposure.property.compSet?.status ?? null,
        compCount: exposure.property.compSet?.members.length ?? 0,
      } : null,
      operator: exposure.operatorResponse ? {
        status: exposure.operatorResponse.status,
        operatorName: exposure.operatorResponse.operatorName,
        dataAsOf: exposure.operatorResponse.dataAsOf,
        overallRank: exposure.operatorResponse.overallRank,
        overallRankTotal: exposure.operatorResponse.overallRankTotal,
        leaseUpDom: exposure.operatorResponse.leaseUpDom,
        t12Listings: exposure.operatorResponse.t12Listings,
      } : null,
    })),
  };
}
