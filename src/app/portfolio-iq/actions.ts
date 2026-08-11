"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { refreshPortfolioWatchSignals } from "@/lib/portfolio-iq/watch.server";
import { buildDecisionBaseline, loadDecisionCase } from "@/lib/portfolio-iq/decision-case.server";
import { parseMonitoringWindow } from "@/lib/portfolio-iq/decision-case";
import { buildLaunchBriefingSnapshot } from "@/lib/portfolio-iq/launch-briefing.server";
import { runPortfolioMonitoringForPortfolio } from "@/lib/portfolio-iq/monitoring-run.server";

export async function updatePortfolioDigestPreference(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const portfolioId = String(formData.get("portfolioId") ?? "");
  if (!userId || !organizationId || !portfolioId) throw new Error("Workspace not ready.");
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({ where: { id: portfolioId }, select: { id: true, organizationId: true, isSynthetic: true } });
  if (!portfolio || (portfolio.organizationId !== organizationId && !(portfolio.isSynthetic && isAdminUser(userId)))) throw new Error("Portfolio not found.");
  const enabled = formData.get("enabled") === "on";
  await prisma.portfolioIqDigestPreference.upsert({
    where: { portfolioId_userId: { portfolioId, userId } },
    create: { portfolioId, organizationId: portfolio.organizationId, userId, enabled },
    update: { enabled, cadence: "weekly" },
  });
  revalidatePath("/today");
  revalidatePath("/portfolio-iq");
  revalidatePath("/portfolio-iq/reports");
}

export async function approvePortfolioLaunchBriefing(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const portfolioId = String(formData.get("portfolioId") ?? "");
  if (!userId || !organizationId || !portfolioId) throw new Error("Workspace not ready.");
  const snapshot = await buildLaunchBriefingSnapshot({ organizationId, userId });
  if (!snapshot || snapshot.portfolio.id !== portfolioId) throw new Error("Launch briefing not found.");
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({ where: { id: portfolioId }, select: { organizationId: true, isSynthetic: true } });
  if (!portfolio || (portfolio.organizationId !== organizationId && !(portfolio.isSynthetic && isAdminUser(userId)))) throw new Error("Portfolio not found.");
  const now = new Date();
  await prisma.$transaction([
    prisma.portfolioIqLaunchBriefing.upsert({
      where: { portfolioId },
      create: { portfolioId, status: "approved", snapshot: JSON.stringify(snapshot), generatedAt: new Date(snapshot.generatedAt), approvedAt: now, approvedBy: userId },
      update: { status: "approved", snapshot: JSON.stringify(snapshot), generatedAt: new Date(snapshot.generatedAt), approvedAt: now, approvedBy: userId },
    }),
    prisma.portfolioIqPortfolio.update({ where: { id: portfolioId }, data: { status: "ready" } }),
    prisma.portfolioIqMonitoringSnapshot.upsert({
      where: { portfolioId_periodKey: { portfolioId, periodKey: "launch-baseline" } },
      create: { portfolioId, periodKey: "launch-baseline", snapshot: JSON.stringify(snapshot), sourceAvailableThrough: snapshot.sourceAvailableThrough, capturedAt: now, capturedBy: userId },
      update: { snapshot: JSON.stringify(snapshot), sourceAvailableThrough: snapshot.sourceAvailableThrough, capturedAt: now, capturedBy: userId },
    }),
  ]);
  revalidatePath("/portfolio-iq/launch-briefing");
  revalidatePath("/portfolio-iq");
  revalidatePath("/today");
  revalidatePath("/onboarding");
  revalidatePath("/portfolio-iq/changes");
}

export async function capturePortfolioMonitoringPeriod(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const portfolioId = String(formData.get("portfolioId") ?? "");
  if (!userId || !organizationId || !portfolioId) throw new Error("Workspace not ready.");
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({ where: { id: portfolioId }, select: { organizationId: true, isSynthetic: true } });
  if (!portfolio || (portfolio.organizationId !== organizationId && !(portfolio.isSynthetic && isAdminUser(userId)))) throw new Error("Portfolio not found.");
  await runPortfolioMonitoringForPortfolio(portfolioId, { triggerKind: "manual" });
  revalidatePath("/portfolio-iq/changes");
  revalidatePath("/today");
}

const DECISION_ACTIONS = new Set(["acknowledge", "assign", "snooze", "resolve", "reopen"]);

