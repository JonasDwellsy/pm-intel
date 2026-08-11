import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { buildPortfolioIqDigest } from "@/lib/portfolio-iq/digest";
import { refreshPortfolioWatchSignals } from "@/lib/portfolio-iq/watch.server";
import { loadDwellsyIqInsights } from "@/lib/dwellsy-iq/insights.server";

export async function runPortfolioIqDigests(input: { dryRun?: boolean; baseUrl?: string } = {}) {
  const now = new Date();
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
    await refreshPortfolioWatchSignals(preference.portfolioId);
    const signals = await loadDwellsyIqInsights(preference.portfolioId);
    const newSignals = signals.filter((signal) => signal.severity !== "info" && (!preference.lastSignalAt || signal.firstSeenAt > preference.lastSignalAt));
    if (!newSignals.length) { skipped++; continue; }
    const user = await client.users.getUser(preference.userId);
    const email = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
    if (!email) { failed++; continue; }
    const digest = buildPortfolioIqDigest({ portfolioName: preference.portfolio.name, recipientName: user.firstName, dashboardUrl: `${baseUrl}/today`, signals: newSignals });
    const signalCutoff = new Date(Math.max(...newSignals.map((signal) => signal.lastSeenAt.getTime())));
    if (input.dryRun) { sent++; continue; }
    const result = await sendEmail({ to: email, subject: digest.subject, html: digest.html, text: digest.text });
    await prisma.portfolioIqDigestDelivery.upsert({
      where: { preferenceId_signalCutoff: { preferenceId: preference.id, signalCutoff } },
      create: { preferenceId: preference.id, signalCutoff, email, status: result.ok ? "sent" : "failed", providerId: result.ok ? result.id : null, error: result.ok ? null : result.error, deliveredAt: result.ok ? now : null },
      update: { status: result.ok ? "sent" : "failed", providerId: result.ok ? result.id : null, error: result.ok ? null : result.error, deliveredAt: result.ok ? now : null },
    });
    if (result.ok) {
      sent++;
      await prisma.portfolioIqDigestPreference.update({ where: { id: preference.id }, data: { lastDeliveredAt: now, lastSignalAt: signalCutoff } });
    } else failed++;
  }
  return { recipients: preferences.length, sent, failed, skipped, dryRun: Boolean(input.dryRun) };
}
