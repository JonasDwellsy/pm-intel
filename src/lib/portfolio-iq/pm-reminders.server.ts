import "server-only";
import { sendEmail } from "@/lib/email/send";
import { prisma } from "@/lib/prisma";
import { parsePortfolioIqPmBriefSnapshot } from "@/lib/portfolio-iq/pm-brief";
import { buildPmBriefEmail } from "@/lib/portfolio-iq/pm-email";

export async function runPortfolioIqPmReminders(input: { dryRun?: boolean; baseUrl?: string } = {}) {
  const now = new Date();
  const cooldown = new Date(now.getTime() - 3 * 86_400_000);
  const briefs = await prisma.portfolioIqPmBrief.findMany({
    where: {
      status: "published",
      deliveryStatus: "sent",
      remindersEnabled: true,
      recipientEmail: { not: null },
      responseDueAt: { lt: now },
      reminderCount: { lt: 2 },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: cooldown } }],
      response: null,
    },
    include: { asset: { select: { name: true } }, portfolio: { include: { organization: { select: { name: true, excludeFromDigests: true } } } } },
    take: 100,
  });
  let sent = 0, failed = 0, skipped = 0;
  for (const brief of briefs) {
    if (brief.portfolio.organization.excludeFromDigests) { skipped++; continue; }
    const snapshot = parsePortfolioIqPmBriefSnapshot(brief.snapshot);
    if (!snapshot || !brief.recipientEmail) { skipped++; continue; }
    const baseUrl = (input.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://iq.dwellsy.com").replace(/\/$/, "");
    const message = buildPmBriefEmail({ recipientName: brief.recipientName, propertyName: brief.asset.name, ownerName: brief.portfolio.organization.name, snapshot, briefUrl: `${baseUrl}/pm-briefs/${brief.publicToken}`, reminder: true });
    if (input.dryRun) { sent++; continue; }
    const result = await sendEmail({ to: brief.recipientEmail, ...message });
    if (result.ok) {
      sent++;
      await prisma.portfolioIqPmBrief.update({ where: { id: brief.id }, data: { lastReminderAt: now, reminderCount: { increment: 1 } } });
    } else {
      failed++;
      await prisma.portfolioIqPmBrief.update({ where: { id: brief.id }, data: { deliveryError: result.error } });
    }
  }
  return { candidates: briefs.length, sent, failed, skipped, dryRun: Boolean(input.dryRun) };
}
