import "server-only";
import { prisma } from "@/lib/prisma";
import { loadOwnerToday } from "@/lib/portfolio-iq/today.server";
import { loadPortfolioIqCollaboration } from "@/lib/portfolio-iq/collaboration.server";
import { loadPortfolioIqOutcomes } from "@/lib/portfolio-iq/outcome-review.server";
import { buildOwnerBriefingSnapshot } from "@/lib/portfolio-iq/owner-briefing";

export async function loadOwnerBriefing(input: { organizationId: string; userId: string; portfolioId?: string; now?: Date }) {
  const [today, collaboration, outcomes] = await Promise.all([
    loadOwnerToday(input),
    loadPortfolioIqCollaboration(input),
    loadPortfolioIqOutcomes(input),
  ]);
  if (!today || !collaboration || !outcomes) return null;
  const now = input.now ?? new Date();
  const attention = today.todaySignals.map((signal) => ({
    signalId: signal.id,
    severity: signal.severity,
    category: signal.category,
    headline: signal.headline,
    narrative: signal.narrative,
    exposedAssets: signal.exposures.length
      ? signal.exposures.map((exposure) => ({ name: exposure.asset.name, slug: exposure.asset.slug, operatorName: exposure.operatorName }))
      : signal.asset ? [{ name: signal.asset.name, slug: signal.asset.slug, operatorName: null }] : [],
    decisionState: signal.decision?.state ?? null,
    assignedTo: signal.decision?.assignedTo ?? null,
    dueAt: signal.decision?.dueAt?.toISOString() ?? null,
  }));
  const decisions = today.signals.flatMap((signal) => signal.decision ? [signal.decision] : []);
  const financialReady = today.financialImpacts.filter((item) => item.impact.status === "estimated");
  const propertyCuts = [...today.properties.values()].flatMap((property) => property.availableThrough ? [property.availableThrough] : []);
  const latestPropertyCut = propertyCuts.sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  const latestTrendCut = today.trendPulses.map((pulse) => pulse.trendSource.availableThrough).sort((left, right) => right.localeCompare(left))[0] ?? null;
  const sources = [
    { label: "Dwellsy IQ Trends", status: latestTrendCut ? "current" as const : "limited" as const, detail: latestTrendCut ? `Through ${latestTrendCut.slice(0, 10)}` : "No current trend observation" },
    { label: "Historical property listings", status: latestPropertyCut ? "current" as const : "limited" as const, detail: latestPropertyCut ? `Through ${latestPropertyCut.toISOString().slice(0, 10)}` : "Property match pending" },
    { label: "Live listing response", status: "limited" as const, detail: "Feed paused. No live price-change claim is included." },
  ];
  const snapshot = buildOwnerBriefingSnapshot({
    generatedAt: now,
    portfolio: { id: today.portfolio.id, name: today.portfolio.name, marketId: today.portfolio.marketId },
    attention,
    decisions: {
      active: decisions.filter((decision) => decision.state !== "resolved").length,
      assigned: decisions.filter((decision) => decision.state !== "resolved" && Boolean(decision.assignedTo)).length,
      due: decisions.filter((decision) => decision.state !== "resolved" && Boolean(decision.dueAt && decision.dueAt <= now)).length,
      monitoring: decisions.filter((decision) => decision.state !== "resolved" && Boolean(decision.baselineCapturedAt) && !(decision.dueAt && decision.dueAt <= now)).length,
    },
    collaboration: { awaitingResponse: collaboration.awaitingResponse.length, overdue: collaboration.overdue.length, awaitingOwnerReview: collaboration.awaitingOwnerReview.length, acceptedPlans: collaboration.acceptedPlans.length },
    financial: {
      ready: financialReady.length,
      incomplete: today.financialImpacts.length - financialReady.length,
      conservative: financialReady.reduce((sum, item) => sum + (item.impact.annualConservative ?? 0), 0),
      base: financialReady.reduce((sum, item) => sum + (item.impact.annualRealizationAdjusted ?? 0), 0),
      upside: financialReady.reduce((sum, item) => sum + (item.impact.annualUpside ?? 0), 0),
    },
    outcomes: { ready: outcomes.readyCount, due: outcomes.dueCount, waiting: outcomes.waitingCount, reviewed: outcomes.reviewedCount },
    sources,
  });
  const deliveries = today.digestPreference ? await prisma.portfolioIqDigestDelivery.findMany({ where: { preferenceId: today.digestPreference.id }, orderBy: { createdAt: "desc" }, take: 8 }) : [];
  return { snapshot, digestPreference: today.digestPreference, deliveries };
}
