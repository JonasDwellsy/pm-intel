"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { prisma } from "@/lib/prisma";
import { loadDecisionCase } from "@/lib/portfolio-iq/decision-case.server";
import { parseDecisionBaseline } from "@/lib/portfolio-iq/decision-case";
import { buildOutcomeComparison } from "@/lib/portfolio-iq/outcome-review";

const CONCLUSIONS = new Set(["improved", "unchanged", "worsened", "inconclusive"]);

export async function saveOutcomeReview(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const signalId = String(formData.get("signalId") ?? "");
  const conclusion = String(formData.get("conclusion") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim().slice(0, 1200);
  const nextRaw = String(formData.get("nextReviewAt") ?? "").trim();
  const nextReviewAt = nextRaw ? new Date(`${nextRaw}T12:00:00Z`) : null;
  if (!userId || !organizationId || !signalId || !CONCLUSIONS.has(conclusion) || !reviewNote) throw new Error("Complete the outcome review.");
  const caseData = await loadDecisionCase({ userId, organizationId, signalId });
  const decision = caseData?.signal.decision;
  const baseline = parseDecisionBaseline(decision?.baselineEvidence);
  if (!caseData || !decision || !baseline) throw new Error("Decision baseline not found.");
  const current = caseData.property ? { availableThrough: caseData.property.availableThrough?.toISOString() ?? null, askingRent: caseData.property.performance.askingRent, askingRentChange90d: caseData.property.performance.askingRentChange90d, medianDom: caseData.property.performance.medianDom, observationCount: caseData.property.performance.observationCount } : null;
  const now = new Date();
  const comparison = buildOutcomeComparison({ baseline, current, actionPlan: decision.actionPlan, successMeasure: decision.successMeasure, generatedAt: now });
  if (comparison.sourceHealth !== "healthy" && conclusion !== "inconclusive") throw new Error("Only an inconclusive review can be saved until the property source advances.");
  const periodKey = comparison.currentAvailableThrough?.slice(0, 10) ?? `unavailable-${now.toISOString().slice(0, 10)}`;
  await prisma.portfolioIqOutcomeReview.upsert({
    where: { decisionId_periodKey: { decisionId: decision.id, periodKey } },
    create: { portfolioId: caseData.portfolio.id, decisionId: decision.id, periodKey, status: "reviewed", sourceHealth: comparison.sourceHealth, sourceAvailableThrough: comparison.currentAvailableThrough, comparison: JSON.stringify(comparison), conclusion, reviewNote, nextReviewAt, reviewedAt: now, reviewedBy: userId },
    update: { status: "reviewed", sourceHealth: comparison.sourceHealth, sourceAvailableThrough: comparison.currentAvailableThrough, comparison: JSON.stringify(comparison), conclusion, reviewNote, nextReviewAt, reviewedAt: now, reviewedBy: userId },
  });
  revalidatePath("/portfolio-iq/outcomes"); revalidatePath("/today"); revalidatePath(`/today/cases/${signalId}`);
}