export async function updatePortfolioSignalDecision(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const signalId = String(formData.get("signalId") ?? "");
  const action = String(formData.get("decisionAction") ?? "");
  const assignedTo = String(formData.get("assignedTo") ?? "").trim().slice(0, 120) || null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  if (!userId || !organizationId || !signalId || !DECISION_ACTIONS.has(action)) throw new Error("Decision update is invalid.");

  const signal = await prisma.portfolioIqSignal.findUnique({
    where: { id: signalId },
    include: { portfolio: { select: { organizationId: true, isSynthetic: true } }, asset: { select: { slug: true } }, decision: true },
  });
  if (!signal || (signal.portfolio.organizationId !== organizationId && !(signal.portfolio.isSynthetic && isAdminUser(userId)))) {
    throw new Error("Signal not found.");
  }
  if (action === "assign" && !assignedTo) throw new Error("Enter the person or team responsible.");

  const now = new Date();
  const fromState = signal.decision?.state ?? "open";
  const toState = action === "acknowledge" || action === "assign"
    ? "acknowledged"
    : action === "snooze"
      ? "snoozed"
      : action === "resolve"
        ? "resolved"
        : "open";
  const snoozedUntil = action === "snooze" ? new Date(now.getTime() + 7 * 86_400_000) : null;
  const nextAssignedTo = action === "assign" ? assignedTo : signal.decision?.assignedTo ?? null;
  const nextNote = note ?? signal.decision?.note ?? null;

  await prisma.$transaction(async (tx) => {
    const decision = signal.decision
      ? await tx.portfolioIqSignalDecision.update({
          where: { id: signal.decision.id },
          data: { state: toState, assignedTo: nextAssignedTo, note: nextNote, snoozedUntil, decidedBy: userId, decidedAt: now },
        })
      : await tx.portfolioIqSignalDecision.create({
          data: { signalId, organizationId: signal.portfolio.organizationId, state: toState, assignedTo: nextAssignedTo, note: nextNote, snoozedUntil, decidedBy: userId, decidedAt: now },
        });
    await tx.portfolioIqSignalDecisionEvent.create({
      data: { decisionId: decision.id, action, fromState, toState, assignedTo: nextAssignedTo, note, actorUserId: userId, createdAt: now },
    });
  });

  await refreshPortfolioWatchSignals(signal.portfolioId);
  revalidatePath("/today");
  revalidatePath("/portfolio-iq");
  if (signal.asset?.slug) revalidatePath(`/portfolio-iq/properties/${signal.asset.slug}`);
}

export async function savePortfolioDecisionCase(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const signalId = String(formData.get("signalId") ?? "");
  const assignedTo = String(formData.get("assignedTo") ?? "").trim().slice(0, 120);
  const actionPlan = String(formData.get("actionPlan") ?? "").trim().slice(0, 1500);
  const successMeasure = String(formData.get("successMeasure") ?? "").trim().slice(0, 600);
  const monitoringWindowDays = parseMonitoringWindow(formData.get("monitoringWindowDays"));
  const dueRaw = String(formData.get("dueAt") ?? "");
  const dueAt = dueRaw ? new Date(`${dueRaw}T23:59:59.999Z`) : null;
  if (!userId || !organizationId || !signalId || !assignedTo || !actionPlan || !successMeasure || !monitoringWindowDays || !dueAt || Number.isNaN(dueAt.getTime())) {
    throw new Error("Complete the owner, action, due date, success measure, and monitoring window.");
  }

  const caseData = await loadDecisionCase({ organizationId, userId, signalId });
  if (!caseData) throw new Error("Decision case not found.");
  const now = new Date();
  const prior = caseData.signal.decision;
  const fromState = prior?.state ?? "open";
  const toState = fromState === "resolved" ? "resolved" : "acknowledged";
  const baseline = prior?.baselineEvidence ?? JSON.stringify(buildDecisionBaseline(caseData, now));

  await prisma.$transaction(async (tx) => {
    const decision = prior
      ? await tx.portfolioIqSignalDecision.update({
          where: { id: prior.id },
          data: { assignedTo, actionPlan, successMeasure, dueAt, monitoringWindowDays, baselineEvidence: baseline, baselineCapturedAt: prior.baselineCapturedAt ?? now, decidedBy: userId, decidedAt: now },
        })
      : await tx.portfolioIqSignalDecision.create({
          data: { signalId, organizationId: caseData.portfolio.organizationId, state: toState, assignedTo, actionPlan, successMeasure, dueAt, monitoringWindowDays, baselineEvidence: baseline, baselineCapturedAt: now, decidedBy: userId, decidedAt: now },
        });
    await tx.portfolioIqSignalDecisionEvent.create({
      data: { decisionId: decision.id, action: prior?.actionPlan ? "update_plan" : "plan", fromState, toState, assignedTo, note: actionPlan, actorUserId: userId, createdAt: now },
    });
  });
  revalidatePath("/today");
  revalidatePath(`/today/cases/${signalId}`);
}
