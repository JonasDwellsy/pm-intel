import "server-only";
import { prisma } from "@/lib/prisma";
import { loadOwnerToday } from "@/lib/portfolio-iq/today.server";
import { deriveDecisionLedgerStage, summarizeDecisionLedger } from "@/lib/portfolio-iq/decision-ledger";

function elapsedDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000 * 10) / 10);
}

export async function loadDecisionLedger(input: { organizationId: string; userId: string; portfolioId?: string; now?: Date }) {
  const today = await loadOwnerToday(input);
  if (!today) return null;
  const now = input.now ?? new Date();
  const decisions = await prisma.portfolioIqSignalDecision.findMany({
    where: { signal: { portfolioId: today.portfolio.id } },
    include: {
      signal: {
        include: {
          asset: { select: { id: true, slug: true, name: true } },
          unifiedInsight: { select: { exposures: { select: { asset: { select: { id: true, slug: true, name: true } } }, orderBy: { relevanceScore: "desc" } } } },
          pmBriefs: { where: { status: { not: "revoked" } }, include: { response: true }, orderBy: { publishedAt: "desc" }, take: 1 },
        },
      },
      outcomeReviews: { where: { status: "reviewed" }, orderBy: { reviewedAt: "desc" }, take: 1 },
    },
    orderBy: [{ state: "asc" }, { updatedAt: "desc" }],
  });
  const financialByAsset = new Map(today.financialImpacts.flatMap((item) =>
    item.impact.status === "estimated" && item.impact.annualRealizationAdjusted !== null
      ? [[item.property.id, Math.abs(item.impact.annualRealizationAdjusted)] as const]
      : []
  ));
  const rows = decisions.map((decision) => {
    const exposureAssets = decision.signal.unifiedInsight?.exposures.map((exposure) => exposure.asset) ?? [];
    const assets = exposureAssets.length ? exposureAssets : decision.signal.asset ? [decision.signal.asset] : [];
    const brief = decision.signal.pmBriefs[0] ?? null;
    const response = brief?.response ?? null;
    const outcome = decision.outcomeReviews[0] ?? null;
    const pmResponseDays = elapsedDays(brief?.deliveredAt ?? brief?.publishedAt ?? null, response?.submittedAt ?? null);
    const stage = deriveDecisionLedgerStage({ decisionState: decision.state, baselineCapturedAt: decision.baselineCapturedAt, dueAt: decision.dueAt, briefStatus: brief?.status ?? null, pmDisposition: response?.ownerDisposition ?? null, latestOutcome: outcome ? { status: outcome.status, nextDecision: outcome.nextDecision } : null, now });
    return {
      signalId: decision.signalId,
      headline: decision.signal.headline,
      severity: decision.signal.severity,
      category: decision.signal.category,
      state: decision.state,
      stage,
      assets,
      assignedTo: decision.assignedTo,
      actionPlan: decision.actionPlan,
      successMeasure: decision.successMeasure,
      dueAt: decision.dueAt,
      decidedAt: decision.decidedAt,
      hasActionPlan: Boolean(decision.actionPlan),
      acceptedPmPlan: response?.ownerDisposition === "accepted",
      pmResponder: response?.responderName ?? null,
      pmAssessment: response?.assessment ?? null,
      pmRecommendation: response?.recommendation ?? null,
      pmResponseDays,
      pmRespondedOnTime: response && brief?.responseDueAt ? response.submittedAt <= brief.responseDueAt : null,
      implementationStatus: outcome?.implementationStatus ?? null,
      outcomeConclusion: outcome?.conclusion ?? null,
      nextDecision: outcome?.nextDecision ?? null,
      outcomeReviewedAt: outcome?.reviewedAt ?? null,
      financialPriorities: assets.flatMap((asset) => {
        const amount = financialByAsset.get(asset.id);
        return amount === undefined ? [] : [{ assetId: asset.id, amount }];
      }),
    };
  });
  const stagePriority = new Map(["owner_review", "outcome_due", "follow_up", "awaiting_pm", "monitoring", "action_planned", "closed"].map((stage, index) => [stage, index]));
  rows.sort((left, right) => (stagePriority.get(left.stage) ?? 99) - (stagePriority.get(right.stage) ?? 99) || right.decidedAt.getTime() - left.decidedAt.getTime());
  return { portfolio: today.portfolio, rows, summary: summarizeDecisionLedger(rows), generatedAt: now };
}
