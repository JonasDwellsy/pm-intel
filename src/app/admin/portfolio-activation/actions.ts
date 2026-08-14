"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";
import { marketIqPrisma } from "@/lib/market-iq/prisma";
import { CLEVELAND_PILOT_PORTFOLIO } from "@/data/portfolio-iq/cleveland-pilot";
import {
  comparisonAddress,
  normalizedAddress,
  proposeCompMembers,
} from "@/lib/portfolio-iq/comp-generator";
import { refreshPortfolioWatchSignals } from "@/lib/portfolio-iq/watch.server";
import {
  activationTaskTypes,
  normalizeOnboardingAssetType,
  onboardingAssetSlug,
} from "@/lib/portfolio-iq/onboarding";
import { createMarketIqSourceRefresh } from "@/lib/market-iq/source-refresh.server";
import { MAX_CALIBRATION_ADJUSTMENT, recommendFindingCalibrations } from "@/lib/portfolio-iq/finding-calibration";
import { loadCalibrationImpact } from "@/lib/portfolio-iq/calibration-impact.server";

async function requireAdmin(): Promise<string> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) throw new Error("Not found.");
  return userId;
}

export async function startMarketIqTrendRefresh(formData: FormData): Promise<void> {
  const userId = await requireAdmin();
  const marketId = String(formData.get("marketId") ?? "").trim();
  if (!marketId) throw new Error("Market is required.");
  const active = await marketIqPrisma.marketIqSourceRefresh.findFirst({
    where: { marketId, sourceKind: "trends", status: { in: ["awaiting_source", "receiving"] } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (!active) {
    await createMarketIqSourceRefresh({ marketId, startedBy: userId, triggerKind: "manual" });
  }
  revalidatePath("/admin/portfolio-activation");
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

  const historicalImport = await marketIqPrisma.marketIqDataImport.findFirst({
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
        marketIqPrisma.marketIqListing.findMany({
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
const TASK_LANES = new Set(["activation_ops", "data_ops", "operator_success", "customer_success"]);

function optionalDueDate(value: FormDataEntryValue | null): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = new Date(`${text}T17:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid due date.");
  return parsed;
}

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

export async function updateActivationTask(formData: FormData): Promise<void> {
  await requireAdmin();
  const taskId = String(formData.get("taskId") ?? "");
  const status = String(formData.get("status") ?? "");
  const assignedLane = String(formData.get("assignedLane") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!taskId || !TASK_STATUSES.has(status) || !TASK_LANES.has(assignedLane)) throw new Error("Invalid task update.");
  await prisma.portfolioIqActivationTask.update({
    where: { id: taskId },
    data: {
      status,
      assignedLane,
      note: note || null,
      dueAt: optionalDueDate(formData.get("dueAt")),
      completedAt: status === "complete" ? new Date() : null,
    },
  });
  revalidatePath("/admin/portfolio-activation");
  revalidatePath("/onboarding");
}

export async function updatePilotCorrection(formData: FormData): Promise<void> {
  await requireAdmin();
  const correctionId = String(formData.get("correctionId") ?? "");
  const status = String(formData.get("status") ?? "");
  const allowed = new Set(["open", "in_progress", "complete"]);
  if (!correctionId || !allowed.has(status)) throw new Error("Correction update is invalid.");
  await prisma.portfolioIqPilotCorrection.update({
    where: { id: correctionId },
    data: { status, completedAt: status === "complete" ? new Date() : null },
  });
  revalidatePath("/admin/portfolio-activation");
  revalidatePath("/portfolio-iq/acceptance");
}

export async function generateFindingCalibrationProposals(formData: FormData): Promise<void> {
  const userId = await requireAdmin();
  const portfolioId = String(formData.get("portfolioId") ?? "").trim();
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({
    where: { id: portfolioId },
    select: {
      id: true,
      organizationId: true,
      findingFeedback: { include: { signal: { select: { signalType: true } } } },
      findingCalibrations: true,
    },
  });
  if (!portfolio) throw new Error("Portfolio not found.");
  const currentByScope = new Map(portfolio.findingCalibrations.map((item) => [`${item.scopeKind}:${item.scopeValue}`, item]));
  const feedbackSinceLastApproval = portfolio.findingFeedback.filter((item) => {
    const current = currentByScope.get(`signal_type:${item.signal.signalType}`);
    return !current || item.reviewedAt > current.approvedAt;
  });
  const recommendations = recommendFindingCalibrations(feedbackSinceLastApproval);

  await prisma.$transaction(async (tx) => {
    for (const recommendation of recommendations) {
      const current = currentByScope.get(`${recommendation.scopeKind}:${recommendation.scopeValue}`);
      if (current?.scoreAdjustment === recommendation.proposedScoreAdjustment) continue;
      const existing = await tx.portfolioIqCalibrationProposal.findFirst({
        where: { portfolioId, scopeKind: recommendation.scopeKind, scopeValue: recommendation.scopeValue, status: "proposed" },
        orderBy: { proposedAt: "desc" },
      });
      const data = {
        priorScoreAdjustment: current?.scoreAdjustment ?? 0,
        proposedScoreAdjustment: recommendation.proposedScoreAdjustment,
        sampleSize: recommendation.sampleSize,
        usefulCount: recommendation.usefulCount,
        alreadyKnownCount: recommendation.alreadyKnownCount,
        noiseCount: recommendation.noiseCount,
        contextErrorCount: recommendation.contextErrorCount,
        baselineUsefulRate: recommendation.usefulRate,
        rationale: recommendation.rationale,
        proposedBy: userId,
        proposedAt: new Date(),
      };
      if (existing) await tx.portfolioIqCalibrationProposal.update({ where: { id: existing.id }, data });
      else await tx.portfolioIqCalibrationProposal.create({ data: {
        portfolioId,
        organizationId: portfolio.organizationId,
        scopeKind: recommendation.scopeKind,
        scopeValue: recommendation.scopeValue,
        ...data,
      } });
    }
  });
  revalidatePath("/admin/portfolio-activation");
}

export async function reviewFindingCalibrationProposal(formData: FormData): Promise<void> {
  const userId = await requireAdmin();
  const proposalId = String(formData.get("proposalId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const reviewNote = String(formData.get("reviewNote") ?? "").trim().slice(0, 600);
  if (!proposalId || !["approve", "reject"].includes(decision)) throw new Error("Calibration review is invalid.");
  const proposal = await prisma.portfolioIqCalibrationProposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.status !== "proposed") throw new Error("Calibration proposal is no longer open.");
  if (Math.abs(proposal.proposedScoreAdjustment) > MAX_CALIBRATION_ADJUSTMENT) throw new Error("Calibration exceeds the permitted range.");
  const impact = decision === "approve" ? await loadCalibrationImpact({ proposalId, userId }) : null;
  if (decision === "approve" && !impact) throw new Error("Calibration impact preview is unavailable.");

  await prisma.$transaction(async (tx) => {
    if (decision === "reject") {
      await tx.portfolioIqCalibrationProposal.update({ where: { id: proposalId }, data: { status: "rejected", reviewedBy: userId, reviewedAt: new Date(), reviewNote: reviewNote || null } });
      return;
    }
    const calibration = await tx.portfolioIqFindingCalibration.upsert({
      where: { portfolioId_scopeKind_scopeValue: { portfolioId: proposal.portfolioId, scopeKind: proposal.scopeKind, scopeValue: proposal.scopeValue } },
      create: {
        portfolioId: proposal.portfolioId,
        organizationId: proposal.organizationId,
        scopeKind: proposal.scopeKind,
        scopeValue: proposal.scopeValue,
        scoreAdjustment: proposal.proposedScoreAdjustment,
        approvedBy: userId,
      },
      update: {
        scoreAdjustment: proposal.proposedScoreAdjustment,
        revision: { increment: 1 },
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });
    await tx.portfolioIqCalibrationProposal.update({
      where: { id: proposalId },
      data: { status: "approved", calibrationId: calibration.id, reviewedBy: userId, reviewedAt: new Date(), reviewNote: reviewNote || null, impactSnapshot: JSON.stringify(impact) },
    });
  });
  revalidatePath("/admin/portfolio-activation");
  revalidatePath("/today");
}

export async function rollbackFindingCalibration(formData: FormData): Promise<void> {
  const userId = await requireAdmin();
  const calibrationId = String(formData.get("calibrationId") ?? "").trim();
  const reviewNote = String(formData.get("reviewNote") ?? "").trim().slice(0, 600);
  const calibration = await prisma.portfolioIqFindingCalibration.findUnique({
    where: { id: calibrationId },
    include: { proposals: { where: { status: "approved" }, orderBy: { reviewedAt: "desc" }, take: 1 } },
  });
  const priorDecision = calibration?.proposals[0] ?? null;
  if (!calibration || !priorDecision) throw new Error("No approved calibration revision is available to roll back.");
  const rollbackAdjustment = priorDecision.priorScoreAdjustment;
  if (rollbackAdjustment === calibration.scoreAdjustment) throw new Error("Calibration is already at the prior setting.");

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.portfolioIqCalibrationProposal.create({
      data: {
        portfolioId: calibration.portfolioId,
        organizationId: calibration.organizationId,
        calibrationId: calibration.id,
        scopeKind: calibration.scopeKind,
        scopeValue: calibration.scopeValue,
        status: "approved",
        priorScoreAdjustment: calibration.scoreAdjustment,
        proposedScoreAdjustment: rollbackAdjustment,
        sampleSize: priorDecision.sampleSize,
        usefulCount: priorDecision.usefulCount,
        alreadyKnownCount: priorDecision.alreadyKnownCount,
        noiseCount: priorDecision.noiseCount,
        contextErrorCount: priorDecision.contextErrorCount,
        baselineUsefulRate: priorDecision.baselineUsefulRate,
        rationale: `Rolled back revision ${calibration.revision} to its prior score adjustment.`,
        proposedBy: userId,
        proposedAt: now,
        reviewedBy: userId,
        reviewedAt: now,
        reviewNote: reviewNote || "Administrator rollback",
        impactSnapshot: JSON.stringify({ rollback: true, from: calibration.scoreAdjustment, to: rollbackAdjustment }),
      },
    });
    await tx.portfolioIqFindingCalibration.update({
      where: { id: calibration.id },
      data: { scoreAdjustment: rollbackAdjustment, revision: { increment: 1 }, approvedBy: userId, approvedAt: now },
    });
  });
  revalidatePath("/admin/portfolio-activation");
  revalidatePath("/today");
}

const FINANCIAL_SOURCE_KINDS = new Set(["owner_interview", "owner_file", "pm_confirmed", "system_default"]);
const FINANCIAL_REVIEW_STATUSES = new Set(["draft", "verified", "needs_owner", "needs_pm"]);

function optionalFinancialUnits(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 1 || number > 100_000) throw new Error("Unit counts must be positive whole numbers.");
  return number;
}

export async function saveFinancialSetup(formData: FormData): Promise<void> {
  const userId = await requireAdmin();
  const assetId = String(formData.get("assetId") ?? "").trim();
  const bedrooms = Number(formData.get("bedrooms"));
  const inventoryUnits = optionalFinancialUnits(formData.get("inventoryUnits"));
  const affectedUnits = optionalFinancialUnits(formData.get("affectedUnits"));
  const conservativePct = Number(formData.get("conservativePercent")) / 100;
  const realizationPct = Number(formData.get("basePercent")) / 100;
  const upsidePct = Number(formData.get("upsidePercent")) / 100;
  const sourceKind = String(formData.get("sourceKind") ?? "");
  const sourceLabel = String(formData.get("sourceLabel") ?? "").trim().slice(0, 300) || null;
  const effectiveRaw = String(formData.get("effectiveAt") ?? "").trim();
  const effectiveAt = effectiveRaw ? new Date(`${effectiveRaw}T12:00:00Z`) : null;
  const reviewStatus = String(formData.get("reviewStatus") ?? "draft");
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null;
  if (!assetId || !Number.isInteger(bedrooms) || bedrooms < -1 || bedrooms > 10) throw new Error("Financial setup request is incomplete.");
  if (affectedUnits !== null && inventoryUnits !== null && affectedUnits > inventoryUnits) throw new Error("Affected units cannot exceed inventory units.");
  if (![conservativePct, realizationPct, upsidePct].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) || conservativePct > realizationPct || realizationPct > upsidePct) throw new Error("Use ordered realization assumptions between 0% and 100%.");
  if (!FINANCIAL_SOURCE_KINDS.has(sourceKind) || !FINANCIAL_REVIEW_STATUSES.has(reviewStatus)) throw new Error("Choose valid source and review statuses.");
  if (effectiveRaw && Number.isNaN(effectiveAt?.getTime())) throw new Error("Choose a valid effective date.");
  if (reviewStatus === "verified" && (!inventoryUnits || !sourceLabel || !effectiveAt)) throw new Error("Verified setup requires inventory, a source reference, and an effective date.");
  const asset = await prisma.portfolioIqAsset.findUnique({ where: { id: assetId }, select: { unitCount: true } });
  if (!asset) throw new Error("Property not found.");
  await prisma.portfolioIqFinancialAssumption.upsert({
    where: { assetId_bedrooms: { assetId, bedrooms } },
    create: { assetId, bedrooms, inventoryUnits, affectedUnits, conservativePct, realizationPct, upsidePct, sourceKind, sourceLabel, effectiveAt, reviewStatus, reviewedAt: reviewStatus === "verified" ? new Date() : null, reviewedBy: reviewStatus === "verified" ? userId : null, note, updatedBy: userId },
    update: { inventoryUnits, affectedUnits, conservativePct, realizationPct, upsidePct, sourceKind, sourceLabel, effectiveAt, reviewStatus, reviewedAt: reviewStatus === "verified" ? new Date() : null, reviewedBy: reviewStatus === "verified" ? userId : null, note, updatedBy: userId },
  });
  if (bedrooms === -1 && inventoryUnits !== null && inventoryUnits !== asset.unitCount) await prisma.portfolioIqAsset.update({ where: { id: assetId }, data: { unitCount: inventoryUnits } });
  revalidatePath(`/admin/portfolio-activation/${assetId}/financial-setup`);
  revalidatePath("/admin/portfolio-activation");
  revalidatePath("/portfolio-iq/financial-impact");
  revalidatePath("/today");
}

const ONBOARDING_STATUSES = new Set(["started", "intake_received", "call_requested", "scheduled", "activating", "launch_ready", "complete"]);

export async function updateOnboardingRequestStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "");
  const scheduledRaw = String(formData.get("scheduledFor") ?? "");
  // The assisted onboarding pilot is staffed in Cleveland and the admin UI
  // explicitly presents this field as Eastern Time. Store the instant in UTC.
  const scheduledFor = scheduledRaw ? new Date(`${scheduledRaw}:00-04:00`) : null;
  if (!requestId || !ONBOARDING_STATUSES.has(status) || (scheduledRaw && Number.isNaN(scheduledFor?.getTime()))) throw new Error("Invalid onboarding update.");
  await prisma.portfolioIqOnboardingRequest.update({
    where: { id: requestId },
    data: {
      status,
      ...(status === "scheduled" && scheduledFor ? { scheduledFor } : {}),
      completedAt: status === "complete" ? new Date() : null,
    },
  });
  revalidatePath("/admin/portfolio-activation");
  revalidatePath("/onboarding");
}

const INTAKE_OUTCOMES = new Set(["reviewed", "needs_customer"]);
const PROMOTION_MODES = new Set(["new_asset", "existing_asset"]);

export async function reviewOnboardingProperty(formData: FormData): Promise<void> {
  const userId = await requireAdmin();
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const propertyName = String(formData.get("propertyName") ?? "").trim().slice(0, 160) || null;
  const addressLine = String(formData.get("addressLine") ?? "").trim().slice(0, 300);
  const canonicalAddress = String(formData.get("canonicalAddress") ?? "").trim().slice(0, 300);
  const city = String(formData.get("city") ?? "").trim().slice(0, 100);
  const state = String(formData.get("state") ?? "").trim().toUpperCase().slice(0, 2);
  const postalCode = String(formData.get("postalCode") ?? "").trim().slice(0, 12);
  const unitCountRaw = String(formData.get("unitCount") ?? "").trim();
  const unitCount = unitCountRaw ? Number(unitCountRaw) : null;
  const assetType = normalizeOnboardingAssetType(String(formData.get("assetType") ?? ""));
  const promotionMode = String(formData.get("promotionMode") ?? "");
  const targetAssetId = String(formData.get("targetAssetId") ?? "").trim() || null;
  const dwellsyCommunityId = String(formData.get("dwellsyCommunityId") ?? "").trim().slice(0, 100) || null;
  const observedOperatorName = String(formData.get("observedOperatorName") ?? "").trim().slice(0, 200) || null;
  const confidenceRaw = String(formData.get("matchConfidence") ?? "").trim();
  const matchConfidence = confidenceRaw ? Number(confidenceRaw) : null;
  const reviewNote = String(formData.get("reviewNote") ?? "").trim().slice(0, 1000) || null;
  const outcome = String(formData.get("outcome") ?? "reviewed");

  if (!propertyId || !addressLine || !canonicalAddress || !city || !state || !postalCode) throw new Error("Complete the property address before saving review.");
  if (!PROMOTION_MODES.has(promotionMode) || !INTAKE_OUTCOMES.has(outcome)) throw new Error("Choose a valid intake decision.");
  if (promotionMode === "existing_asset" && !targetAssetId) throw new Error("Choose the asset this building belongs to.");
  if (unitCount !== null && (!Number.isInteger(unitCount) || unitCount < 1 || unitCount > 100000)) throw new Error("Enter a valid unit count.");
  if (matchConfidence !== null && (!Number.isFinite(matchConfidence) || matchConfidence < 0 || matchConfidence > 1)) throw new Error("Choose a valid match confidence.");

  const intake = await prisma.portfolioIqOnboardingProperty.findUnique({
    where: { id: propertyId },
    select: { request: { select: { portfolioId: true } } },
  });
  if (!intake) throw new Error("Intake property not found.");
  if (targetAssetId) {
    const target = await prisma.portfolioIqAsset.findFirst({ where: { id: targetAssetId, portfolioId: intake.request.portfolioId ?? "" }, select: { id: true } });
    if (!target) throw new Error("Target asset does not belong to this onboarding portfolio.");
  }

  await prisma.portfolioIqOnboardingProperty.update({
    where: { id: propertyId },
    data: {
      propertyName,
      addressLine,
      canonicalAddress,
      city,
      state,
      postalCode,
      unitCount,
      assetType,
      promotionMode,
      targetAssetId,
      dwellsyCommunityId,
      observedOperatorName,
      matchConfidence,
      reviewNote,
      status: outcome,
      reviewedAt: new Date(),
      reviewedBy: userId,
    },
  });
  revalidatePath("/admin/portfolio-activation");
  revalidatePath(`/admin/portfolio-activation/intake/${String(formData.get("requestId") ?? "")}`);
}

export async function connectOnboardingPortfolio(formData: FormData): Promise<void> {
  await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "").trim();
  const portfolioId = String(formData.get("portfolioId") ?? "").trim();
  const request = await prisma.portfolioIqOnboardingRequest.findUnique({ where: { id: requestId }, select: { organizationId: true } });
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({ where: { id: portfolioId }, select: { organizationId: true } });
  if (!request || !portfolio || request.organizationId !== portfolio.organizationId) throw new Error("Choose a portfolio owned by this customer organization.");
  await prisma.portfolioIqOnboardingRequest.update({ where: { id: requestId }, data: { portfolioId } });
  revalidatePath("/admin/portfolio-activation");
  revalidatePath(`/admin/portfolio-activation/intake/${requestId}`);
}

export async function promoteOnboardingProperty(formData: FormData): Promise<void> {
  await requireAdmin();
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const intake = await prisma.portfolioIqOnboardingProperty.findUnique({
    where: { id: propertyId },
    include: { request: { select: { id: true, portfolioId: true } } },
  });
  if (!intake || !intake.request.portfolioId) throw new Error("Connect this request to a portfolio before promotion.");
  if (intake.status !== "reviewed" || !intake.promotionMode) throw new Error("Complete and approve the property review before promotion.");
  if (!intake.canonicalAddress || !intake.city || !intake.state || !intake.postalCode) throw new Error("The reviewed address is incomplete.");

  const portfolioId = intake.request.portfolioId;
  const canonicalAddress = intake.canonicalAddress;
  const city = intake.city;
  const state = intake.state;
  const postalCode = intake.postalCode;
  const assetType = normalizeOnboardingAssetType(intake.assetType);
  const matched = Boolean(intake.dwellsyCommunityId);
  const displayName = intake.propertyName || canonicalAddress.split(",")[0] || "Portfolio property";

  const assetId = await prisma.$transaction(async (tx) => {
    let assetId: string;
    if (intake.promotionMode === "existing_asset") {
      const target = await tx.portfolioIqAsset.findFirst({ where: { id: intake.targetAssetId ?? "", portfolioId }, select: { id: true } });
      if (!target) throw new Error("The selected target asset is no longer available.");
      assetId = target.id;
      await tx.portfolioIqBuilding.upsert({
        where: { assetId_canonicalAddress: { assetId, canonicalAddress } },
        create: { assetId, label: intake.propertyName, suppliedAddress: intake.addressLine, canonicalAddress, city, state, postalCode, dwellsyCommunityId: intake.dwellsyCommunityId, isPrimary: false },
        update: { label: intake.propertyName, suppliedAddress: intake.addressLine, city, state, postalCode, dwellsyCommunityId: intake.dwellsyCommunityId },
      });
    } else {
      const baseSlug = onboardingAssetSlug(displayName);
      let slug = baseSlug;
      let suffix = 2;
      while (await tx.portfolioIqAsset.findUnique({ where: { portfolioId_slug: { portfolioId, slug } }, select: { id: true } })) slug = `${baseSlug}-${suffix++}`;
      const sortOrder = await tx.portfolioIqAsset.count({ where: { portfolioId } });
      const asset = await tx.portfolioIqAsset.create({
        data: {
          portfolioId,
          slug,
          name: displayName,
          assetType,
          suppliedAddress: intake.addressLine,
          canonicalAddress,
          city,
          state,
          postalCode,
          unitCount: intake.unitCount,
          dwellsyCommunityId: intake.dwellsyCommunityId,
          matchStatus: matched ? "matched" : "needs_review",
          matchConfidence: intake.matchConfidence,
          observedOperatorName: intake.observedOperatorName,
          sourceNote: `Promoted from assisted onboarding intake ${intake.id}.`,
          sortOrder,
          buildings: { create: { label: intake.propertyName, suppliedAddress: intake.addressLine, canonicalAddress, city, state, postalCode, dwellsyCommunityId: intake.dwellsyCommunityId, isPrimary: true } },
        },
        select: { id: true },
      });
      assetId = asset.id;
    }

    if (intake.observedOperatorName) {
      const assignment = await tx.portfolioIqOperatorAssignment.findFirst({ where: { assetId, observedOperatorName: intake.observedOperatorName, isCurrent: true }, select: { id: true } });
      if (!assignment) await tx.portfolioIqOperatorAssignment.create({ data: { assetId, observedOperatorName: intake.observedOperatorName, sourceKind: "assisted_onboarding", verificationStatus: "observed" } });
    }
    for (const taskType of activationTaskTypes({ matched, hasObservedOperator: Boolean(intake.observedOperatorName) })) {
      await tx.portfolioIqActivationTask.upsert({
        where: { assetId_taskType: { assetId, taskType } },
        create: { assetId, taskType, note: taskType === "comp_setup" ? "Build and review the initial comparable set before customer launch." : `Created from assisted onboarding intake ${intake.id}.` },
        update: {},
      });
    }
    await tx.portfolioIqOnboardingProperty.update({ where: { id: intake.id }, data: { status: "activated", activatedAssetId: assetId } });
    await tx.portfolioIqOnboardingRequest.update({ where: { id: intake.request.id }, data: { status: "activating" } });
    return assetId;
  });

  await refreshPortfolioWatchSignals(portfolioId);
  revalidatePath("/admin/portfolio-activation");
  revalidatePath(`/admin/portfolio-activation/intake/${intake.request.id}`);
  revalidatePath("/portfolio-iq");
  const asset = await prisma.portfolioIqAsset.findUnique({ where: { id: assetId }, select: { slug: true } });
  if (asset) revalidatePath(`/portfolio-iq/properties/${asset.slug}`);
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
  const listing = await marketIqPrisma.marketIqListing.findFirst({
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

export async function addCompSegmentCandidate(formData: FormData): Promise<void> {
  const userId = await requireAdmin();
  const compSetId = String(formData.get("compSetId") ?? "");
  const sourceRecordId = String(formData.get("sourceRecordId") ?? "");
  const bedrooms = Number(formData.get("bedrooms"));
  if (!compSetId || !sourceRecordId || !Number.isInteger(bedrooms) || bedrooms < 0 || bedrooms > 5) throw new Error("Invalid segment candidate.");
  const compSet = await prisma.portfolioIqCompSet.findUnique({ where: { id: compSetId }, include: { asset: { include: { buildings: true } } } });
  if (!compSet) throw new Error("Comp set not found.");
  const listing = await marketIqPrisma.marketIqListing.findFirst({ where: { importId: compSet.sourceImportId, sourceRecordId } });
  if (!listing?.address || listing.bedrooms !== bedrooms) throw new Error("Candidate does not match the bedroom segment.");
  const expectedType = compSet.asset.assetType === "single_family" ? "house" : "apartment";
  if (listing.propertyType !== expectedType) throw new Error("Candidate property type does not match.");
  const comparisonKey = normalizedAddress(listing.address);
  if (compSet.asset.buildings.some((building) => {
    const subjectKey = normalizedAddress(building.canonicalAddress);
    return comparisonKey.startsWith(subjectKey) || subjectKey.startsWith(comparisonKey);
  })) throw new Error("The subject property cannot be its own comp.");
  const selectionReason = listing.postalCode === compSet.asset.postalCode
    ? "Same ZIP code"
    : listing.city?.trim().toLowerCase() === compSet.asset.city.trim().toLowerCase()
      ? "Same city"
      : "Cleveland MSA fallback";
  await prisma.$transaction([
    prisma.portfolioIqCompMember.upsert({
      where: { compSetId_comparisonKey: { compSetId, comparisonKey } },
      create: {
        compSetId, comparisonKey, sourceRecordId: listing.sourceRecordId,
        propertyLabel: listing.communityName?.trim() || comparisonAddress(listing.address),
        address: listing.address, city: listing.city, state: listing.state, postalCode: listing.postalCode,
        propertyType: listing.propertyType, bedrooms: listing.bedrooms, bathrooms: listing.bathrooms,
        askingRent: listing.askingRent, squareFeet: listing.squareFeet, activatedAt: listing.activatedAt,
        selectionReason, reviewStatus: "included", reviewNote: `Added for ${bedrooms}-bedroom segment`, reviewedAt: new Date(), reviewedBy: userId,
      },
      update: { reviewStatus: "included", exclusionReason: null, reviewNote: `Added for ${bedrooms}-bedroom segment`, reviewedAt: new Date(), reviewedBy: userId },
    }),
    prisma.portfolioIqCompSegment.upsert({
      where: { compSetId_bedrooms: { compSetId, bedrooms } },
      create: { compSetId, bedrooms, status: "proposed" },
      update: { status: "proposed", reviewedAt: null, reviewedBy: null },
    }),
  ]);
  await revalidateCompReview(compSet.assetId);
}

export async function lockCompSegment(formData: FormData): Promise<void> {
  const userId = await requireAdmin();
  const compSetId = String(formData.get("compSetId") ?? "");
  const bedrooms = Number(formData.get("bedrooms"));
  if (!compSetId || !Number.isInteger(bedrooms)) throw new Error("Invalid bedroom segment.");
  const compSet = await prisma.portfolioIqCompSet.findUnique({
    where: { id: compSetId },
    include: { members: { where: { reviewStatus: { not: "excluded" }, bedrooms } } },
  });
  if (!compSet) throw new Error("Comp set not found.");
  const distinctProperties = new Set(compSet.members.map((member) => normalizedAddress(member.address)));
  if (distinctProperties.size < 3) throw new Error("A bedroom segment needs at least three distinct approved comparable properties.");
  await prisma.portfolioIqCompSegment.upsert({
    where: { compSetId_bedrooms: { compSetId, bedrooms } },
    create: { compSetId, bedrooms, status: "locked", reviewedAt: new Date(), reviewedBy: userId },
    update: { status: "locked", reviewedAt: new Date(), reviewedBy: userId },
  });
  await revalidateCompReview(compSet.assetId);
}

export async function reopenCompSegment(formData: FormData): Promise<void> {
  await requireAdmin();
  const segmentId = String(formData.get("segmentId") ?? "");
  const segment = await prisma.portfolioIqCompSegment.update({ where: { id: segmentId }, data: { status: "proposed", reviewedAt: null, reviewedBy: null }, select: { compSet: { select: { assetId: true } } } });
  await revalidateCompReview(segment.compSet.assetId);
}
