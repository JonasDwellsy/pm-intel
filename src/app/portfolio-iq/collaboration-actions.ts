"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { sendEmail } from "@/lib/email/send";
import { prisma } from "@/lib/prisma";
import { parsePortfolioIqPmBriefSnapshot } from "@/lib/portfolio-iq/pm-brief";
import { buildPmBriefEmail } from "@/lib/portfolio-iq/pm-email";
import { buildDecisionBaseline, loadDecisionCase } from "@/lib/portfolio-iq/decision-case.server";
import { monitoringDays } from "@/lib/portfolio-iq/pm-response";

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function authorizedBrief(briefId: string, organizationId: string, userId: string) {
  const brief = await prisma.portfolioIqPmBrief.findUnique({
    where: { id: briefId },
    include: {
      portfolio: { include: { organization: { select: { name: true } } } },
      asset: { select: { slug: true, name: true } },
      signal: { include: { decision: true } },
      response: true,
    },
  });
  if (!brief || (brief.portfolio.organizationId !== organizationId && !(brief.portfolio.isSynthetic && isAdminUser(userId)))) throw new Error("PM brief not found.");
  return brief;
}

export async function sendPortfolioIqPmBrief(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const briefId = String(formData.get("briefId") ?? "");
  const recipientName = String(formData.get("recipientName") ?? "").trim().slice(0, 120) || null;
  const recipientEmail = String(formData.get("recipientEmail") ?? "").trim().toLowerCase().slice(0, 254);
  const confirmed = formData.get("confirmDelivery") === "yes";
  const remindersEnabled = formData.get("remindersEnabled") === "yes";
  if (!userId || !organizationId || !briefId || !validEmail(recipientEmail) || !confirmed) throw new Error("Confirm the PM recipient before sending.");
  const brief = await authorizedBrief(briefId, organizationId, userId);
  if (brief.status !== "published" || brief.response) throw new Error("This brief is no longer awaiting a PM response.");
  if (brief.deliveryStatus === "sent") return;
  const snapshot = parsePortfolioIqPmBriefSnapshot(brief.snapshot);
  if (!snapshot) throw new Error("The PM-safe brief snapshot is unavailable.");
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://iq.dwellsy.com").replace(/\/$/, "");
  const message = buildPmBriefEmail({ recipientName, propertyName: brief.asset.name, ownerName: brief.portfolio.organization.name, snapshot, briefUrl: `${baseUrl}/pm-briefs/${brief.publicToken}` });
  const result = await sendEmail({ to: recipientEmail, ...message, customArgs: { dwellsy_kind: "pm_brief", dwellsy_record_id: brief.id, dwellsy_portfolio_id: brief.portfolioId } });
  await prisma.portfolioIqPmBrief.update({
    where: { id: brief.id },
    data: result.ok
      ? { recipientName, recipientEmail, remindersEnabled, deliveryStatus: "sent", deliveryProviderId: result.id, deliveryError: null, acceptedAt: new Date(), deliveredAt: null }
      : { recipientName, recipientEmail, remindersEnabled, deliveryStatus: "failed", deliveryError: result.error },
  });
  revalidatePath("/portfolio-iq/collaboration");
  revalidatePath(`/portfolio-iq/properties/${brief.asset.slug}/pm-brief`);
  if (!result.ok) throw new Error(`SendGrid could not deliver this brief: ${result.error}`);
}

export async function enablePortfolioIqPmBriefReminders(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const briefId = String(formData.get("briefId") ?? "");
  const confirmed = formData.get("confirmReminders") === "yes";
  if (!userId || !organizationId || !briefId || !confirmed) throw new Error("Confirm reminder delivery before enabling it.");
  const brief = await authorizedBrief(briefId, organizationId, userId);
  if (brief.deliveryStatus !== "sent" || brief.status !== "published" || brief.response) throw new Error("This brief is not eligible for reminders.");
  await prisma.portfolioIqPmBrief.update({ where: { id: brief.id }, data: { remindersEnabled: true } });
  revalidatePath("/portfolio-iq/collaboration");
}

const DISPOSITIONS = new Set(["accepted", "revised", "closed"]);

