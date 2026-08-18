"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import {
  marketIqJourneyEventData,
  marketIqMilestoneDedupeKey,
  recordMarketIqJourneyEvent,
} from "@/lib/market-iq/journey-telemetry.server";
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

function launchFlow(formData: FormData) {
  return marketIqClipped(formData.get("flow"), 20) === "launch";
}

function withLaunchFlow(path: string, enabled: boolean) {
  if (!enabled) return path;
  return `${path}${path.includes("?") ? "&" : "?"}flow=launch`;
}

export async function saveMarketIqRecipient(formData: FormData): Promise<void> {
  const context = await authorizedContext();
  const name = marketIqClipped(formData.get("name"), 120);
  const email = marketIqClipped(formData.get("email"), 254).toLowerCase();
  const kind = marketIqClipped(formData.get("kind"), 20);
  const approveRecurring = marketIqClipped(formData.get("approveRecurringDelivery"), 8) === "1";
  const approvalData = approveRecurring
    ? { recurringDeliveryApprovedAt: new Date(), recurringDeliveryApprovedByUserId: context?.userId ?? null }
    : {};
  if (!context || !name || !marketIqValidEmail(email) || !["client", "prospect"].includes(kind)) throw new Error("Enter a valid client or prospect.");
  const recipient = await prisma.marketIqReportRecipient.upsert({
    where: { organizationId_email: { organizationId: context.organizationId, email } },
    create: { organizationId: context.organizationId, name, email, kind, ...approvalData },
    update: { name, kind, ...approvalData },
    select: { id: true },
  });
  await recordMarketIqJourneyEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    eventKey: "first_recipient_saved",
    milestone: "recipient",
    sourceRoute: "/market-iq/distribution",
    subjectId: recipient.id,
    dedupeKey: marketIqMilestoneDedupeKey(context.organizationId, "recipient"),
    metadata: { kind },
  });
  revalidatePath("/market-iq/distribution");
  if (marketIqClipped(formData.get("returnTo"), 20) === "launch") redirect("/market-iq/launch?recipient=1");
  redirect("/market-iq/distribution?saved=1");
}

export async function bulkImportMarketIqRecipients(formData: FormData): Promise<void> {
  const context = await authorizedContext();
  const raw = marketIqClipped(formData.get("recipients"), 300_000);
  if (!context || !raw) throw new Error("Choose a recipient spreadsheet to import.");

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error("The recipient spreadsheet could not be read.");
  }
  if (!Array.isArray(input) || input.length < 1 || input.length > 1_000) {
    throw new Error("Import between 1 and 1,000 recipients at a time.");
  }

  const rows = input.map((value) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      name: marketIqClipped(String(row.name ?? ""), 120),
      email: marketIqClipped(String(row.email ?? ""), 254).toLowerCase(),
      kind: marketIqClipped(String(row.kind ?? ""), 20),
    };
  });
  if (rows.some((row) => !row.name || !marketIqValidEmail(row.email) || !["client", "prospect"].includes(row.kind))) {
    throw new Error("Every imported recipient needs a valid name, email, and relationship.");
  }
  if (new Set(rows.map((row) => row.email)).size !== rows.length) {
    throw new Error("Remove duplicate email addresses from the spreadsheet and try again.");
  }

  const existing = await prisma.marketIqReportRecipient.findMany({
    where: { organizationId: context.organizationId, email: { in: rows.map((row) => row.email) } },
    select: { email: true },
  });
  const existingEmails = new Set(existing.map((row) => row.email));
  await prisma.$transaction(rows.map((row) => prisma.marketIqReportRecipient.upsert({
    where: { organizationId_email: { organizationId: context.organizationId, email: row.email } },
    create: { organizationId: context.organizationId, ...row },
    update: { name: row.name, kind: row.kind },
  })));

  await recordMarketIqJourneyEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    eventKey: "recipient_bulk_imported",
    milestone: "recipient",
    sourceRoute: "/market-iq/distribution",
    metadata: { imported: rows.length - existingEmails.size, updated: existingEmails.size },
  });
  revalidatePath("/market-iq/distribution");
  redirect(`/market-iq/distribution?imported=${rows.length - existingEmails.size}&updated=${existingEmails.size}`);
}

