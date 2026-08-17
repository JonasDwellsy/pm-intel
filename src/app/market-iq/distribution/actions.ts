"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { deliverMarketIqReportToRecipient } from "@/lib/market-iq/report/delivery.server";
import { marketIqClipped, marketIqValidEmail } from "@/lib/market-iq/report/form-values";
import { parseMarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { prisma } from "@/lib/prisma";

async function authorizedContext() {
  if (!marketIqPreviewEnabled()) return null;
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId || !organizationId || !access.hasProduct || !access.capabilities.manageRecipients || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) return null;
  return { organizationId, userId, capabilities: access.capabilities };
}

export async function saveMarketIqRecipient(formData: FormData): Promise<void> {
  const context = await authorizedContext();
  const name = marketIqClipped(formData.get("name"), 120);
  const email = marketIqClipped(formData.get("email"), 254).toLowerCase();
  const kind = marketIqClipped(formData.get("kind"), 20);
  if (!context || !name || !marketIqValidEmail(email) || !["client", "prospect"].includes(kind)) throw new Error("Enter a valid client or prospect.");
  await prisma.marketIqReportRecipient.upsert({
    where: { organizationId_email: { organizationId: context.organizationId, email } },
    create: { organizationId: context.organizationId, name, email, kind },
    update: { name, kind },
  });
  revalidatePath("/market-iq/distribution");
  redirect("/market-iq/distribution?saved=1");
}

export async function startMarketIqDistributionCampaign(formData: FormData): Promise<void> {
  const context = await authorizedContext();
  const reportId = marketIqClipped(formData.get("reportId"), 80);
  if (!context || !reportId) throw new Error("Choose a published report.");
  const report = await prisma.marketIqReport.findFirst({
    where: { id: reportId, organizationId: context.organizationId, status: "published" },
    select: { id: true },
  });
  if (!report) throw new Error("Published report not found.");
  const existing = await prisma.marketIqDistributionCampaign.findFirst({
    where: { organizationId: context.organizationId, reportId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const campaign = existing ?? await prisma.marketIqDistributionCampaign.create({
    data: { organizationId: context.organizationId, reportId, createdByUserId: context.userId },
    select: { id: true },
  });
  redirect(`/market-iq/distribution/${campaign.id}`);
}

export async function saveMarketIqCampaignAudience(formData: FormData): Promise<void> {
  const context = await authorizedContext();
  const campaignId = marketIqClipped(formData.get("campaignId"), 80);
  const selectedIds = formData.getAll("recipientId").map((value) => marketIqClipped(value, 80)).filter(Boolean).slice(0, 100);
  if (!context || !campaignId) throw new Error("Distribution draft not found.");
  const campaign = await prisma.marketIqDistributionCampaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId, status: { in: ["draft", "ready", "partial"] } },
    select: { id: true, reportId: true, report: { select: { snapshot: true } } },
  });
  if (!campaign) throw new Error("This distribution draft cannot be edited.");
  const snapshot = parseMarketIqReportSnapshot(campaign.report.snapshot);
  if (!snapshot) throw new Error("The published report snapshot is unavailable.");
  const audienceKind = snapshot.editorial?.audienceKind;
  const recipients = selectedIds.length ? await prisma.marketIqReportRecipient.findMany({
    where: { id: { in: selectedIds }, organizationId: context.organizationId, ...(audienceKind ? { kind: audienceKind } : {}) },
    select: { id: true },
  }) : [];
  await prisma.$transaction(async (tx) => {
    await tx.marketIqDistributionCampaignRecipient.deleteMany({
      where: { campaignId, status: "pending", recipientId: { notIn: recipients.map(({ id }) => id) } },
    });
    if (recipients.length) {
      await tx.marketIqDistributionCampaignRecipient.createMany({
        data: recipients.map(({ id }) => ({
          organizationId: context.organizationId,
          campaignId,
          reportId: campaign.reportId,
          recipientId: id,
        })),
        skipDuplicates: true,
      });
    }
    await tx.marketIqDistributionCampaign.update({
      where: { id: campaignId },
      data: { status: recipients.length ? "ready" : "draft" },
    });
  });
  revalidatePath(`/market-iq/distribution/${campaignId}`);
  redirect(`/market-iq/distribution/${campaignId}?stage=review`);
}

export async function setMarketIqRecipientSuppression(formData: FormData): Promise<void> {
  const context = await authorizedContext();
  const recipientId = marketIqClipped(formData.get("recipientId"), 80);
  const campaignId = marketIqClipped(formData.get("campaignId"), 80);
  const suppress = marketIqClipped(formData.get("suppress"), 8) === "1";
  if (!context || !recipientId) throw new Error("Recipient not found.");
  await prisma.marketIqReportRecipient.updateMany({
    where: { id: recipientId, organizationId: context.organizationId },
    data: suppress
      ? { emailStatus: "suppressed", suppressionReason: "Manually suppressed by organization", suppressedAt: new Date() }
      : { emailStatus: "active", suppressionReason: null, suppressedAt: null },
  });
  if (campaignId) {
    await prisma.marketIqDistributionCampaignRecipient.updateMany({
      where: { campaignId, organizationId: context.organizationId, recipientId, status: { in: suppress ? ["pending", "failed"] : ["suppressed"] } },
      data: suppress
        ? { status: "suppressed", lastError: "Manually suppressed by organization" }
        : { status: "pending", lastError: null },
    });
  }
  revalidatePath("/market-iq/distribution");
  if (campaignId) revalidatePath(`/market-iq/distribution/${campaignId}`);
}

