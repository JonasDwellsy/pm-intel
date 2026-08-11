"use server";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";

export async function assignPortfolioDecisionMember(formData: FormData): Promise<void> {
  const { userId, organizationId } = await getActiveOrgContext();
  const signalId = String(formData.get("signalId") ?? "");
  const assignedUserId = String(formData.get("assignedUserId") ?? "");
  if (!userId || !organizationId || !signalId || !assignedUserId) throw new Error("Choose a team member and decision.");
  const signal = await prisma.portfolioIqSignal.findUnique({
    where: { id: signalId },
    include: { portfolio: { select: { organizationId: true, isSynthetic: true } }, asset: { select: { slug: true } }, decision: true },
  });
  if (!signal || (signal.portfolio.organizationId !== organizationId && !(signal.portfolio.isSynthetic && isAdminUser(userId)))) throw new Error("Decision not found.");
  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_organizationId: { userId: assignedUserId, organizationId: signal.portfolio.organizationId } },
  });
  const previewSelfAssignment = signal.portfolio.isSynthetic && isAdminUser(userId) && assignedUserId === userId;
  if (!membership && !previewSelfAssignment) throw new Error("That person is not a member of this owner workspace.");
  const client = await clerkClient();
  const assignee = await client.users.getUser(assignedUserId);
  const email = assignee.emailAddresses.find((address) => address.id === assignee.primaryEmailAddressId)?.emailAddress ?? assignee.emailAddresses[0]?.emailAddress ?? "";
  const assignedTo = [assignee.firstName, assignee.lastName].filter(Boolean).join(" ").trim() || email || "Team member";
  const now = new Date();
  const fromState = signal.decision?.state ?? "open";
  await prisma.$transaction(async (tx) => {
    const decision = signal.decision
      ? await tx.portfolioIqSignalDecision.update({ where: { id: signal.decision.id }, data: { state: "acknowledged", assignedUserId, assignedTo, decidedBy: userId, decidedAt: now } })
      : await tx.portfolioIqSignalDecision.create({ data: { signalId, organizationId: signal.portfolio.organizationId, state: "acknowledged", assignedUserId, assignedTo, decidedBy: userId, decidedAt: now } });
    await tx.portfolioIqSignalDecisionEvent.create({ data: { decisionId: decision.id, action: "assign_member", fromState, toState: "acknowledged", assignedUserId, assignedTo, actorUserId: userId, createdAt: now } });
  });
  revalidatePath("/portfolio-iq/team");
  revalidatePath("/today");
  revalidatePath("/portfolio-iq/reports");
  revalidatePath(`/today/cases/${signalId}`);
  if (signal.asset?.slug) revalidatePath(`/portfolio-iq/properties/${signal.asset.slug}`);
}
