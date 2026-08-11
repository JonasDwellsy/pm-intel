"use server";
import { randomBytes } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";
import { buildPmBriefSnapshotFromComposer, loadPortfolioIqPmBriefComposer } from "@/lib/portfolio-iq/pm-brief.server";

function optionalDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(`${raw}T23:59:59.999Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function publishPortfolioIqPmBrief(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const slug = String(formData.get("slug") ?? "");
  const signalId = String(formData.get("signalId") ?? "");
  const ownerNote = String(formData.get("ownerNote") ?? "").trim().slice(0, 1000) || null;
  const responseDueAt = optionalDate(formData.get("responseDueAt"));
  if (!userId || !organizationId || !slug || !signalId) throw new Error("PM brief request is incomplete.");
  const composer = await loadPortfolioIqPmBriefComposer({ organizationId, userId, slug, signalId });
  if (!composer?.signal || composer.signal.id !== signalId) throw new Error("Property issue not found.");
  const signal = composer.signal;
  const allowed = composer.property.portfolio.organizationId === organizationId || (composer.property.portfolio.isSynthetic && isAdminUser(userId));
  if (!allowed) throw new Error("Property not found.");
  const existing = await prisma.portfolioIqPmBrief.findFirst({ where: { signalId, assetId: composer.property.asset.id, status: { in: ["published", "responded"] } }, select: { id: true } });
  if (existing) {
    revalidatePath(`/portfolio-iq/properties/${slug}/pm-brief`);
    return;
  }
  const now = new Date();
  const snapshot = buildPmBriefSnapshotFromComposer({ composer, publishedAt: now, ownerNote, responseDueAt });
  if (!snapshot) throw new Error("PM brief evidence is unavailable.");
  const publicToken = randomBytes(24).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.portfolioIqPmBrief.create({
      data: {
        portfolioId: composer.property.portfolio.id,
        assetId: composer.property.asset.id,
        signalId,
        publicToken,
        title: `Question about ${composer.property.asset.name}: ${signal.headline}`,
        snapshot: JSON.stringify(snapshot),
        ownerNote,
        responseDueAt,
        publishedBy: userId,
        publishedAt: now,
      },
    });
    const prior = signal.decision;
    const decision = prior
      ? await tx.portfolioIqSignalDecision.update({ where: { id: prior.id }, data: { state: "acknowledged", assignedTo: "Property manager", decidedBy: userId, decidedAt: now } })
      : await tx.portfolioIqSignalDecision.create({ data: { signalId, organizationId: composer.property.portfolio.organizationId, state: "acknowledged", assignedTo: "Property manager", decidedBy: userId, decidedAt: now } });
    await tx.portfolioIqSignalDecisionEvent.create({ data: { decisionId: decision.id, action: "share_with_pm", fromState: prior?.state ?? "open", toState: "acknowledged", assignedTo: "Property manager", note: `Property-scoped PM brief published for ${composer.property.asset.name}`, actorUserId: userId } });
  });
  revalidatePath(`/portfolio-iq/properties/${slug}/pm-brief`);
  revalidatePath(`/portfolio-iq/properties/${slug}`);
  revalidatePath("/portfolio-iq/collaboration");
  revalidatePath("/today");
}

export async function revokePortfolioIqPmBrief(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const briefId = String(formData.get("briefId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!userId || !organizationId || !briefId || !slug) throw new Error("Brief update is incomplete.");
  const brief = await prisma.portfolioIqPmBrief.findUnique({ where: { id: briefId }, include: { portfolio: { select: { organizationId: true, isSynthetic: true } } } });
  if (!brief || (brief.portfolio.organizationId !== organizationId && !(brief.portfolio.isSynthetic && isAdminUser(userId)))) throw new Error("Brief not found.");
  await prisma.portfolioIqPmBrief.update({ where: { id: briefId }, data: { status: "revoked", closedAt: new Date() } });
  revalidatePath(`/portfolio-iq/properties/${slug}/pm-brief`);
  revalidatePath("/portfolio-iq/collaboration");
}
