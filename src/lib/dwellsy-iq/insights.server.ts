import "server-only";
import { prisma } from "@/lib/prisma";
import { buildSharedExposureDraft, buildSharedInsightDraft } from "@/lib/dwellsy-iq/insights";
import { parseTodaySignalEvidence } from "@/lib/portfolio-iq/today";

export async function syncDwellsyIqInsights(portfolioId: string) {
  const signals = await prisma.portfolioIqSignal.findMany({
    where: { portfolioId },
    include: {
      portfolio: { select: { organizationId: true, marketId: true } },
      asset: { select: { id: true, name: true, city: true, postalCode: true, assetType: true, observedOperatorName: true, compSet: { select: { status: true } }, financialAssumptions: { where: { bedrooms: -1 }, take: 1, select: { reviewStatus: true, affectedUnits: true, conservativePct: true, realizationPct: true, upsidePct: true } } } },
    },
  });
  const alertIds = [...new Set(signals.flatMap((signal) => {
    const id = parseTodaySignalEvidence(signal.evidence).alertId;
    return id ? [id] : [];
  }))];
  const alerts = alertIds.length ? await prisma.marketIqAlert.findMany({
    where: { id: { in: alertIds } },
    select: { id: true, geographyType: true, geographyValue: true, propertyType: true, bedrooms: true, headline: true, narrative: true },
  }) : [];
  const alertById = new Map(alerts.map((alert) => [alert.id, alert]));
  const marketSignalsByAlert = new Map<string, typeof signals>();
  for (const signal of signals) {
    const alertId = parseTodaySignalEvidence(signal.evidence).alertId;
    if (!alertId || !signal.asset) continue;
    marketSignalsByAlert.set(alertId, [...(marketSignalsByAlert.get(alertId) ?? []), signal]);
  }

  for (const signal of signals) {
    const alertId = parseTodaySignalEvidence(signal.evidence).alertId;
    const siblingSignals = alertId ? marketSignalsByAlert.get(alertId) ?? [] : [];
    const exposedAssets = siblingSignals.flatMap((candidate) => candidate.asset ? [{
      id: candidate.asset.id, name: candidate.asset.name, city: candidate.asset.city, postalCode: candidate.asset.postalCode,
      assetType: candidate.asset.assetType, observedOperatorName: candidate.asset.observedOperatorName, relevanceScore: candidate.rankScore,
    }] : []);
    const draft = buildSharedInsightDraft({
      organizationId: signal.portfolio.organizationId,
      portfolioId: signal.portfolioId,
      marketId: signal.portfolio.marketId,
      signal,
      asset: signal.asset,
      alert: alertId ? alertById.get(alertId) ?? null : null,
      exposedAssets,
    });
    const insight = await prisma.dwellsyIqInsight.upsert({
      where: { sourceSignalId: signal.id },
      create: draft,
      update: draft,
      select: { id: true },
    });
    const exposureSignals = siblingSignals.length ? siblingSignals : signal.asset ? [signal] : [];
    const activeAssetIds = exposureSignals.flatMap((candidate) => candidate.asset ? [candidate.asset.id] : []);
    for (const candidate of exposureSignals) {
      if (!candidate.asset) continue;
      let signalEvidence: Record<string, unknown> = {};
      try { signalEvidence = JSON.parse(candidate.evidence) as Record<string, unknown>; } catch { signalEvidence = {}; }
      const assumption = candidate.asset.financialAssumptions[0] ?? null;
      const exposure = buildSharedExposureDraft({
        insightId: insight.id, signalId: candidate.id, asset: candidate.asset, relevanceScore: candidate.rankScore,
        evidence: {
          sourceAlertId: alertId, bedrooms: alertId ? alertById.get(alertId)?.bedrooms ?? null : signalEvidence.bedrooms ?? null,
          geographyType: alertId ? alertById.get(alertId)?.geographyType ?? null : null,
          geographyValue: alertId ? alertById.get(alertId)?.geographyValue ?? null : null,
          compStatus: candidate.asset.compSet?.status ?? null,
          financialSetup: assumption ? { reviewStatus: assumption.reviewStatus, affectedUnits: assumption.affectedUnits, conservativePct: assumption.conservativePct, basePct: assumption.realizationPct, upsidePct: assumption.upsidePct } : null,
        },
      });
      await prisma.dwellsyIqInsightExposure.upsert({
        where: { insightId_assetId: { insightId: insight.id, assetId: candidate.asset.id } },
        create: exposure,
        update: exposure,
      });
    }
    await prisma.dwellsyIqInsightExposure.deleteMany({ where: { insightId: insight.id, ...(activeAssetIds.length ? { assetId: { notIn: activeAssetIds } } : {}) } });
  }
}

