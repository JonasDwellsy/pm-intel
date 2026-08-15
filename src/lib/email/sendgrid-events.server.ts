import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSendgridFailure, sanitizeSendgridEvent, sendgridEngagementStrength, sendgridEventId, sendgridEventType, sendgridOccurredAt, type SendgridWebhookEvent } from "@/lib/email/sendgrid-events";

type MessageLink =
  | { kind: "owner_digest" | "pm_brief"; recordId: string; portfolioId: string; organizationId: string; staffOwnerName: string | null }
  | { kind: "market_iq_report"; recordId: string; organizationId: string };

async function resolveMessage(event: SendgridWebhookEvent): Promise<MessageLink | null> {
  const clean = sanitizeSendgridEvent(event);
  if (clean.messageKind === "owner_digest" && clean.messageRecordId) {
    const row = await prisma.portfolioIqDigestDelivery.findUnique({ where: { id: clean.messageRecordId }, include: { preference: { include: { portfolio: { include: { pilotSuccessPlan: true } } } } } });
    if (row && (!clean.portfolioId || row.preference.portfolioId === clean.portfolioId)) return { kind: "owner_digest", recordId: row.id, portfolioId: row.preference.portfolioId, organizationId: row.preference.organizationId, staffOwnerName: row.preference.portfolio.pilotSuccessPlan?.staffOwnerName ?? null };
  }
  if (clean.messageKind === "pm_brief" && clean.messageRecordId) {
    const row = await prisma.portfolioIqPmBrief.findUnique({ where: { id: clean.messageRecordId }, include: { portfolio: { include: { pilotSuccessPlan: true } } } });
    if (row && (!clean.portfolioId || row.portfolioId === clean.portfolioId)) return { kind: "pm_brief", recordId: row.id, portfolioId: row.portfolioId, organizationId: row.portfolio.organizationId, staffOwnerName: row.portfolio.pilotSuccessPlan?.staffOwnerName ?? null };
  }
  if (clean.messageKind === "market_iq_report" && clean.messageRecordId) {
    const row = await prisma.marketIqReportSend.findUnique({ where: { id: clean.messageRecordId } });
    if (row) return { kind: "market_iq_report", recordId: row.id, organizationId: row.organizationId };
  }
  if (!clean.providerMessageId) return null;
  const providerPrefix = clean.providerMessageId.split(".")[0];
  const digest = await prisma.portfolioIqDigestDelivery.findFirst({ where: { providerId: { not: null }, OR: [{ providerId: clean.providerMessageId }, { providerId: { startsWith: providerPrefix } }] }, include: { preference: { include: { portfolio: { include: { pilotSuccessPlan: true } } } } } });
  if (digest) return { kind: "owner_digest", recordId: digest.id, portfolioId: digest.preference.portfolioId, organizationId: digest.preference.organizationId, staffOwnerName: digest.preference.portfolio.pilotSuccessPlan?.staffOwnerName ?? null };
  const brief = await prisma.portfolioIqPmBrief.findFirst({ where: { deliveryProviderId: { not: null }, OR: [{ deliveryProviderId: clean.providerMessageId }, { deliveryProviderId: { startsWith: providerPrefix } }] }, include: { portfolio: { include: { pilotSuccessPlan: true } } } });
  if (brief) return { kind: "pm_brief", recordId: brief.id, portfolioId: brief.portfolioId, organizationId: brief.portfolio.organizationId, staffOwnerName: brief.portfolio.pilotSuccessPlan?.staffOwnerName ?? null };
  const marketReport = await prisma.marketIqReportSend.findFirst({ where: { deliveryProviderId: { not: null }, OR: [{ deliveryProviderId: clean.providerMessageId }, { deliveryProviderId: { startsWith: providerPrefix } }] } });
  return marketReport ? { kind: "market_iq_report", recordId: marketReport.id, organizationId: marketReport.organizationId } : null;
}

