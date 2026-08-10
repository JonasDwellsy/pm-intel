import "server-only";
import { prisma } from "@/lib/prisma";
import { buildSharedExposureDraft, buildSharedInsightDraft } from "@/lib/dwellsy-iq/insights";
import { parseTodaySignalEvidence } from "@/lib/portfolio-iq/today";

export async function syncDwellsyIqInsights(portfolioId: string) {
  const signals = await prisma.portfolioIqSignal.findMany({
    where: { portfolioId },
    include: {
      portfolio: { select: { organizationId: true, marketId: true } },
      asset: { select: { id: true, name: true, city: true, postalCode: true, assetType: true, observedOperatorName: true } },
    },
  });
  const alertIds = [...new Set(signals.flatMap((signal) => {
    const id = parseTodaySignalEvidence(signal.evidence).alertId;
    return id ? [id] : [];
  }))];
  const alerts = alertIds.length ? await prisma.marketIqAlert.findMany({
    where: { id: { in: alertIds } },
    select: { id: true, geographyType: true, geographyValue: true, propertyType: true, bedrooms: true },
  }) : [];
  const alertById = new Map(alerts.map((alert) => [alert.id, alert]));

  for (const signal of signals) {
    const alertId = parseTodaySignalEvidence(signal.evidence).alertId;
    const draft = buildSharedInsightDraft({
      organizationId: signal.portfolio.organizationId,
      portfolioId: signal.portfolioId,
      marketId: signal.portfolio.marketId,
      signal,
      asset: signal.asset,
      alert: alertId ? alertById.get(alertId) ?? null : null,
    });
    const insight = await prisma.dwellsyIqInsight.upsert({
      where: { sourceSignalId: signal.id },
      create: draft,
      update: draft,
      select: { id: true },
    });
    if (signal.asset) {
      const exposure = buildSharedExposureDraft({ insightId: insight.id, signalId: signal.id, asset: signal.asset, relevanceScore: signal.rankScore });
      await prisma.dwellsyIqInsightExposure.upsert({
        where: { insightId_assetId: { insightId: insight.id, assetId: signal.asset.id } },
        create: exposure,
        update: exposure,
      });
    }
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
  const now = new Date();
  return insights.flatMap((insight) => {
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
      evidenceSources: insight.evidenceSources,
      exposures: insight.exposures,
    }];
  });
}
