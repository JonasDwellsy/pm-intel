import "server-only";

import { randomBytes } from "node:crypto";
import { deliverMarketIqReportToRecipient } from "@/lib/market-iq/report/delivery.server";
import { parseMarketIqReportSnapshot, type MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { prisma } from "@/lib/prisma";

export type MarketIqAutopilotResult = {
  state: "published" | "already_published" | "not_enabled" | "draft_unavailable";
  reportId: string | null;
  campaignId: string | null;
  approvedRecipients: number;
  sent: number;
  failed: number;
  suppressed: number;
};

function brandFromProfile(profile: {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
}): MarketIqReportSnapshot["brand"] {
  return {
    displayName: profile.displayName,
    logoUrl: profile.logoUrl,
    primaryColor: profile.primaryColor,
    accentColor: profile.accentColor,
    contactName: profile.contactName,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    websiteUrl: profile.websiteUrl,
  };
}

/**
 * Publishes one already-frozen recurring draft and delivers it only to people
 * who were explicitly approved for monthly delivery. A failed row is never
 * selected again by this function, so a retry still requires a person to click.
 */
export async function publishAndDeliverMarketIqAutopilotEdition(input: {
  organizationId: string;
  marketId: string;
  draftId: string;
  actorUserId: string;
}): Promise<MarketIqAutopilotResult> {
  const [preference, draft, brandProfile, priorReport] = await Promise.all([
    prisma.marketIqMarketPreference.findUnique({
      where: { organizationId_marketId: { organizationId: input.organizationId, marketId: input.marketId } },
      select: { deliveryMode: true, recurringEditionsEnabled: true },
    }),
    prisma.marketIqEditionDraft.findFirst({
      where: {
        id: input.draftId,
        organizationId: input.organizationId,
        marketId: input.marketId,
        status: { in: ["ready", "reviewing", "published"] },
      },
      select: { id: true, status: true, periodEnd: true, snapshot: true },
    }),
    prisma.organizationBrandProfile.findUnique({ where: { organizationId: input.organizationId } }),
    prisma.marketIqReport.findFirst({
      where: { organizationId: input.organizationId, marketId: input.marketId, status: "published" },
      orderBy: { publishedAt: "desc" },
      select: { id: true, snapshot: true },
    }),
  ]);

  if (!preference?.recurringEditionsEnabled || preference.deliveryMode !== "autopilot") {
    return { state: "not_enabled", reportId: null, campaignId: null, approvedRecipients: 0, sent: 0, failed: 0, suppressed: 0 };
  }
  if (!draft || !brandProfile) {
    return { state: "draft_unavailable", reportId: null, campaignId: null, approvedRecipients: 0, sent: 0, failed: 0, suppressed: 0 };
  }

  const draftSnapshot = parseMarketIqReportSnapshot(draft.snapshot);
  const priorSnapshot = priorReport ? parseMarketIqReportSnapshot(priorReport.snapshot) : null;
  if (!draftSnapshot) {
    return { state: "draft_unavailable", reportId: null, campaignId: null, approvedRecipients: 0, sent: 0, failed: 0, suppressed: 0 };
  }

  const now = new Date();
  const priorEditorial = priorSnapshot?.editorial;
  const audienceKind = priorEditorial?.audienceKind ?? "client";
  const frozenSnapshot: MarketIqReportSnapshot = {
    ...draftSnapshot,
    generatedAt: now.toISOString(),
    brand: brandFromProfile(brandProfile),
    editorial: {
      audienceKind,
      headline: priorEditorial?.headline ?? null,
      introduction: priorEditorial?.introduction
        ?? (audienceKind === "prospect" ? brandProfile.defaultProspectMessage : brandProfile.defaultClientMessage)
        ?? null,
      companyProfile: priorEditorial?.companyProfile ?? brandProfile.companyProfile,
      companyCtaLabel: priorEditorial?.companyCtaLabel ?? brandProfile.companyCtaLabel,
      companyCtaUrl: priorEditorial?.companyCtaUrl ?? brandProfile.companyCtaUrl,
      reviewedAt: now.toISOString(),
      reviewedBy: "Monthly autopilot",
    },
  };

  let report = await prisma.marketIqReport.findUnique({
    where: { editionDraftId: draft.id },
    select: { id: true },
  });
  let created = false;
  if (!report) {
    try {
      report = await prisma.$transaction(async (tx) => {
        const createdReport = await tx.marketIqReport.create({
          data: {
            organizationId: input.organizationId,
            marketId: input.marketId,
            periodLabel: `${draftSnapshot.scope.periodStart} to ${draftSnapshot.scope.periodEnd}`,
            publicToken: randomBytes(24).toString("base64url"),
            status: "published",
            scope: JSON.stringify(draftSnapshot.scope),
            snapshot: JSON.stringify(frozenSnapshot),
            subjectAddress: null,
            brandProfileId: brandProfile.id,
            generatedBy: input.actorUserId,
            editionDraftId: draft.id,
            publishedAt: now,
          },
          select: { id: true },
        });
        await tx.marketIqEditionDraft.update({
          where: { id: draft.id },
          data: { status: "published", reviewedAt: now, publishedReportId: createdReport.id },
        });
        return createdReport;
      });
      created = true;
    } catch (error) {
      report = await prisma.marketIqReport.findUnique({ where: { editionDraftId: draft.id }, select: { id: true } });
      if (!report) throw error;
    }
  }

  let campaign = await prisma.marketIqDistributionCampaign.findFirst({
    where: { organizationId: input.organizationId, reportId: report.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!campaign) {
    campaign = await prisma.marketIqDistributionCampaign.create({
      data: {
        organizationId: input.organizationId,
        reportId: report.id,
        createdByUserId: input.actorUserId,
      },
      select: { id: true },
    });
  }

  const approvedRecipients = await prisma.marketIqReportRecipient.findMany({
    where: {
      organizationId: input.organizationId,
      kind: audienceKind,
      emailStatus: "active",
      recurringDeliveryApprovedAt: { not: null },
    },
    select: { id: true },
  });
  if (approvedRecipients.length) {
    await prisma.marketIqDistributionCampaignRecipient.createMany({
      data: approvedRecipients.map(({ id }) => ({
        organizationId: input.organizationId,
        campaignId: campaign.id,
        reportId: report!.id,
        recipientId: id,
      })),
      skipDuplicates: true,
    });
  }

  const pendingRows = await prisma.marketIqDistributionCampaignRecipient.findMany({
    where: { campaignId: campaign.id, status: "pending" },
    select: { id: true, recipientId: true },
  });
  if (pendingRows.length) {
    await prisma.marketIqDistributionCampaign.update({
      where: { id: campaign.id },
      data: { status: "sending", confirmedAt: now },
    });
  }

  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  for (const row of pendingRows) {
    const claimed = await prisma.marketIqDistributionCampaignRecipient.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "sending", attemptCount: { increment: 1 }, lastError: null },
    });
    if (claimed.count !== 1) continue;
    try {
      const result = await deliverMarketIqReportToRecipient({
        organizationId: input.organizationId,
        reportId: report.id,
        recipientId: row.recipientId,
      });
      if (result.status === "sent" || result.status === "already_sent") sent += 1;
      else if (result.status === "suppressed") suppressed += 1;
      else failed += 1;
      await prisma.marketIqDistributionCampaignRecipient.update({
        where: { id: row.id },
        data: result.status === "sent"
          ? { status: "sent", sendId: result.sendId, sentAt: new Date() }
          : result.status === "already_sent"
            ? { status: "already_sent", sendId: result.sendId }
            : result.status === "suppressed"
              ? { status: "suppressed", lastError: result.reason }
              : { status: "failed", sendId: result.sendId, lastError: result.error.slice(0, 1_000) },
      });
    } catch (error) {
      failed += 1;
      await prisma.marketIqDistributionCampaignRecipient.update({
        where: { id: row.id },
        data: { status: "failed", lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Delivery failed." },
      });
    }
  }

  const [unfinished, unsuccessful] = await Promise.all([
    prisma.marketIqDistributionCampaignRecipient.count({ where: { campaignId: campaign.id, status: { in: ["pending", "sending"] } } }),
    prisma.marketIqDistributionCampaignRecipient.count({ where: { campaignId: campaign.id, status: { in: ["failed", "suppressed"] } } }),
  ]);
  const campaignStatus = unfinished > 0 ? "ready" : unsuccessful > 0 ? "partial" : approvedRecipients.length ? "complete" : "draft";
  await prisma.marketIqDistributionCampaign.update({
    where: { id: campaign.id },
    data: campaignStatus === "complete" ? { status: campaignStatus, completedAt: new Date() } : { status: campaignStatus },
  });

  return {
    state: created ? "published" : "already_published",
    reportId: report.id,
    campaignId: campaign.id,
    approvedRecipients: approvedRecipients.length,
    sent,
    failed,
    suppressed,
  };
}
