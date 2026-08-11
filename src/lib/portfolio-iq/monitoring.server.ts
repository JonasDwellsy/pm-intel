import "server-only";
import { prisma } from "@/lib/prisma";
import { loadLaunchBriefing } from "@/lib/portfolio-iq/launch-briefing.server";
import { parseLaunchBriefingSnapshot, type LaunchBriefingSnapshot } from "@/lib/portfolio-iq/launch-briefing";
import { comparePortfolioSnapshots, portfolioWeekKey } from "@/lib/portfolio-iq/monitoring";

export async function loadPortfolioMonitoring(input: { organizationId: string; userId: string }) {
  const briefing = await loadLaunchBriefing(input);
  if (!briefing) return null;
  const baseline = briefing.isApproved ? briefing.snapshot : null;
  const [historyRows, latestRun] = await Promise.all([
    prisma.portfolioIqMonitoringSnapshot.findMany({
      where: { portfolioId: briefing.snapshot.portfolio.id, periodKey: { not: "launch-baseline" } },
      orderBy: { capturedAt: "desc" },
      take: 12,
    }),
    prisma.portfolioIqMonitoringRun.findFirst({
      where: { portfolioId: briefing.snapshot.portfolio.id },
      orderBy: { startedAt: "desc" },
    }),
  ]);
  const history = baseline ? historyRows.flatMap((row) => {
    const snapshot = parseLaunchBriefingSnapshot(row.snapshot);
    return snapshot ? [{ id: row.id, periodKey: row.periodKey, capturedAt: row.capturedAt, sourceAvailableThrough: row.sourceAvailableThrough, comparison: comparePortfolioSnapshots(baseline, snapshot) }] : [];
  }) : [];
  return {
    portfolio: briefing.liveSnapshot.portfolio,
    isApproved: briefing.isApproved,
    baseline,
    current: briefing.liveSnapshot,
    comparison: baseline ? comparePortfolioSnapshots(baseline, briefing.liveSnapshot) : null,
    history,
    currentPeriodKey: portfolioWeekKey(new Date()),
    currentPeriodCaptured: historyRows.some((row) => row.periodKey === portfolioWeekKey(new Date())),
    latestRun,
  };
}

export async function savePortfolioMonitoringSnapshot(input: {
  portfolioId: string;
  organizationId: string;
  userId: string;
  capturedBy: string;
  periodKey?: string;
}): Promise<LaunchBriefingSnapshot> {
  const briefing = await loadLaunchBriefing({ organizationId: input.organizationId, userId: input.userId });
  if (!briefing || briefing.liveSnapshot.portfolio.id !== input.portfolioId || !briefing.isApproved) throw new Error("Approve the launch baseline before capturing monitoring periods.");
  const periodKey = input.periodKey ?? portfolioWeekKey(new Date());
  await prisma.portfolioIqMonitoringSnapshot.upsert({
    where: { portfolioId_periodKey: { portfolioId: input.portfolioId, periodKey } },
    create: { portfolioId: input.portfolioId, periodKey, snapshot: JSON.stringify(briefing.liveSnapshot), sourceAvailableThrough: briefing.liveSnapshot.sourceAvailableThrough, capturedBy: input.capturedBy },
    update: { snapshot: JSON.stringify(briefing.liveSnapshot), sourceAvailableThrough: briefing.liveSnapshot.sourceAvailableThrough, capturedAt: new Date(), capturedBy: input.capturedBy },
  });
  return briefing.liveSnapshot;
}
