"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";
import { CLEVELAND_PILOT_PORTFOLIO } from "@/data/portfolio-iq/cleveland-pilot";

async function requireAdmin(): Promise<void> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) throw new Error("Not found.");
}

export async function seedClevelandPilotPortfolio(formData: FormData): Promise<void> {
  await requireAdmin();
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!organizationId) throw new Error("Choose an organization.");

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!organization) throw new Error("Organization not found.");

  await prisma.$transaction(async (tx) => {
    const portfolio = await tx.portfolioIqPortfolio.upsert({
      where: {
        organizationId_slug: {
          organizationId,
          slug: CLEVELAND_PILOT_PORTFOLIO.slug,
        },
      },
      create: {
        organizationId,
        marketId: CLEVELAND_PILOT_PORTFOLIO.marketId,
        slug: CLEVELAND_PILOT_PORTFOLIO.slug,
        name: CLEVELAND_PILOT_PORTFOLIO.name,
        ownerLabel: CLEVELAND_PILOT_PORTFOLIO.ownerLabel,
        isSynthetic: true,
      },
      update: {
        name: CLEVELAND_PILOT_PORTFOLIO.name,
        ownerLabel: CLEVELAND_PILOT_PORTFOLIO.ownerLabel,
      },
    });

    for (const [sortOrder, source] of CLEVELAND_PILOT_PORTFOLIO.assets.entries()) {
      const asset = await tx.portfolioIqAsset.upsert({
        where: { portfolioId_slug: { portfolioId: portfolio.id, slug: source.slug } },
        create: {
          portfolioId: portfolio.id,
          slug: source.slug,
          name: source.name,
          assetType: source.assetType,
          suppliedAddress: source.suppliedAddress,
          canonicalAddress: source.canonicalAddress,
          city: source.city,
          state: source.state,
          postalCode: source.postalCode,
          dwellsyCommunityId: source.dwellsyCommunityId,
          matchStatus: source.matchStatus,
          matchConfidence: source.matchConfidence,
          readinessStatus: source.readinessStatus,
          uruStatus: source.uruStatus,
          compSetStatus: source.compSetStatus,
          observedOperatorName: source.observedOperatorName,
          sourceNote: source.sourceNote,
          sortOrder,
        },
        update: {
          name: source.name,
          suppliedAddress: source.suppliedAddress,
          canonicalAddress: source.canonicalAddress,
          city: source.city,
          state: source.state,
          postalCode: source.postalCode,
          dwellsyCommunityId: source.dwellsyCommunityId,
          observedOperatorName: source.observedOperatorName,
          sourceNote: source.sourceNote,
          sortOrder,
        },
      });

      for (const building of source.buildings) {
        await tx.portfolioIqBuilding.upsert({
          where: {
            assetId_canonicalAddress: {
              assetId: asset.id,
              canonicalAddress: building.canonicalAddress,
            },
          },
          create: {
            assetId: asset.id,
            label: building.label,
            suppliedAddress: building.suppliedAddress,
            canonicalAddress: building.canonicalAddress,
            city: building.city,
            state: building.state,
            postalCode: building.postalCode,
            dwellsyCommunityId: building.dwellsyCommunityId,
            isPrimary: building.isPrimary ?? false,
          },
          update: {
            label: building.label,
            suppliedAddress: building.suppliedAddress,
            city: building.city,
            state: building.state,
            postalCode: building.postalCode,
            dwellsyCommunityId: building.dwellsyCommunityId,
            isPrimary: building.isPrimary ?? false,
          },
        });
      }

      const assignment = await tx.portfolioIqOperatorAssignment.findFirst({
        where: {
          assetId: asset.id,
          observedOperatorName: source.observedOperatorName,
          isCurrent: true,
        },
        select: { id: true },
      });
      if (!assignment) {
        await tx.portfolioIqOperatorAssignment.create({
          data: {
            assetId: asset.id,
            observedOperatorName: source.observedOperatorName,
          },
        });
      }

      for (const task of source.tasks) {
        await tx.portfolioIqActivationTask.upsert({
          where: { assetId_taskType: { assetId: asset.id, taskType: task.taskType } },
          create: { assetId: asset.id, taskType: task.taskType, note: task.note },
          update: { note: task.note },
        });
      }
    }
  });

  revalidatePath("/admin/portfolio-activation");
}

const READINESS_STATUSES = new Set([
  "ready",
  "monitoring",
  "operator_outreach",
  "dwellsy_onboarding",
  "needs_confirmation",
]);

export async function updateAssetReadiness(formData: FormData): Promise<void> {
  await requireAdmin();
  const assetId = String(formData.get("assetId") ?? "");
  const readinessStatus = String(formData.get("readinessStatus") ?? "");
  if (!assetId || !READINESS_STATUSES.has(readinessStatus)) {
    throw new Error("Invalid readiness update.");
  }
  await prisma.portfolioIqAsset.update({ where: { id: assetId }, data: { readinessStatus } });
  revalidatePath("/admin/portfolio-activation");
}

const TASK_STATUSES = new Set(["open", "in_progress", "blocked", "complete"]);

export async function updateActivationTaskStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const taskId = String(formData.get("taskId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!taskId || !TASK_STATUSES.has(status)) throw new Error("Invalid task update.");
  await prisma.portfolioIqActivationTask.update({
    where: { id: taskId },
    data: { status, completedAt: status === "complete" ? new Date() : null },
  });
  revalidatePath("/admin/portfolio-activation");
}
