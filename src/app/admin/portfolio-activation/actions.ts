"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";
import { CLEVELAND_PILOT_PORTFOLIO } from "@/data/portfolio-iq/cleveland-pilot";
import { proposeCompMembers } from "@/lib/portfolio-iq/comp-generator";

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

  const historicalImport = await prisma.marketIqDataImport.findFirst({
    where: {
      marketId: CLEVELAND_PILOT_PORTFOLIO.marketId,
      sourceKind: "historical_export",
      status: "complete",
    },
    orderBy: { importedAt: "desc" },
    select: { id: true },
  });
  const candidateSelect = {
    sourceRecordId: true,
    address: true,
    communityName: true,
    city: true,
    state: true,
    postalCode: true,
    propertyType: true,
    bedrooms: true,
    bathrooms: true,
    askingRent: true,
    squareFeet: true,
    activatedAt: true,
  } as const;
  const historicalCandidates = historicalImport
    ? (await Promise.all(["apartment", "house"].map((propertyType) =>
        prisma.marketIqListing.findMany({
          where: {
            importId: historicalImport.id,
            propertyType,
            address: { not: null },
            askingRent: { not: null },
          },
          orderBy: { activatedAt: "desc" },
          take: 3000,
          select: candidateSelect,
        })
      ))).flat()
    : [];

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
        marketId: CLEVELAND_PILOT_PORTFOLIO.marketId,
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

      if (historicalImport) {
        const existingCompSet = await tx.portfolioIqCompSet.findUnique({
          where: { assetId: asset.id },
          select: { id: true },
        });
        if (!existingCompSet) {
          const propertyType = source.assetType === "single_family" ? "house" : "apartment";
          const members = proposeCompMembers({
            subjectAddresses: source.buildings.flatMap((building) => [
              building.suppliedAddress,
              building.canonicalAddress,
            ]),
            city: source.city,
            postalCode: source.postalCode,
            candidates: historicalCandidates.filter((candidate) => candidate.propertyType === propertyType),
          });
          if (members.length > 0) {
            await tx.portfolioIqCompSet.create({
              data: {
                assetId: asset.id,
                name: `${source.name} proposed comp set`,
                status: "proposed",
                methodology: "Latest distinct asking listings prioritized by same ZIP, then same city, then Cleveland MSA fallback.",
                sourceImportId: historicalImport.id,
                members: {
                  create: members.map((member) => ({
                    comparisonKey: member.comparisonKey,
                    sourceRecordId: member.sourceRecordId,
                    propertyLabel: member.propertyLabel,
                    address: member.address as string,
                    city: member.city,
                    state: member.state,
                    postalCode: member.postalCode,
                    propertyType: member.propertyType,
                    bedrooms: member.bedrooms,
                    bathrooms: member.bathrooms,
                    askingRent: member.askingRent,
                    squareFeet: member.squareFeet,
                    activatedAt: member.activatedAt,
                    selectionReason: member.selectionReason,
                  })),
                },
              },
            });
            await tx.portfolioIqAsset.update({
              where: { id: asset.id },
              data: { compSetStatus: "review" },
            });
          }
        }
      }
    }
  });

  revalidatePath("/admin/portfolio-activation");
  revalidatePath("/portfolio-iq");
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