export async function reviewPortfolioIqPmResponse(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const briefId = String(formData.get("briefId") ?? "");
  const disposition = String(formData.get("disposition") ?? "");
  const ownerReviewNote = String(formData.get("ownerReviewNote") ?? "").trim().slice(0, 1000) || null;
  if (!userId || !organizationId || !briefId || !DISPOSITIONS.has(disposition)) throw new Error("Response review is incomplete.");
  const brief = await authorizedBrief(briefId, organizationId, userId);
  if (!brief.response) throw new Error("No PM response is available to review.");
  if (disposition === "accepted" && (!brief.response.actionPlan || !brief.response.actionOwner || !brief.response.successMeasure || !brief.response.followUpDate)) throw new Error("Request a complete action owner, plan, success measure, and review date before accepting.");
  if (disposition === "revised" && !ownerReviewNote) throw new Error("Add the revision you want the PM to make.");
  const now = new Date();
  const adoptedPlan = disposition === "accepted" ? brief.response.actionPlan : null;
  const caseData = disposition === "accepted" ? await loadDecisionCase({ organizationId, userId, signalId: brief.signalId }) : null;
  if (disposition === "accepted" && !caseData) throw new Error("The decision case is unavailable.");
  const baselineEvidence = caseData ? brief.signal.decision?.baselineEvidence ?? JSON.stringify(buildDecisionBaseline(caseData, now)) : null;
  await prisma.$transaction(async (tx) => {
    await tx.portfolioIqPmBriefResponse.update({ where: { id: brief.response!.id }, data: { ownerDisposition: disposition, ownerReviewNote, reviewedAt: now, reviewedBy: userId } });
    await tx.portfolioIqPmBrief.update({ where: { id: brief.id }, data: disposition === "closed" ? { status: "closed", closedAt: now } : disposition === "revised" ? { status: "published", closedAt: null } : { status: "responded", closedAt: null } });
    const prior = brief.signal.decision;
    const toState = disposition === "accepted" ? "acknowledged" : disposition === "closed" ? "resolved" : prior?.state ?? "open";
    const assignedTo = disposition === "accepted" ? brief.response!.actionOwner : prior?.assignedTo ?? null;
    const decision = prior
      ? await tx.portfolioIqSignalDecision.update({
          where: { id: prior.id },
          data: adoptedPlan
            ? { state: toState, assignedTo, assignedUserId: null, actionPlan: adoptedPlan, successMeasure: brief.response!.successMeasure, dueAt: brief.response!.followUpDate, monitoringWindowDays: monitoringDays(now, brief.response!.followUpDate!), baselineEvidence, baselineCapturedAt: prior.baselineCapturedAt ?? now, note: ownerReviewNote ?? prior.note, decidedBy: userId, decidedAt: now }
            : { state: toState, note: ownerReviewNote ?? prior.note, decidedBy: userId, decidedAt: now },
        })
      : await tx.portfolioIqSignalDecision.create({
          data: { signalId: brief.signalId, organizationId: brief.portfolio.organizationId, state: toState, assignedTo, actionPlan: adoptedPlan, successMeasure: adoptedPlan ? brief.response!.successMeasure : null, dueAt: adoptedPlan ? brief.response!.followUpDate : null, monitoringWindowDays: adoptedPlan ? monitoringDays(now, brief.response!.followUpDate!) : null, baselineEvidence: adoptedPlan ? baselineEvidence : null, baselineCapturedAt: adoptedPlan ? now : null, note: ownerReviewNote, decidedBy: userId, decidedAt: now },
        });
    await tx.portfolioIqSignalDecisionEvent.create({ data: { decisionId: decision.id, action: `pm_plan_${disposition}`, fromState: prior?.state ?? "open", toState, assignedTo, note: adoptedPlan ?? ownerReviewNote, actorUserId: userId, createdAt: now } });
  });
  revalidatePath("/portfolio-iq/collaboration");
  revalidatePath("/portfolio-iq/outcomes");
  revalidatePath("/today");
  revalidatePath(`/portfolio-iq/properties/${brief.asset.slug}`);
  revalidatePath(`/today/cases/${brief.signalId}`);
}
