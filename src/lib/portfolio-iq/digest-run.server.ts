import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { loadOwnerBriefing } from "@/lib/portfolio-iq/owner-briefing.server";
import {
  buildOwnerBriefingEmail,
  ownerBriefingHasMaterialContent,
  ownerBriefingMaterialFingerprint,
  type OwnerBriefingSnapshot,
} from "@/lib/portfolio-iq/owner-briefing";

function parseStoredSnapshot(value: string | null): OwnerBriefingSnapshot | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as OwnerBriefingSnapshot;
  } catch {
    return null;
  }
}

export async function runPortfolioIqDigests(input: { dryRun?: boolean; baseUrl?: string; now?: Date } = {}) {
  const now = input.now ?? new Date();
  const baseUrl = input.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://iq.dwellsy.com";
  const preferences = await prisma.portfolioIqDigestPreference.findMany({
    where: { enabled: true, cadence: "weekly" },
    include: { portfolio: { include: { organization: { select: { excludeFromDigests: true } } } } },
  });
  const client = await clerkClient();
  let sent = 0, failed = 0, skipped = 0;

  for (const preference of preferences) {
    if (preference.portfolio.organization.excludeFromDigests) { skipped++; continue; }
    if (preference.lastDeliveredAt && now.getTime() - preference.lastDeliveredAt.getTime() < 6 * 86_400_000) { skipped++; continue; }

    const briefing = await loadOwnerBriefing({
      organizationId: preference.organizationId,
      userId: preference.userId,
      portfolioId: preference.portfolioId,
      now,
    });
    if (!briefing) { failed++; continue; }

    const materialFingerprint = ownerBriefingMaterialFingerprint(briefing.snapshot);
    const deliveryKey = `${preference.id}:${materialFingerprint}`;
    const [lastSuccessful, existingDelivery] = await Promise.all([
      prisma.portfolioIqDigestDelivery.findFirst({
        where: { preferenceId: preference.id, triggerKind: "scheduled", status: { in: ["sent", "delivered"] } },
        orderBy: { deliveredAt: "desc" },
      }),
      prisma.portfolioIqDigestDelivery.findUnique({ where: { deliveryKey } }),
    ]);
    if (lastSuccessful?.materialFingerprint === materialFingerprint || ["sent", "delivered"].includes(existingDelivery?.status ?? "")) { skipped++; continue; }
    if (!lastSuccessful && !ownerBriefingHasMaterialContent(briefing.snapshot)) { skipped++; continue; }

    const user = await client.users.getUser(preference.userId);
    const email = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
    if (!email) { failed++; continue; }

    const snapshot = parseStoredSnapshot(existingDelivery?.snapshot ?? null) ?? briefing.snapshot;
    const message = buildOwnerBriefingEmail({
      snapshot,
      recipientName: user.firstName,
      reportUrl: `${baseUrl}/portfolio-iq/reports`,
      recentActivity: briefing.briefingChanges,
    });
    if (input.dryRun) { sent++; continue; }

    const delivery = await prisma.portfolioIqDigestDelivery.upsert({
      where: { deliveryKey },
      create: {
        preferenceId: preference.id,
        deliveryKey,
        signalCutoff: now,
        email,
        status: "sending",
        triggerKind: "scheduled",
        briefingVersion: snapshot.version,
        materialFingerprint,
        snapshot: JSON.stringify(snapshot),
      },
      update: { status: "sending", email, error: null },
    });
    const result = await sendEmail({ to: email, subject: message.subject, html: message.html, text: message.text, customArgs: { dwellsy_kind: "owner_digest", dwellsy_record_id: delivery.id, dwellsy_portfolio_id: preference.portfolioId } });
    await prisma.portfolioIqDigestDelivery.update({
      where: { id: delivery.id },
      data: {
        status: result.ok ? "sent" : "failed",
        providerId: result.ok ? result.id : null,
        error: result.ok ? null : result.error,
        acceptedAt: result.ok ? now : null,
        deliveredAt: null,
      },
    });
    if (result.ok) {
      sent++;
      await prisma.portfolioIqDigestPreference.update({
        where: { id: preference.id },
        data: { lastDeliveredAt: now, lastSignalAt: now },
      });
    } else failed++;
  }
  return { recipients: preferences.length, sent, failed, skipped, dryRun: Boolean(input.dryRun) };
}