export async function processSendgridEvent(event: SendgridWebhookEvent): Promise<"recorded" | "duplicate" | "ignored"> {
  const type = sendgridEventType(event);
  if (!type) return "ignored";
  const link = await resolveMessage(event);
  if (!link) return "ignored";
  const providerEventId = sendgridEventId(event);
  const clean = sanitizeSendgridEvent(event);
  const occurredAt = sendgridOccurredAt(event);
  if (link.kind === "market_iq_report") {
    const failure = isSendgridFailure(type);
    await prisma.$transaction(async (tx) => {
      const delivery = await tx.marketIqReportSend.findUnique({ where: { id: link.recordId }, select: { recipientId: true } });
      const campaignDelivery = await tx.marketIqDistributionCampaignRecipient.findFirst({ where: { sendId: link.recordId }, select: { campaignId: true } });
      await tx.marketIqReportSend.updateMany({
        where: { id: link.recordId, OR: [{ lastEmailEventAt: null }, { lastEmailEventAt: { lte: occurredAt } }] },
        data: {
          lastEmailEventAt: occurredAt,
          lastEmailEventType: type,
          ...(type === "delivered"
            ? { deliveryStatus: "sent", deliveredAt: occurredAt, deliveryError: null }
            : failure
              ? { deliveryStatus: "failed", deliveryError: clean.reason ?? `SendGrid reported ${type}` }
              : {}),
        },
      });
      if (type === "delivered" || failure) {
        await tx.marketIqDistributionCampaignRecipient.updateMany({
          where: { sendId: link.recordId },
          data: type === "delivered"
            ? { status: "sent", lastError: null }
            : { status: "failed", lastError: clean.reason ?? `SendGrid reported ${type}` },
        });
      }
      if (failure && delivery) {
        await tx.marketIqReportRecipient.update({
          where: { id: delivery.recipientId },
          data: {
            emailStatus: "suppressed",
            suppressionReason: clean.reason ?? `SendGrid reported ${type}`,
            suppressedAt: occurredAt,
          },
        });
      }
      if (failure && campaignDelivery) {
        await tx.marketIqDistributionCampaign.update({ where: { id: campaignDelivery.campaignId }, data: { status: "partial", completedAt: null } });
      }
    });
    return "recorded";
  }
  try {
    await prisma.$transaction(async (tx) => {
      const stored = await tx.portfolioIqEmailEvent.create({ data: { providerEventId, portfolioId: link.portfolioId, organizationId: link.organizationId, messageKind: link.kind, messageRecordId: link.recordId, providerMessageId: clean.providerMessageId, eventType: type, occurredAt, reason: clean.reason, responseCode: clean.responseCode, engagementStrength: sendgridEngagementStrength(type) } });
      const failure = isSendgridFailure(type);
      if (link.kind === "owner_digest") {
        await tx.portfolioIqDigestDelivery.updateMany({ where: { id: link.recordId, OR: [{ lastEmailEventAt: null }, { lastEmailEventAt: { lte: occurredAt } }] }, data: { lastEmailEventAt: occurredAt, lastEmailEventType: type, ...(type === "delivered" ? { status: "delivered", deliveredAt: occurredAt, error: null } : failure ? { status: "failed", error: clean.reason ?? `SendGrid reported ${type}` } : {}) } });
      } else {
        await tx.portfolioIqPmBrief.updateMany({ where: { id: link.recordId, OR: [{ lastEmailEventAt: null }, { lastEmailEventAt: { lte: occurredAt } }] }, data: { lastEmailEventAt: occurredAt, lastEmailEventType: type, ...(type === "delivered" ? { deliveryStatus: "sent", deliveredAt: occurredAt, deliveryError: null } : failure ? { deliveryStatus: "failed", deliveryError: clean.reason ?? `SendGrid reported ${type}` } : {}) } });
      }
      if (failure) {
        await tx.portfolioIqPilotIntervention.upsert({ where: { sourceEventId: providerEventId }, create: { portfolioId: link.portfolioId, organizationId: link.organizationId, kind: "follow_up", status: "blocked", title: `Resolve ${type === "spamreport" ? "spam complaint" : type === "unsubscribe" ? "recipient unsubscribe" : type} for ${link.kind === "owner_digest" ? "owner briefing" : "PM brief"}`, note: clean.reason ?? `SendGrid reported ${type}. Confirm the recipient and restore communication before the next briefing.`, assignedTo: link.staffOwnerName, dueAt: new Date(occurredAt.getTime() + 86_400_000), createdByUserId: "sendgrid-webhook", sourceEventId: providerEventId }, update: {} });
        await tx.portfolioIqEmailEvent.update({ where: { id: stored.id }, data: { interventionCreatedAt: new Date() } });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "duplicate";
    throw error;
  }
  return "recorded";
}