export async function sendMarketIqCampaignRecipient(formData: FormData): Promise<void> {
  const context = await authorizedContext();
  const campaignRecipientId = marketIqClipped(formData.get("campaignRecipientId"), 80);
  const confirmation = marketIqClipped(formData.get("confirmation"), 80);
  if (!context || !context.capabilities.sendReports || !campaignRecipientId || confirmation !== campaignRecipientId) {
    throw new Error("Confirm this exact recipient before sending.");
  }
  const row = await prisma.marketIqDistributionCampaignRecipient.findFirst({
    where: { id: campaignRecipientId, organizationId: context.organizationId },
    include: {
      campaign: { select: { id: true, status: true } },
      recipient: { select: { id: true, kind: true, emailStatus: true, suppressionReason: true } },
      report: { select: { status: true, snapshot: true } },
    },
  });
  if (!row || row.report.status !== "published") throw new Error("This delivery is unavailable.");
  const snapshot = parseMarketIqReportSnapshot(row.report.snapshot);
  if (!snapshot) throw new Error("The published report snapshot is unavailable.");
  if (snapshot.editorial?.audienceKind && snapshot.editorial.audienceKind !== row.recipient.kind) {
    throw new Error("This recipient does not match the reviewed edition audience.");
  }
  if (row.recipient.emailStatus === "suppressed") {
    await prisma.marketIqDistributionCampaignRecipient.update({
      where: { id: row.id },
      data: { status: "suppressed", lastError: row.recipient.suppressionReason ?? "Recipient is suppressed." },
    });
    redirect(`/market-iq/distribution/${row.campaign.id}?delivery=suppressed`);
  }
  const staleSendingBefore = new Date(Date.now() - 5 * 60 * 1_000);
  const claimed = await prisma.marketIqDistributionCampaignRecipient.updateMany({
    where: {
      id: row.id,
      organizationId: context.organizationId,
      OR: [
        { status: { in: ["pending", "failed"] } },
        { status: "sending", updatedAt: { lt: staleSendingBefore } },
      ],
    },
    data: { status: "sending", lastError: null, attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) redirect(`/market-iq/distribution/${row.campaign.id}?delivery=unchanged`);
  await prisma.marketIqDistributionCampaign.update({ where: { id: row.campaign.id }, data: { status: "sending", confirmedAt: new Date() } });

  let result: Awaited<ReturnType<typeof deliverMarketIqReportToRecipient>>;
  try {
    result = await deliverMarketIqReportToRecipient({
      organizationId: context.organizationId,
      reportId: row.reportId,
      recipientId: row.recipientId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delivery failed before SendGrid accepted it.";
    await prisma.marketIqDistributionCampaignRecipient.update({
      where: { id: row.id },
      data: { status: "failed", lastError: message.slice(0, 1_000) },
    });
    await prisma.marketIqDistributionCampaign.update({ where: { id: row.campaign.id }, data: { status: "partial" } });
    redirect(`/market-iq/distribution/${row.campaign.id}?delivery=failed`);
  }

  await prisma.marketIqDistributionCampaignRecipient.update({
    where: { id: row.id },
    data: result.status === "sent"
      ? { status: "sent", sendId: result.sendId, sentAt: new Date(), lastError: null }
      : result.status === "already_sent"
        ? { status: "already_sent", sendId: result.sendId, lastError: null }
        : result.status === "suppressed"
          ? { status: "suppressed", lastError: result.reason }
          : { status: "failed", sendId: result.sendId, lastError: result.error.slice(0, 1_000) },
  });
  const [unfinished, failed] = await Promise.all([
    prisma.marketIqDistributionCampaignRecipient.count({ where: { campaignId: row.campaign.id, status: { in: ["pending", "sending"] } } }),
    prisma.marketIqDistributionCampaignRecipient.count({ where: { campaignId: row.campaign.id, status: { in: ["failed", "suppressed"] } } }),
  ]);
  const nextCampaignStatus = unfinished > 0
    ? "ready"
    : failed > 0
      ? "partial"
      : "complete";
  await prisma.marketIqDistributionCampaign.update({
    where: { id: row.campaign.id },
    data: nextCampaignStatus === "complete"
      ? { status: nextCampaignStatus, completedAt: new Date() }
      : { status: nextCampaignStatus },
  });
  revalidatePath(`/market-iq/distribution/${row.campaign.id}`);
  revalidatePath(`/market-iq/delivery/${row.campaign.id}`);
  revalidatePath("/market-iq/distribution");
  if (nextCampaignStatus !== "ready") {
    redirect(`/market-iq/delivery/${row.campaign.id}?result=${result.status}`);
  }
  redirect(`/market-iq/distribution/${row.campaign.id}?delivery=${result.status}`);
}
