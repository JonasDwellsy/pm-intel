import "server-only";
import { syncDwellsyIqInsights } from "@/lib/dwellsy-iq/insights.server";
import { prisma } from "@/lib/prisma";
import { buildLaunchBriefingSnapshot } from "@/lib/portfolio-iq/launch-briefing.server";
import { parseLaunchBriefingSnapshot } from "@/lib/portfolio-iq/launch-briefing";
import {
  classifyMonitoringSourceHealth,
  comparePortfolioSnapshots,
  monitoringChangeSignalDraft,
  portfolioWeekKey,
  selectAlertableMonitoringChanges,
} from "@/lib/portfolio-iq/monitoring";

const MONITORING_PREFIX = "baseline_change_";

interface MonitoringRunOptions {
  dryRun?: boolean;
  triggerKind?: "scheduled" | "manual";
  now?: Date;
}

export async function runPortfolioMonitoringForPortfolio(portfolioId: string, options: MonitoringRunOptions = {}) {
  const now = options.now ?? new Date();
  const periodKey = portfolioWeekKey(now);
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({
    where: { id: portfolioId },
    include: { launchBriefing: true },
  });
  if (!portfolio || portfolio.launchBriefing?.status !== "approved") throw new Error("Portfolio does not have an approved launch baseline.");
  const baseline = parseLaunchBriefingSnapshot(portfolio.launchBriefing.snapshot);
  if (!baseline) throw new Error("The approved launch baseline uses an unsupported snapshot version.");

  const latestSnapshotRow = await prisma.portfolioIqMonitoringSnapshot.findFirst({
    where: { portfolioId, periodKey: { not: "launch-baseline" } },
    orderBy: { capturedAt: "desc" },
  });
  const latestSnapshot = latestSnapshotRow ? parseLaunchBriefingSnapshot(latestSnapshotRow.snapshot) : null;
  const current = await buildLaunchBriefingSnapshot({ organizationId: portfolio.organizationId, userId: "system:portfolio-monitoring" });
  if (!current || current.portfolio.id !== portfolioId) throw new Error("Current portfolio evidence could not be assembled.");
  const sourceHealth = classifyMonitoringSourceHealth(current.sourceAvailableThrough, latestSnapshot?.sourceAvailableThrough ?? baseline.sourceAvailableThrough);
  const baselineComparison = comparePortfolioSnapshots(baseline, current);
  const priorComparison = latestSnapshot ? comparePortfolioSnapshots(latestSnapshot, current) : baselineComparison;
  const alertable = selectAlertableMonitoringChanges(baselineComparison, sourceHealth);
  const drafts = alertable.map((change) => monitoringChangeSignalDraft({ portfolioId, baselineGeneratedAt: baseline.generatedAt, current, change, sourceHealth }));

  if (options.dryRun) {
    return { portfolioId, periodKey, sourceHealth, materialChanges: alertable.length, priorPeriodChanges: priorComparison.materialCount, alertsActivated: 0, alertsResolved: 0, dryRun: true };
  }

  const run = await prisma.portfolioIqMonitoringRun.upsert({
    where: { portfolioId_periodKey: { portfolioId, periodKey } },
    create: { portfolioId, periodKey, triggerKind: options.triggerKind ?? "scheduled", status: "running", sourceHealth, sourceAvailableThrough: current.sourceAvailableThrough, startedAt: now },
    update: { triggerKind: options.triggerKind ?? "scheduled", status: "running", sourceHealth, sourceAvailableThrough: current.sourceAvailableThrough, materialChanges: 0, alertsActivated: 0, alertsResolved: 0, error: null, startedAt: now, completedAt: null },
  });

  try {
    const priorSignals = drafts.length ? await prisma.portfolioIqSignal.findMany({ where: { fingerprint: { in: drafts.map((draft) => draft.fingerprint) } }, select: { fingerprint: true, status: true } }) : [];
    const priorByFingerprint = new Map(priorSignals.map((signal) => [signal.fingerprint, signal.status]));
    const fingerprints = drafts.map((draft) => draft.fingerprint);
    const resolutionTypes = sourceHealth === "healthy"
      ? undefined
      : { in: [`${MONITORING_PREFIX}operator`, `${MONITORING_PREFIX}readiness`] };
    let alertsResolved = 0;
    await prisma.$transaction(async (tx) => {
      for (const draft of drafts) {
        await tx.portfolioIqSignal.upsert({
          where: { fingerprint: draft.fingerprint },
          create: { ...draft, status: "active", firstSeenAt: now, lastSeenAt: now },
          update: { ...draft, status: "active", ...(priorByFingerprint.get(draft.fingerprint) === "resolved" ? { firstSeenAt: now } : {}), lastSeenAt: now, resolvedAt: null },
        });
      }
      const resolved = await tx.portfolioIqSignal.updateMany({
        where: {
          portfolioId,
          status: "active",
          fingerprint: { startsWith: `${portfolioId}:monitoring:`, ...(fingerprints.length ? { notIn: fingerprints } : {}) },
          ...(resolutionTypes ? { signalType: resolutionTypes } : {}),
        },
        data: { status: "resolved", resolvedAt: now },
      });
      alertsResolved = resolved.count;
      await tx.portfolioIqMonitoringSnapshot.upsert({
        where: { portfolioId_periodKey: { portfolioId, periodKey } },
        create: { portfolioId, periodKey, snapshot: JSON.stringify(current), sourceAvailableThrough: current.sourceAvailableThrough, capturedAt: now, capturedBy: "system:portfolio-monitoring" },
        update: { snapshot: JSON.stringify(current), sourceAvailableThrough: current.sourceAvailableThrough, capturedAt: now, capturedBy: "system:portfolio-monitoring" },
      });
    });
    await syncDwellsyIqInsights(portfolioId);
    const alertsActivated = drafts.filter((draft) => priorByFingerprint.get(draft.fingerprint) !== "active").length;
    await prisma.portfolioIqMonitoringRun.update({
      where: { id: run.id },
      data: { status: "completed", materialChanges: alertable.length, alertsActivated, alertsResolved, completedAt: new Date() },
    });
    return { portfolioId, periodKey, sourceHealth, materialChanges: alertable.length, priorPeriodChanges: priorComparison.materialCount, alertsActivated, alertsResolved, dryRun: false };
  } catch (error) {
    await prisma.portfolioIqMonitoringRun.update({
      where: { id: run.id },
      data: { status: "completed_with_errors", error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000), completedAt: new Date() },
    });
    throw error;
  }
}

export async function runPortfolioMonitoring(options: MonitoringRunOptions = {}) {
  const portfolios = await prisma.portfolioIqPortfolio.findMany({
    where: { status: "ready", launchBriefing: { is: { status: "approved" } } },
    select: { id: true },
  });
  const results = [];
  const errors: Array<{ portfolioId: string; error: string }> = [];
  for (const portfolio of portfolios) {
    try {
      results.push(await runPortfolioMonitoringForPortfolio(portfolio.id, options));
    } catch (error) {
      errors.push({ portfolioId: portfolio.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    portfolios: portfolios.length,
    completed: results.length,
    failed: errors.length,
    sourceHealthy: results.filter((result) => result.sourceHealth === "healthy").length,
    sourceUnchanged: results.filter((result) => result.sourceHealth === "unchanged").length,
    sourceUnavailable: results.filter((result) => result.sourceHealth === "unavailable").length,
    alertsActivated: results.reduce((sum, result) => sum + result.alertsActivated, 0),
    alertsResolved: results.reduce((sum, result) => sum + result.alertsResolved, 0),
    dryRun: Boolean(options.dryRun),
    results,
    errors,
  };
}
