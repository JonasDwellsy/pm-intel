"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { marketIqClipped, marketIqValidEmail } from "@/lib/market-iq/report/form-values";
import { prisma } from "@/lib/prisma";

async function authorizedContext() {
  if (!marketIqPreviewEnabled()) return null;
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId || !organizationId || !access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) return null;
  return { organizationId, userId };
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
    where: { organizationId: context.organizationId, reportId, status: { in: ["draft", "ready", "sending", "partial"] } },
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
    select: { id: true, reportId: true },
  });
  if (!campaign) throw new Error("This distribution draft cannot be edited.");
  const recipients = selectedIds.length ? await prisma.marketIqReportRecipient.findMany({
    where: { id: { in: selectedIds }, organizationId: context.organizationId },
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
  revalidatePath("/market-iq/distribution");
  if (campaignId) revalidatePath(`/market-iq/distribution/${campaignId}`);
}
