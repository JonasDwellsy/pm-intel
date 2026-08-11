"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { prisma } from "@/lib/prisma";
import { loadDecisionCase } from "@/lib/portfolio-iq/decision-case.server";
import { parseDecisionBaseline } from "@/lib/portfolio-iq/decision-case";
import { buildOutcomeComparison } from "@/lib/portfolio-iq/outcome-review";
import { parseImplementationStatus, parseOutcomeNextDecision } from "@/lib/portfolio-iq/outcome-capture";

const CONCLUSIONS = new Set(["improved", "unchanged", "worsened", "inconclusive"]);

export async function saveOutcomeReview(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const signalId = String(formData.get("signalId") ?? "");
  const conclusion = String(formData.get("conclusion") ?? "");
  const implementationStatus = parseImplementationStatus(formData.get("implementationStatus"));
  const nextDecision = parseOutcomeNextDecision(formData.get("nextDecision"));
  const reviewNote = String(formData.get("reviewNote") ?? "").trim().slice(0, 1200);
  const nextRaw = String(formData.get("nextReviewAt") ?? "").trim();
  const nextReviewAt = nextRaw ? new Date(`${nextRaw}T12:00:00Z`) : null;
  if (nextReviewAt && Number.isNaN(nextReviewAt.getTime())) throw new Error("Enter a valid next review date.");
  if (!userId || !organizationId || !signalId || !CONCLUSIONS.has(conclusion) || !implementationStatus || !nextDecision || !reviewNote || (nextDecision !== "close" && !nextReviewAt)) throw new Error("Complete the implementation status, outcome, next decision, and review date.");
  const caseData = await loadDecisionCase({ userId, organizationId, signalId });
  const decision = caseData?.signal.decision;
  const baseline = parseDecisionBaseline(decision?.baselineEvidence);
  if (!caseData || !decision || !baseline) throw new Error("Decision baseline not found.");
  const current = caseData.property ? { availableThrough: caseData.property.availableThrough?.toISOString() ?? null, askingRent: caseData.property.performance.askingRent, askingRentChange90d: caseData.property.performance.askingRentChange90d, medianDom: caseData.property.performance.medianDom, observationCount: caseData.property.performance.observationCount } : null;
  const currentExposures = caseData.exposureContexts.map((exposure) => ({
    assetId: exposure.asset.id,
    property: exposure.property ? { availableThrough: exposure.property.availableThrough?.toISOString() ?? null, askingRent: exposure.property.performance.askingRent, askingRentChange90d: exposure.property.performance.askingRentChange90d, medianDom: exposure.property.performance.medianDom, observationCount: exposure.property.performance.observationCount } : null,
  }));
  const now = new Date();
  const comparison = buildOutcomeComparison({ baseline, current, currentExposures, actionPlan: decision.actionPlan, successMeasure: decision.successMeasure, generatedAt: now });
  if (comparison.sourceHealth !== "healthy" && conclusion !== "inconclusive") throw new Error("Only an inconclusive review can be saved until the property source advances.");
  const periodKey = comparison.currentAvailableThrough?.slice(0, 10) ?? `unavailable-${baseline.capturedAt.slice(0, 10)}`;
  const toState = nextDecision === "close" ? "resolved" : "acknowledged";
  await prisma.$transaction(async (tx) => {
    await tx.portfolioIqOutcomeReview.upsert({
      where: { decisionId_periodKey: { decisionId: decision.id, periodKey } },
      create: { portfolioId: caseData.portfolio.id, decisionId: decision.id, periodKey, status: "reviewed", sourceHealth: comparison.sourceHealth, sourceAvailableThrough: comparison.currentAvailableThrough, comparison: JSON.stringify(comparison), conclusion, implementationStatus, nextDecision, reviewNote, nextReviewAt, reviewedAt: now, reviewedBy: userId },
      update: { status: "reviewed", sourceHealth: comparison.sourceHealth, sourceAvailableThrough: comparison.currentAvailableThrough, comparison: JSON.stringify(comparison), conclusion, implementationStatus, nextDecision, reviewNote, nextReviewAt, reviewedAt: now, reviewedBy: userId },
    });
    await tx.portfolioIqSignalDecision.update({ where: { id: decision.id }, data: { state: toState, note: reviewNote, dueAt: nextDecision === "close" ? null : nextReviewAt, decidedBy: userId, decidedAt: now } });
    await tx.portfolioIqSignalDecisionEvent.create({ data: { decisionId: decision.id, action: `outcome_${nextDecision}`, fromState: decision.state, toState, assignedTo: decision.assignedTo, assignedUserId: decision.assignedUserId, note: reviewNote, actorUserId: userId, createdAt: now } });
  });
  revalidatePath("/portfolio-iq/outcomes"); revalidatePath("/portfolio-iq/collaboration"); revalidatePath("/today"); revalidatePath(`/today/cases/${signalId}`);
}