export async function setMarketIqRecipientRecurringApproval(formData: FormData): Promise<void> {
  const context = await authorizedContext();
  const recipientId = marketIqClipped(formData.get("recipientId"), 80);
  const approve = marketIqClipped(formData.get("approve"), 8) === "1";
  const confirmation = marketIqClipped(formData.get("confirmation"), 80);
  if (!context || !recipientId || (approve && confirmation !== recipientId)) {
    throw new Error("Confirm this exact recipient before adding them to monthly delivery.");
  }
  await prisma.marketIqReportRecipient.updateMany({
    where: { id: recipientId, organizationId: context.organizationId },
    data: approve
      ? { recurringDeliveryApprovedAt: new Date(), recurringDeliveryApprovedByUserId: context.userId }
      : { recurringDeliveryApprovedAt: null, recurringDeliveryApprovedByUserId: null },
  });
  revalidatePath("/market-iq/distribution");
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
  redirect(withLaunchFlow(`/market-iq/distribution/${campaign.id}`, launchFlow(formData)));
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
    if (recipients.length) {
      await tx.marketIqJourneyEvent.createMany({
        data: [marketIqJourneyEventData({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          eventKey: "first_campaign_audience_confirmed",
          milestone: "audience",
          sourceRoute: `/market-iq/distribution/${campaignId}`,
          subjectId: campaignId,
          dedupeKey: marketIqMilestoneDedupeKey(context.organizationId, "audience"),
          metadata: { recipientCount: recipients.length },
        })],
        skipDuplicates: true,
      });
    }
  });
  revalidatePath(`/market-iq/distribution/${campaignId}`);
  redirect(withLaunchFlow(`/market-iq/distribution/${campaignId}?stage=review`, launchFlow(formData)));
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
  const preserveLaunchFlow = launchFlow(formData);
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
    redirect(withLaunchFlow(`/market-iq/distribution/${row.campaign.id}?delivery=suppressed`, preserveLaunchFlow));
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
  if (claimed.count !== 1) redirect(withLaunchFlow(`/market-iq/distribution/${row.campaign.id}?delivery=unchanged`, preserveLaunchFlow));
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
    await recordMarketIqJourneyEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      eventKey: "recipient_delivery_failed",
      milestone: "delivery",
      status: "failed",
      sourceRoute: `/market-iq/distribution/${row.campaign.id}`,
      subjectId: row.id,
      metadata: { campaignId: row.campaign.id, attempt: row.attemptCount + 1 },
    });
    redirect(withLaunchFlow(`/market-iq/distribution/${row.campaign.id}?delivery=failed`, preserveLaunchFlow));
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
  await recordMarketIqJourneyEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    eventKey: result.status === "sent" || result.status === "already_sent"
      ? "first_recipient_delivery_confirmed"
      : `recipient_delivery_${result.status}`,
    milestone: "delivery",
    status: result.status === "sent" || result.status === "already_sent" ? "completed" : "failed",
    sourceRoute: `/market-iq/distribution/${row.campaign.id}`,
    subjectId: row.id,
    dedupeKey: result.status === "sent" || result.status === "already_sent"
      ? marketIqMilestoneDedupeKey(context.organizationId, "delivery")
      : null,
    metadata: { campaignId: row.campaign.id, providerStatus: result.status, attempt: row.attemptCount + 1 },
  });
  revalidatePath(`/market-iq/distribution/${row.campaign.id}`);
  revalidatePath(`/market-iq/delivery/${row.campaign.id}`);
  revalidatePath("/market-iq/distribution");
  revalidatePath("/market-iq/sharing");
  if (nextCampaignStatus !== "ready") {
    redirect(withLaunchFlow(`/market-iq/delivery/${row.campaign.id}?result=${result.status}`, preserveLaunchFlow));
  }
  redirect(withLaunchFlow(`/market-iq/distribution/${row.campaign.id}?delivery=${result.status}`, preserveLaunchFlow));
}
