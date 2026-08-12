import "server-only";
import { prisma } from "@/lib/prisma";
import { loadDecisionLedger } from "@/lib/portfolio-iq/decision-ledger.server";
import { loadPortfolioIqCollaboration } from "@/lib/portfolio-iq/collaboration.server";
import { loadPortfolioIqOutcomes } from "@/lib/portfolio-iq/outcome-review.server";
import { buildPilotValueReview, parsePilotValueReview, pilotValueReviewKey } from "@/lib/portfolio-iq/pilot-value-review";

export async function loadPilotValueReview(input: { organizationId: string; userId: string; now?: Date; periodDays?: number }) {
  const now = input.now ?? new Date();
  const periodDays = Math.min(90, Math.max(7, input.periodDays ?? 30));
  const periodStart = new Date(now.getTime() - periodDays * 86_400_000);
  const [ledger, collaboration, outcomes] = await Promise.all([
    loadDecisionLedger({ ...input, now }),
    loadPortfolioIqCollaboration(input),
    loadPortfolioIqOutcomes(input),
  ]);
  if (!ledger || !collaboration || !outcomes) return null;
  const portfolioId = ledger.portfolio.id;
  const [portfolio, feedback, signals, decisions, closedLoops, responses, reviewedOutcomes, engagements, emailEvents, priorReviews] = await Promise.all([
    prisma.portfolioIqPortfolio.findFirst({ where: { id: portfolioId, organizationId: input.organizationId }, include: { _count: { select: { assets: true } }, pilotSuccessPlan: true, organization: { select: { _count: { select: { memberships: true } } } } } }),
    prisma.portfolioIqFindingFeedback.findMany({ where: { portfolioId, reviewedAt: { gte: periodStart, lte: now } }, select: { rating: true } }),
    prisma.portfolioIqSignal.count({ where: { portfolioId, observedAt: { gte: periodStart, lte: now } } }),
    prisma.portfolioIqSignalDecision.findMany({ where: { signal: { portfolioId }, decidedAt: { gte: periodStart, lte: now } }, select: { id: true, actionPlan: true, signalId: true } }),
    prisma.portfolioIqSignalDecisionEvent.findMany({
      where: { decision: { signal: { portfolioId } }, toState: "resolved", createdAt: { gte: periodStart, lte: now } },
      select: { decisionId: true },
    }),
    prisma.portfolioIqPmBriefResponse.findMany({ where: { brief: { portfolioId }, submittedAt: { gte: periodStart, lte: now } }, select: { ownerDisposition: true, submittedAt: true, brief: { select: { deliveredAt: true, acceptedAt: true, publishedAt: true } } } }),
    prisma.portfolioIqOutcomeReview.findMany({ where: { portfolioId, status: "reviewed", reviewedAt: { gte: periodStart, lte: now } }, select: { conclusion: true, implementationStatus: true } }),
    prisma.portfolioIqPilotEngagement.findMany({ where: { portfolioId }, select: { userId: true, viewCount: true, lastViewedAt: true } }),
    prisma.portfolioIqEmailEvent.findMany({ where: { portfolioId, occurredAt: { gte: periodStart, lte: now }, eventType: { in: ["delivered", "click"] } }, select: { eventType: true } }),
    prisma.portfolioIqPilotValueReview.findMany({ where: { portfolioId, organizationId: input.organizationId }, orderBy: { finalizedAt: "desc" }, take: 6 }),
  ]);
  if (!portfolio) return null;
  const useful = feedback.filter((item) => item.rating === "useful").length;
  const periodSignalIds = new Set(decisions.map((item) => item.signalId));
  const actionLinkedByAsset = new Map<string, number>();
  for (const row of ledger.rows) {
    if (!periodSignalIds.has(row.signalId)) continue;
    if (!row.actionPlan) continue;
    for (const priority of row.financialPriorities) actionLinkedByAsset.set(priority.assetId, Math.max(actionLinkedByAsset.get(priority.assetId) ?? 0, priority.amount));
  }
  const responseDays = responses.flatMap((response) => {
    const start = response.brief.deliveredAt ?? response.brief.acceptedAt ?? response.brief.publishedAt;
    return start ? [Math.max(0, (response.submittedAt.getTime() - start.getTime()) / 86_400_000)] : [];
  }).sort((a, b) => a - b);
  const medianResponseDays = responseDays.length ? responseDays.length % 2 ? responseDays[Math.floor(responseDays.length / 2)] : (responseDays[responseDays.length / 2 - 1] + responseDays[responseDays.length / 2]) / 2 : null;
  const latestViewAt = engagements.map((item) => item.lastViewedAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const snapshot = buildPilotValueReview({
    generatedAt: now.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    portfolio: { id: portfolio.id, name: portfolio.name, marketId: portfolio.marketId, assetCount: portfolio._count.assets },
    successGoal: portfolio.pilotSuccessPlan?.successGoal ?? null,
    adoption: {
      authorizedUsers: portfolio.organization._count.memberships,
      workspaceUsers: engagements.filter((item) => item.lastViewedAt >= periodStart && item.lastViewedAt <= now).length,
      workspaceViews: engagements.reduce((sum, item) => sum + item.viewCount, 0),
      latestViewAt: latestViewAt?.toISOString() ?? null,
      deliveredBriefings: emailEvents.filter((item) => item.eventType === "delivered").length,
      observedClicks: emailEvents.filter((item) => item.eventType === "click").length,
    },
    findings: { surfaced: signals, rated: feedback.length, useful, usefulRate: feedback.length ? useful / feedback.length : null },
    decisions: {
      opened: decisions.length,
      active: ledger.summary.activeDecisions,
      actionPlans: decisions.filter((item) => Boolean(item.actionPlan)).length,
      loopsClosed: new Set(closedLoops.map((item) => item.decisionId)).size,
      attentionNow: ledger.summary.attentionNow,
    },
    collaboration: { pmResponses: responses.length, acceptedPlans: responses.filter((item) => item.ownerDisposition === "accepted").length, medianResponseDays },
    outcomes: {
      reviewed: reviewedOutcomes.length,
      improved: reviewedOutcomes.filter((item) => item.conclusion === "improved").length,
      worsened: reviewedOutcomes.filter((item) => item.conclusion === "worsened").length,
      inconclusive: reviewedOutcomes.filter((item) => item.conclusion === "inconclusive" || item.conclusion === "unchanged").length,
      implementationConfirmed: reviewedOutcomes.filter((item) => ["completed", "partially_completed"].includes(item.implementationStatus ?? "")).length,
    },
    financial: { askingRentPriority: ledger.summary.askingRentPriority, financiallyPrioritizedAssets: ledger.summary.financiallyPrioritizedAssets, actionLinkedPriority: [...actionLinkedByAsset.values()].reduce((sum, amount) => sum + amount, 0) },
    unresolved: [
      { label: "Decisions needing attention", count: ledger.summary.attentionNow, href: "/portfolio-iq/decision-ledger" },
      { label: "PM responses overdue", count: collaboration.overdue.length, href: "/portfolio-iq/collaboration" },
      { label: "Outcome reviews due", count: outcomes.dueCount, href: "/portfolio-iq/outcomes" },
    ],
  });
  return { snapshot, reviewKey: pilotValueReviewKey(snapshot), priorReviews: priorReviews.flatMap((review) => { const parsed = parsePilotValueReview(review.snapshot); return parsed ? [{ id: review.id, finalizedAt: review.finalizedAt, snapshot: parsed }] : []; }) };
}

export async function finalizePilotValueReview(input: { organizationId: string; userId: string; now?: Date }) {
  const review = await loadPilotValueReview(input);
  if (!review) throw new Error("Pilot value review not found.");
  return prisma.portfolioIqPilotValueReview.upsert({
    where: { reviewKey: review.reviewKey },
    create: { reviewKey: review.reviewKey, portfolioId: review.snapshot.portfolio.id, organizationId: input.organizationId, periodStart: new Date(review.snapshot.periodStart), periodEnd: new Date(review.snapshot.periodEnd), snapshot: JSON.stringify(review.snapshot), finalizedBy: input.userId },
    update: {},
  });
}

export async function loadStoredPilotValueReview(input: { organizationId: string; reviewId: string }) {
  const review = await prisma.portfolioIqPilotValueReview.findFirst({ where: { id: input.reviewId, organizationId: input.organizationId } });
  if (!review) return null;
  const snapshot = parsePilotValueReview(review.snapshot);
  return snapshot ? { id: review.id, finalizedAt: review.finalizedAt, snapshot } : null;
}