export async function loadDwellsyIqInsights(portfolioId: string) {
  const insights = await prisma.dwellsyIqInsight.findMany({
    where: { portfolioId, status: "active" },
    include: {
      exposures: { include: { asset: { select: { id: true, slug: true, name: true, city: true, postalCode: true } } }, orderBy: { relevanceScore: "desc" } },
      sourceSignal: {
        include: {
          asset: { select: { slug: true, name: true, city: true, postalCode: true } },
          decision: { include: { events: { orderBy: { createdAt: "desc" }, take: 5 } } },
        },
      },
    },
    orderBy: [{ rankScore: "desc" }, { observedAt: "desc" }],
  });
  const qualityAlertIds = [...new Set(insights.flatMap((insight) => insight.sourceAlertId ? [insight.sourceAlertId] : []))];
  const qualityAlerts = qualityAlertIds.length ? await prisma.marketIqAlert.findMany({
    where: { id: { in: qualityAlertIds } },
    select: { id: true, sourceImportId: true, geographyType: true, geographyValue: true, propertyType: true, bedrooms: true, observedMonth: true },
  }) : [];
  const trendObservations = qualityAlerts.length ? await prisma.marketIqTrendObservation.findMany({
    where: { OR: qualityAlerts.map((alert) => ({
      importId: alert.sourceImportId,
      geographyType: alert.geographyType,
      geographyValue: alert.geographyValue,
      propertyType: alert.propertyType,
      bedrooms: alert.bedrooms,
      month: alert.observedMonth,
    })) },
    select: { importId: true, geographyType: true, geographyValue: true, propertyType: true, bedrooms: true, month: true, observations: true },
  }) : [];
  const observationKey = (item: { importId: string; geographyType: string; geographyValue: string; propertyType: string; bedrooms: number; month: Date }) =>
    `${item.importId}:${item.geographyType}:${item.geographyValue}:${item.propertyType}:${item.bedrooms}:${item.month.toISOString()}`;
  const observationByKey = new Map(trendObservations.map((item) => [observationKey(item), item.observations]));
  const observationsByAlertId = new Map(qualityAlerts.map((alert) => [alert.id, observationByKey.get(observationKey({
    importId: alert.sourceImportId,
    geographyType: alert.geographyType,
    geographyValue: alert.geographyValue,
    propertyType: alert.propertyType,
    bedrooms: alert.bedrooms,
    month: alert.observedMonth,
  })) ?? null]));
  const now = new Date();
  const actionable = insights.flatMap((insight) => {
    const decision = insight.sourceSignal.decision;
    if (decision?.state === "resolved") return [];
    if (decision?.state === "snoozed" && decision.snoozedUntil && decision.snoozedUntil > now) return [];
    return [{
      ...insight.sourceSignal,
      category: insight.category,
      severity: insight.severity,
      confidence: insight.confidence,
      rankScore: insight.rankScore,
      headline: insight.headline,
      narrative: insight.narrative,
      ownerQuestion: insight.suggestedFollowup,
      observedAt: insight.observedAt,
      firstSeenAt: insight.firstSeenAt,
      lastSeenAt: insight.lastSeenAt,
      resolvedAt: insight.resolvedAt,
      unifiedInsightId: insight.id,
      sourceAlertId: insight.sourceAlertId,
      geographyType: insight.geographyType,
      geographyValue: insight.geographyValue,
      propertyType: insight.propertyType,
      bedrooms: insight.bedrooms,
      qualityObservations: insight.sourceAlertId ? observationsByAlertId.get(insight.sourceAlertId) ?? null : parseTodaySignalEvidence(insight.sourceSignal.evidence).observations,
      evidenceSources: insight.evidenceSources,
      exposures: insight.exposures,
    }];
  });
  const grouped = new Map<string, (typeof actionable)[number]>();
  for (const insight of actionable) {
    const key = insight.category === "market" && insight.sourceAlertId ? `market:${insight.sourceAlertId}` : `insight:${insight.unifiedInsightId}`;
    const existing = grouped.get(key);
    if (!existing) { grouped.set(key, insight); continue; }
    const exposures = new Map([...existing.exposures, ...insight.exposures].map((exposure) => [exposure.assetId, exposure]));
    existing.exposures = [...exposures.values()].sort((left, right) => right.relevanceScore - left.relevanceScore);
    existing.rankScore = Math.max(existing.rankScore, insight.rankScore);
    existing.severity = existing.severity === "high" || insight.severity === "high" ? "high" : existing.severity;
  }
  const portfolioInsights = [...grouped.values()];
  for (const insight of portfolioInsights) {
    if (insight.category !== "market" || insight.exposures.length < 2) continue;
    const alreadyAggregated = insight.headline.endsWith(" portfolio assets exposed");
    const colon = insight.headline.indexOf(": ");
    const withoutAsset = !alreadyAggregated && colon >= 0 ? insight.headline.slice(colon + 2) : insight.headline;
    const baseHeadline = alreadyAggregated ? insight.headline.slice(0, insight.headline.lastIndexOf(": ")) : withoutAsset;
    const baseNarrative = insight.narrative.includes(" portfolio assets are exposed:") ? insight.narrative.slice(0, insight.narrative.indexOf(" portfolio assets are exposed:")).trim() : insight.narrative;
    const names = insight.exposures.slice(0, 3).map((exposure) => exposure.asset.name).join(", ");
    const remaining = insight.exposures.length - 3;
    insight.headline = `${baseHeadline}: ${insight.exposures.length} portfolio assets exposed`;
    insight.narrative = `${baseNarrative} ${insight.exposures.length} portfolio assets are exposed: ${names}${remaining > 0 ? ` and ${remaining} more` : ""}.`;
    insight.ownerQuestion = "Review segment pricing, approved comp position, and operator response across the exposed properties.";
  }
  return portfolioInsights.sort((left, right) => right.rankScore - left.rankScore || right.observedAt.getTime() - left.observedAt.getTime());
}
