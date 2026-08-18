import "server-only";
import { Prisma } from "@prisma/client";
import { sendEmail } from "@/lib/email/send";
import { buildMarketIqInternalBriefingEmail } from "@/lib/market-iq/briefing-email";
import { marketIqReportBaseUrl } from "@/lib/market-iq/report/delivery.server";
import { parseMarketIqBriefingArchivePayload } from "@/lib/market-iq/weekly-briefing";
import { prisma } from "@/lib/prisma";

export type MarketIqBriefingDeliveryResult =
  | { status: "sent"; deliveryId: string }
  | { status: "already_sent" | "in_progress"; deliveryId: string }
  | { status: "failed"; deliveryId: string; error: string }
  | { status: "not_enabled" };

export async function deliverMarketIqBriefingEmail(input: {
  organizationId: string;
  userId: string;
  snapshotId: string;
  recipientName?: string | null;
}): Promise<MarketIqBriefingDeliveryResult> {
  const [preference, snapshot] = await Promise.all([
    prisma.marketIqBriefingEmailPreference.findUnique({
      where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
      include: { organization: { select: { excludeFromDigests: true } } },
    }),
    prisma.marketIqBriefingSnapshot.findFirst({
      where: { id: input.snapshotId, organizationId: input.organizationId },
      select: { id: true, payload: true },
    }),
  ]);
  if (!preference?.enabled || preference.organization.excludeFromDigests) return { status: "not_enabled" };
  if (!snapshot) throw new Error("The frozen Market IQ briefing was not found.");
  const payload = parseMarketIqBriefingArchivePayload(snapshot.payload);
  if (!payload) throw new Error("The frozen Market IQ briefing is invalid.");

  const existing = await prisma.marketIqBriefingEmailDelivery.findUnique({
    where: { snapshotId_userId: { snapshotId: snapshot.id, userId: input.userId } },
  });
  if (existing?.status === "sent") return { status: "already_sent", deliveryId: existing.id };
  if (existing?.status === "sending") return { status: "in_progress", deliveryId: existing.id };

  let delivery;
  if (existing) {
    delivery = await prisma.marketIqBriefingEmailDelivery.update({
      where: { id: existing.id },
      data: { status: "sending", attemptCount: { increment: 1 }, recipientEmail: preference.recipientEmail, error: null },
    });
  } else {
    try {
      delivery = await prisma.marketIqBriefingEmailDelivery.create({
        data: {
          organizationId: input.organizationId,
          snapshotId: snapshot.id,
          preferenceId: preference.id,
          userId: input.userId,
          recipientEmail: preference.recipientEmail,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const concurrent = await prisma.marketIqBriefingEmailDelivery.findUniqueOrThrow({
        where: { snapshotId_userId: { snapshotId: snapshot.id, userId: input.userId } },
      });
      return { status: concurrent.status === "sent" ? "already_sent" : "in_progress", deliveryId: concurrent.id };
    }
  }

  const briefingUrl = `${marketIqReportBaseUrl()}/market-iq/briefing/${snapshot.id}`;
  const message = buildMarketIqInternalBriefingEmail({ payload, briefingUrl, recipientName: input.recipientName });
  const result = await sendEmail({
    to: preference.recipientEmail,
    ...message,
    customArgs: {
      dwellsy_kind: "market_iq_internal_briefing",
      dwellsy_record_id: delivery.id,
      dwellsy_briefing_snapshot_id: snapshot.id,
    },
  });
  await prisma.marketIqBriefingEmailDelivery.update({
    where: { id: delivery.id },
    data: result.ok
      ? { status: "sent", providerId: result.id || null, error: null, sentAt: new Date() }
      : { status: "failed", providerId: null, error: result.error.slice(0, 1_000) },
  });
  return result.ok
    ? { status: "sent", deliveryId: delivery.id }
    : { status: "failed", deliveryId: delivery.id, error: result.error };
}
