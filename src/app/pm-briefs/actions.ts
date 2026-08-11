"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function clipped(value: FormDataEntryValue | null, maximum: number): string {
  return String(value ?? "").trim().slice(0, maximum);
}

export async function submitPortfolioIqPmBriefResponse(formData: FormData): Promise<void> {
  const publicToken = clipped(formData.get("publicToken"), 80);
  const responderName = clipped(formData.get("responderName"), 120);
  const responderEmail = clipped(formData.get("responderEmail"), 254) || null;
  const responseSummary = clipped(formData.get("responseSummary"), 2500);
  const actionPlan = clipped(formData.get("actionPlan"), 1500) || null;
  const followUpRaw = clipped(formData.get("followUpDate"), 20);
  const honeypot = clipped(formData.get("website"), 200);
  if (honeypot) redirect(`/pm-briefs/${publicToken}`);
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(publicToken) || responderName.length < 2 || responseSummary.length < 20) throw new Error("Complete your name and response before submitting.");
  if (responderEmail && (!responderEmail.includes("@") || responderEmail.includes(" "))) throw new Error("Enter a valid email address or leave it blank.");
  const followUpDate = followUpRaw ? new Date(`${followUpRaw}T23:59:59.999Z`) : null;
  if (followUpDate && Number.isNaN(followUpDate.getTime())) throw new Error("Follow-up date is invalid.");
  const brief = await prisma.portfolioIqPmBrief.findUnique({ where: { publicToken }, include: { response: true, signal: { include: { decision: true } } } });
  if (!brief || brief.status !== "published" || brief.response) throw new Error("This brief is no longer accepting a response.");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.portfolioIqPmBriefResponse.create({ data: { briefId: brief.id, responderName, responderEmail, responseSummary, actionPlan, followUpDate, submittedAt: now } });
    await tx.portfolioIqPmBrief.update({ where: { id: brief.id }, data: { status: "responded" } });
    if (brief.signal.decision) {
      await tx.portfolioIqSignalDecisionEvent.create({ data: { decisionId: brief.signal.decision.id, action: "pm_response_received", fromState: brief.signal.decision.state, toState: brief.signal.decision.state, assignedTo: brief.signal.decision.assignedTo, note: responseSummary.slice(0, 500), actorUserId: "external:pm-brief" } });
    }
  });
  // The response is the owner's in-app notification. The Collaboration Center
  // surfaces it immediately without forwarding PM content by email.
  redirect(`/pm-briefs/${publicToken}?submitted=1`);
}
