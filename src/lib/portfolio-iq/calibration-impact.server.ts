import "server-only";
import { prisma } from "@/lib/prisma";
import { loadOwnerToday } from "@/lib/portfolio-iq/today.server";
import { buildOwnerAttentionQueue } from "@/lib/portfolio-iq/today";
import { compareCalibrationQueues } from "@/lib/portfolio-iq/calibration-impact";

export async function loadCalibrationImpact(input: { proposalId: string; userId: string }) {
  const proposal = await prisma.portfolioIqCalibrationProposal.findUnique({
    where: { id: input.proposalId },
    include: { portfolio: { select: { organizationId: true } } },
  });
  if (!proposal) return null;
  const today = await loadOwnerToday({
    portfolioId: proposal.portfolioId,
    organizationId: proposal.portfolio.organizationId,
    userId: input.userId,
  });
  if (!today) return null;
  const financialExposure = new Map(today.financialImpacts.flatMap((item) =>
    item.impact.status === "estimated" && item.impact.annualRealizationAdjusted !== null
      ? [[item.property.id, Math.abs(item.impact.annualRealizationAdjusted)] as const]
      : []
  ));
  const currentAdjustments = new Map(today.findingCalibrations.map((item) => [`${item.scopeKind}:${item.scopeValue}`, item.scoreAdjustment]));
  const proposedAdjustments = new Map(currentAdjustments);
  proposedAdjustments.set(`${proposal.scopeKind}:${proposal.scopeValue}`, proposal.proposedScoreAdjustment);
  const current = buildOwnerAttentionQueue(today.allSignals, { limit: 3, annualFinancialExposureByAssetId: financialExposure, calibrationAdjustments: currentAdjustments });
  const proposed = buildOwnerAttentionQueue(today.allSignals, { limit: 3, annualFinancialExposureByAssetId: financialExposure, calibrationAdjustments: proposedAdjustments });
  return compareCalibrationQueues(current, proposed);
}
