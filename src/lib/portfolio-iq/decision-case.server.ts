import "server-only";
import { prisma } from "@/lib/prisma";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";
import { loadPortfolioIqProperty } from "@/lib/portfolio-iq/property.server";
import { loadOperatorResponseContexts } from "@/lib/dwellsy-iq/operator-response.server";
import { loadClevelandTrendPulses } from "@/lib/market-iq/trends.server";
import type { DecisionBaselineSnapshot } from "@/lib/portfolio-iq/decision-case";

export async function loadDecisionCase(input: { organizationId: string; userId: string; signalId: string }) {
  const portfolio = await loadPortfolioIqHome(input);
  if (!portfolio) return null;
  const signal = await prisma.portfolioIqSignal.findFirst({
    where: { id: input.signalId, portfolioId: portfolio.id },
    include: {
      asset: { select: { id: true, slug: true, name: true, city: true, postalCode: true, observedOperatorName: true } },
      decision: { include: { events: { orderBy: { createdAt: "desc" }, take: 25 } } },
      unifiedInsight: { select: { id: true, evidenceSources: true, geographyType: true, geographyValue: true, propertyType: true, bedrooms: true } },
    },
  });
  if (!signal) return null;
  const [property, operatorResponses, trendPulses] = await Promise.all([
    signal.asset?.slug ? loadPortfolioIqProperty({ ...input, slug: signal.asset.slug }) : null,
    loadOperatorResponseContexts({ marketId: portfolio.marketId, assets: portfolio.assets }),
    loadClevelandTrendPulses().catch(() => []),
  ]);
  return {
    portfolio,
    signal,
    property,
    operatorResponse: signal.assetId ? operatorResponses.get(signal.assetId) ?? null : null,
    trendPulses,
  };
}

export function buildDecisionBaseline(caseData: NonNullable<Awaited<ReturnType<typeof loadDecisionCase>>>, capturedAt: Date): DecisionBaselineSnapshot {
  const { signal, property, operatorResponse } = caseData;
  let sources: string[] = [];
  try { sources = signal.unifiedInsight ? JSON.parse(signal.unifiedInsight.evidenceSources) as string[] : []; } catch { sources = []; }
  return {
    version: 1,
    capturedAt: capturedAt.toISOString(),
    signal: {
      headline: signal.headline,
      narrative: signal.narrative,
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
    property: property ? {
      availableThrough: property.availableThrough?.toISOString() ?? null,
      askingRent: property.performance.askingRent,
      askingRentChange90d: property.performance.askingRentChange90d,
      medianDom: property.performance.medianDom,
      observationCount: property.performance.observationCount,
      compStatus: property.compSet?.status ?? null,
      compCount: property.compSet?.members.length ?? 0,
    } : null,
    operator: operatorResponse ? {
      status: operatorResponse.status,
      operatorName: operatorResponse.operatorName,
      dataAsOf: operatorResponse.dataAsOf,
      overallRank: operatorResponse.overallRank,
      overallRankTotal: operatorResponse.overallRankTotal,
      leaseUpDom: operatorResponse.leaseUpDom,
      t12Listings: operatorResponse.t12Listings,
    } : null,
  };
}
