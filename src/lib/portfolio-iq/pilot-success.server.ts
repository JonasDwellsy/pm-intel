import "server-only";
import { prisma } from "@/lib/prisma";
import { buildPilotSuccess } from "@/lib/portfolio-iq/pilot-success";
import { pilotInterventionPriority } from "@/lib/portfolio-iq/pilot-interventions";

export async function loadPilotSuccessCockpit(now = new Date()) {
  const portfolios = await prisma.portfolioIqPortfolio.findMany({
    where: { status: { not: "archived" } },
    include: {
      organization: { select: { name: true, _count: { select: { memberships: true } } } },
      assets: { select: { readinessStatus: true } },
      pilotAcceptance: true,
      pilotEngagements: { orderBy: { firstViewedAt: "asc" } },
      findingFeedback: { select: { rating: true, reviewedAt: true } },
      signals: { select: { decision: { select: { actionPlan: true } } } },
      pmBriefs: { where: { status: { not: "revoked" } }, select: { deliveryStatus: true, response: { select: { submittedAt: true } } } },
      outcomeReviews: { where: { status: "reviewed" }, select: { reviewedAt: true } },
      digestPreferences: { select: { deliveries: { select: { status: true, deliveredAt: true } } } },
      pilotCorrections: { where: { status: { not: "complete" } }, select: { id: true } },
      pilotSuccessPlan: true,
      pilotInterventions: { orderBy: { createdAt: "desc" }, take: 20 },
      emailEvents: { orderBy: { occurredAt: "desc" }, take: 20 },
    },
    orderBy: { updatedAt: "desc" },
  });
  return portfolios.map((portfolio) => {
    const engagements = portfolio.pilotEngagements;
    const firstViewedAt = engagements.length ? engagements.reduce((first, item) => item.firstViewedAt < first ? item.firstViewedAt : first, engagements[0].firstViewedAt) : null;
    const lastViewedAt = engagements.length ? engagements.reduce((last, item) => item.lastViewedAt > last ? item.lastViewedAt : last, engagements[0].lastViewedAt) : null;
    const decisions = portfolio.signals.flatMap((signal) => signal.decision ? [signal.decision] : []);
    const deliveries = portfolio.digestPreferences.flatMap((preference) => preference.deliveries);
    const success = buildPilotSuccess({
      now,
      createdAt: portfolio.createdAt,
      assetCount: portfolio.assets.length,
      readyAssetCount: portfolio.assets.filter((asset) => ["ready", "monitoring"].includes(asset.readinessStatus)).length,
      acceptedAt: portfolio.pilotAcceptance?.acceptedAt ?? null,
      firstViewedAt,
      lastViewedAt,
      viewCount: engagements.reduce((sum, item) => sum + item.viewCount, 0),
      findingRatings: portfolio.findingFeedback.length,
      usefulRatings: portfolio.findingFeedback.filter((item) => item.rating === "useful").length,
      decisionCount: decisions.length,
      actionPlanCount: decisions.filter((item) => Boolean(item.actionPlan)).length,
      pmBriefSentCount: portfolio.pmBriefs.filter((item) => item.deliveryStatus === "sent").length,
      pmResponseCount: portfolio.pmBriefs.filter((item) => Boolean(item.response)).length,
      outcomeCount: portfolio.outcomeReviews.length,
      digestDeliveredCount: deliveries.filter((item) => item.status === "delivered" || Boolean(item.deliveredAt)).length,
      failedDeliveryCount: deliveries.filter((item) => item.status === "failed").length + portfolio.pmBriefs.filter((item) => item.deliveryStatus === "failed").length,
      openCorrectionCount: portfolio.pilotCorrections.length,
    });
    const firstUseful = portfolio.findingFeedback.filter((item) => item.rating === "useful").sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime())[0]?.reviewedAt ?? null;
    const interventions = portfolio.pilotInterventions.map((item) => ({
      ...item,
      priority: pilotInterventionPriority(item, now),
    }));
    const checkInOverdue = Boolean(portfolio.pilotSuccessPlan?.nextCheckInAt && portfolio.pilotSuccessPlan.nextCheckInAt.getTime() < now.getTime());
    const activity = [
      ...interventions.map((item) => ({ activityType: "intervention" as const, occurredAt: item.createdAt, ...item })),
      ...portfolio.emailEvents.map((item) => ({ activityType: "email" as const, ...item })),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 25);
    return {
      id: portfolio.id,
      name: portfolio.name,
      organization: portfolio.organization.name,
      marketId: portfolio.marketId,
      ownerUsers: portfolio.organization._count.memberships,
      firstViewedAt,
      lastViewedAt,
      firstUsefulAt: firstUseful,
      openCorrections: portfolio.pilotCorrections.length,
      successPlan: portfolio.pilotSuccessPlan,
      interventions,
      openInterventionCount: interventions.filter((item) => item.status !== "completed").length,
      overdueInterventionCount: interventions.filter((item) => item.priority === "overdue").length,
      checkInOverdue,
      activity,
      deliveredEmailCount: portfolio.emailEvents.filter((item) => item.eventType === "delivered").length,
      clickedEmailCount: portfolio.emailEvents.filter((item) => item.eventType === "click").length,
      directionalOpenCount: portfolio.emailEvents.filter((item) => item.eventType === "open").length,
      failedEmailCount: portfolio.emailEvents.filter((item) => ["bounce", "dropped", "spamreport", "unsubscribe"].includes(item.eventType)).length,
      ...success,
    };
  });
}
