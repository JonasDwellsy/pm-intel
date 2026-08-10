"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";
import { CLEVELAND_PILOT_PORTFOLIO } from "@/data/portfolio-iq/cleveland-pilot";
import {
  comparisonAddress,
  normalizedAddress,
  proposeCompMembers,
} from "@/lib/portfolio-iq/comp-generator";
import { refreshPortfolioWatchSignals } from "@/lib/portfolio-iq/watch.server";

async function requireAdmin(): Promise<string> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) throw new Error("Not found.");
  return userId;
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
  await refreshPortfolioWatchSignals(await portfolioIdForOrganization(organizationId));
}

async function portfolioIdForOrganization(organizationId: string): Promise<string> {
  const portfolio = await prisma.portfolioIqPortfolio.findFirst({
    where: { organizationId, slug: CLEVELAND_PILOT_PORTFOLIO.slug },
    select: { id: true },
  });
  if (!portfolio) throw new Error("Portfolio not found after activation.");
  return portfolio.id;
}

export async function refreshPortfolioWatch(formData: FormData): Promise<void> {
  await requireAdmin();
  const portfolioId = String(formData.get("portfolioId") ?? "");
  if (!portfolioId) throw new Error("Portfolio not found.");
  await refreshPortfolioWatchSignals(portfolioId);
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

const COMP_MEMBER_STATUSES = new Set(["included", "excluded"]);
const COMP_EXCLUSION_REASONS = new Set([
  "wrong_property_type",
  "wrong_bedroom_mix",
  "poor_location_match",
  "unusual_condition",
  "duplicate_community",
  "other",
]);

async function revalidateCompReview(assetId: string): Promise<void> {
  const asset = await prisma.portfolioIqAsset.findUnique({
    where: { id: assetId },
    select: { slug: true, portfolioId: true },
  });
  if (asset) await refreshPortfolioWatchSignals(asset.portfolioId);
  revalidatePath("/admin/portfolio-activation");
  revalidatePath(`/admin/portfolio-activation/${assetId}`);
  revalidatePath("/portfolio-iq");
  if (asset) revalidatePath(`/portfolio-iq/properties/${asset.slug}`);
}

export async function updateCompMemberReview(formData: FormData): Promise<void> {
  const userId = await requireAdmin();
  const memberId = String(formData.get("memberId") ?? "");
  const reviewStatus = String(formData.get("reviewStatus") ?? "");
  const exclusionReason = String(formData.get("exclusionReason") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim().slice(0, 500) || null;
  if (!memberId || !COMP_MEMBER_STATUSES.has(reviewStatus)) throw new Error("Invalid comp decision.");
  if (reviewStatus === "excluded" && !COMP_EXCLUSION_REASONS.has(exclusionReason)) {
    throw new Error("Choose an exclusion reason.");
  }

  const member = await prisma.portfolioIqCompMember.update({
    where: { id: memberId },
    data: {
      reviewStatus,
      exclusionReason: reviewStatus === "excluded" ? exclusionReason : null,
      reviewNote,
      reviewedAt: new Date(),
      reviewedBy: userId,
      compSet: { update: { status: "proposed", reviewedAt: null, reviewedBy: null } },
    },
    select: { compSet: { select: { assetId: true } } },
  });
  await prisma.portfolioIqAsset.update({
    where: { id: member.compSet.assetId },
    data: { compSetStatus: "review" },
  });
  await prisma.portfolioIqActivationTask.updateMany({
    where: { assetId: member.compSet.assetId, taskType: "comp_setup" },
    data: { status: "in_progress", completedAt: null },
  });
  await revalidateCompReview(member.compSet.assetId);
}

export async function replaceCompMember(formData: FormData): Promise<void> {
  const userId = await requireAdmin();
  const memberId = String(formData.get("memberId") ?? "");
  const sourceRecordId = String(formData.get("sourceRecordId") ?? "");
  if (!memberId || !sourceRecordId) throw new Error("Choose a comp and its replacement.");

  const current = await prisma.portfolioIqCompMember.findUnique({
    where: { id: memberId },
    include: { compSet: { include: { asset: { include: { buildings: true } } } } },
  });
  if (!current) throw new Error("Comp member not found.");
  const listing = await prisma.marketIqListing.findFirst({
    where: { importId: current.compSet.sourceImportId, sourceRecordId },
  });
  if (!listing?.address) throw new Error("Replacement listing not found.");
  const replacementAddress = listing.address;
  const comparisonKey = normalizedAddress(replacementAddress);
  if (!comparisonKey) throw new Error("Replacement address is invalid.");
  const asset = current.compSet.asset;
  const expectedPropertyType = asset.assetType === "single_family" ? "house" : "apartment";
  if (listing.propertyType !== expectedPropertyType) throw new Error("Replacement property type does not match the subject.");
  const isSubjectAddress = asset.buildings.some((building) => {
    const subjectKey = normalizedAddress(building.canonicalAddress);
    return comparisonKey.startsWith(subjectKey) || subjectKey.startsWith(comparisonKey);
  });
  if (isSubjectAddress) throw new Error("The subject property cannot replace its own comp.");
  const selectionReason = listing.postalCode === asset.postalCode
    ? "Same ZIP code"
    : listing.city?.trim().toLowerCase() === asset.city.trim().toLowerCase()
      ? "Same city"
      : "Cleveland MSA fallback";

  await prisma.$transaction(async (tx) => {
    await tx.portfolioIqCompMember.update({
      where: { id: current.id },
      data: {
        reviewStatus: "excluded",
        exclusionReason: "other",
        reviewNote: `Replaced with ${comparisonAddress(replacementAddress)}`,
        reviewedAt: new Date(),
        reviewedBy: userId,
      },
    });
    await tx.portfolioIqCompMember.upsert({
      where: { compSetId_comparisonKey: { compSetId: current.compSetId, comparisonKey } },
      create: {
        compSetId: current.compSetId,
        comparisonKey,
        sourceRecordId: listing.sourceRecordId,
        propertyLabel: listing.communityName?.trim() || comparisonAddress(replacementAddress),
        address: replacementAddress,
        city: listing.city,
        state: listing.state,
        postalCode: listing.postalCode,
        propertyType: listing.propertyType,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        askingRent: listing.askingRent,
        squareFeet: listing.squareFeet,
        activatedAt: listing.activatedAt,
        selectionReason,
        reviewStatus: "included",
        reviewedAt: new Date(),
        reviewedBy: userId,
      },
      update: {
        sourceRecordId: listing.sourceRecordId,
        propertyLabel: listing.communityName?.trim() || comparisonAddress(replacementAddress),
        address: replacementAddress,
        city: listing.city,
        state: listing.state,
        postalCode: listing.postalCode,
        propertyType: listing.propertyType,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        askingRent: listing.askingRent,
        squareFeet: listing.squareFeet,
        activatedAt: listing.activatedAt,
        selectionReason,
        reviewStatus: "included",
        exclusionReason: null,
        reviewNote: "Added during assisted comp review",
        reviewedAt: new Date(),
        reviewedBy: userId,
      },
    });
    await tx.portfolioIqCompSet.update({
      where: { id: current.compSetId },
      data: { status: "proposed", reviewedAt: null, reviewedBy: null },
    });
    await tx.portfolioIqAsset.update({ where: { id: asset.id }, data: { compSetStatus: "review" } });
    await tx.portfolioIqActivationTask.updateMany({
      where: { assetId: asset.id, taskType: "comp_setup" },
      data: { status: "in_progress", completedAt: null },
    });
  });
  await revalidateCompReview(asset.id);
}

export async function finalizeCompSet(formData: FormData): Promise<void> {
  const userId = await requireAdmin();
  const compSetId = String(formData.get("compSetId") ?? "");
  if (!compSetId) throw new Error("Comp set not found.");
  const compSet = await prisma.portfolioIqCompSet.findUnique({
    where: { id: compSetId },
    include: { members: { select: { reviewStatus: true } } },
  });
  if (!compSet) throw new Error("Comp set not found.");
  const includedCount = compSet.members.filter((member) => member.reviewStatus !== "excluded").length;
  if (includedCount < 3) throw new Error("A locked comp set needs at least three included properties.");
  const reviewedAt = new Date();
  await prisma.$transaction([
    prisma.portfolioIqCompMember.updateMany({
      where: { compSetId, reviewStatus: "proposed" },
      data: { reviewStatus: "included", reviewedAt, reviewedBy: userId },
    }),
    prisma.portfolioIqCompSet.update({
      where: { id: compSetId },
      data: { status: "locked", reviewedAt, reviewedBy: userId },
    }),
    prisma.portfolioIqAsset.update({
      where: { id: compSet.assetId },
      data: { compSetStatus: "ready" },
    }),
    prisma.portfolioIqActivationTask.updateMany({
      where: { assetId: compSet.assetId, taskType: "comp_setup" },
      data: { status: "complete", completedAt: reviewedAt },
    }),
  ]);
  await revalidateCompReview(compSet.assetId);
}

export async function reopenCompSet(formData: FormData): Promise<void> {
  await requireAdmin();
  const compSetId = String(formData.get("compSetId") ?? "");
  const compSet = await prisma.portfolioIqCompSet.update({
    where: { id: compSetId },
    data: { status: "proposed", reviewedAt: null, reviewedBy: null },
    select: { assetId: true },
  });
  await prisma.portfolioIqAsset.update({ where: { id: compSet.assetId }, data: { compSetStatus: "review" } });
  await prisma.portfolioIqActivationTask.updateMany({
    where: { assetId: compSet.assetId, taskType: "comp_setup" },
    data: { status: "in_progress", completedAt: null },
  });
  await revalidateCompReview(compSet.assetId);
}
