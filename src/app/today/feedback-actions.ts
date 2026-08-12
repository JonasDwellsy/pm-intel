"use server";

import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";
import {
  isFindingFeedbackRating,
  suppressesFinding,
} from "@/lib/portfolio-iq/finding-feedback";

async function authorizedSignal(signalId: string, userId: string, organizationId: string) {
  const signal = await prisma.portfolioIqSignal.findUnique({
    where: { id: signalId },
    include: { portfolio: { select: { id: true, organizationId: true, isSynthetic: true } } },
  });
  const allowed = signal && (
    signal.portfolio.organizationId === organizationId ||
    (signal.portfolio.isSynthetic && isAdminUser(userId))
  );
  if (!signal || !allowed) throw new Error("Finding not found.");
  return signal;
}

function refreshFindingPages(signalId: string) {
  revalidatePath("/today");
  revalidatePath(`/today/cases/${signalId}`);
  revalidatePath("/admin/portfolio-activation");
}

export async function saveFindingFeedback(formData: FormData): Promise<void> {
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId || !organizationId) throw new Error("Sign in to review this finding.");
  const signalId = String(formData.get("signalId") ?? "").trim();
  const rating = String(formData.get("rating") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 600);
  if (!signalId || !isFindingFeedbackRating(rating)) throw new Error("Choose a valid finding response.");
  const signal = await authorizedSignal(signalId, userId, organizationId);

  await prisma.$transaction(async (tx) => {
    await tx.portfolioIqFindingFeedback.upsert({
      where: { portfolioId_userId_signalId: { portfolioId: signal.portfolioId, userId, signalId } },
      create: {
        portfolioId: signal.portfolioId,
        organizationId: signal.portfolio.organizationId,
        signalId,
        userId,
        rating,
        note: note || null,
        suppressFromQueue: suppressesFinding(rating),
      },
      update: {
        rating,
        note: note || null,
        suppressFromQueue: suppressesFinding(rating),
        reviewedAt: new Date(),
      },
    });

    if (rating === "wrong_context") {
      const issue = note || `Owner flagged ${signal.headline} as using the wrong property or comp context.`;
      await tx.portfolioIqPilotCorrection.upsert({
        where: {
          portfolioId_objectType_objectId: {
            portfolioId: signal.portfolioId,
            objectType: "finding_feedback",
            objectId: signalId,
          },
        },
        create: {
          portfolioId: signal.portfolioId,
          organizationId: signal.portfolio.organizationId,
          assetId: signal.assetId,
          objectType: "finding_feedback",
          objectId: signalId,
          issue,
          assignedLane: "data_ops",
          createdBy: userId,
        },
        update: { issue, status: "open", assignedLane: "data_ops", completedAt: null },
      });
    }
  });
  refreshFindingPages(signalId);
}

export async function clearFindingFeedback(formData: FormData): Promise<void> {
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId || !organizationId) throw new Error("Sign in to restore this finding.");
  const signalId = String(formData.get("signalId") ?? "").trim();
  if (!signalId) throw new Error("Finding is required.");
  const signal = await authorizedSignal(signalId, userId, organizationId);
  await prisma.portfolioIqFindingFeedback.deleteMany({
    where: { portfolioId: signal.portfolioId, userId, signalId },
  });
  refreshFindingPages(signalId);
}
