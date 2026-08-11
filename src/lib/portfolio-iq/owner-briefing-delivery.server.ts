import "server-only";
import { randomUUID } from "node:crypto";
import { sendEmail } from "@/lib/email/send";
import { prisma } from "@/lib/prisma";
import { loadOwnerBriefing } from "@/lib/portfolio-iq/owner-briefing.server";
import { buildOwnerBriefingEmail, ownerBriefingMaterialFingerprint } from "@/lib/portfolio-iq/owner-briefing";

export async function deliverOwnerBriefingPreview(input: {
  userId: string;
  organizationId: string;
  email: string;
  recipientName: string | null;
  baseUrl: string;
  now?: Date;
}) {
  const briefing = await loadOwnerBriefing({ userId: input.userId, organizationId: input.organizationId, now: input.now });
  if (!briefing) throw new Error("Owner briefing not found.");
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({ where: { id: briefing.snapshot.portfolio.id }, select: { organizationId: true } });
  if (!portfolio) throw new Error("Portfolio not found.");
  const preference = await prisma.portfolioIqDigestPreference.upsert({
    where: { portfolioId_userId: { portfolioId: briefing.snapshot.portfolio.id, userId: input.userId } },
    create: { portfolioId: briefing.snapshot.portfolio.id, organizationId: portfolio.organizationId, userId: input.userId, enabled: false },
    update: {},
  });
  const now = input.now ?? new Date();
  const message = buildOwnerBriefingEmail({
    snapshot: briefing.snapshot,
    recipientName: input.recipientName,
    reportUrl: `${input.baseUrl}/portfolio-iq/reports`,
    preview: true,
    recentActivity: briefing.briefingChanges,
  });
  const delivery = await prisma.portfolioIqDigestDelivery.create({
    data: {
      preferenceId: preference.id,
      deliveryKey: `preview:${preference.id}:${randomUUID()}`,
      signalCutoff: now,
      email: input.email,
      status: "sending",
      triggerKind: "preview",
      briefingVersion: briefing.snapshot.version,
      materialFingerprint: ownerBriefingMaterialFingerprint(briefing.snapshot),
      snapshot: JSON.stringify(briefing.snapshot),
    },
  });
  const result = await sendEmail({ to: input.email, subject: message.subject, html: message.html, text: message.text });
  await prisma.portfolioIqDigestDelivery.update({
    where: { id: delivery.id },
    data: { status: result.ok ? "sent" : "failed", providerId: result.ok ? result.id : null, error: result.ok ? null : result.error, deliveredAt: result.ok ? now : null },
  });
  return { ...result, recipient: input.email, signalCount: message.signalCount, deliveryId: delivery.id };
}
