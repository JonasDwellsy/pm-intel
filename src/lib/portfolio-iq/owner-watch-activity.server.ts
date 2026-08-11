import "server-only";
import { prisma } from "@/lib/prisma";
import { loadOwnerWatchlist } from "@/lib/portfolio-iq/owner-watchlist.server";
import { buildOwnerWatchActivity, type OwnerWatchActivityEvent, type OwnerWatchObjectRef } from "@/lib/portfolio-iq/owner-watch-activity";

function operatorKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function uniqueRefs(refs: OwnerWatchObjectRef[]): OwnerWatchObjectRef[] {
  return [...new Map(refs.map((ref) => [`${ref.objectType}:${ref.objectKey}`, ref])).values()];
}

function decisionActionLabel(action: string): string {
  const labels: Record<string, string> = {
    acknowledge: "Decision acknowledged", assign: "Responsibility assigned", assign_member: "Team member assigned",
    snooze: "Decision snoozed", resolve: "Decision resolved", reopen: "Decision reopened", update_plan: "Action plan updated",
  };
  return labels[action] ?? "Decision updated";
}

export async function loadOwnerWatchActivity(input: { organizationId: string; userId: string; portfolioId?: string }) {
  const watchlist = await loadOwnerWatchlist(input);
  if (!watchlist) return null;
  const { portfolio, signals, pins, candidates } = watchlist;
  const [decisionEvents, outcomes, monitoringRuns, reviews] = await Promise.all([
    prisma.portfolioIqSignalDecisionEvent.findMany({
      where: { decision: { signal: { portfolioId: portfolio.id } } },
      include: { decision: { include: { signal: { include: { asset: { select: { id: true, name: true, city: true, postalCode: true, observedOperatorName: true } } } } } } },
      orderBy: { createdAt: "desc" }, take: 80,
    }),
    prisma.portfolioIqOutcomeReview.findMany({
      where: { portfolioId: portfolio.id },
      include: { decision: { include: { signal: { include: { asset: { select: { id: true, name: true, city: true, postalCode: true, observedOperatorName: true } } } } } } },
      orderBy: { generatedAt: "desc" }, take: 40,
    }),
    prisma.portfolioIqMonitoringRun.findMany({ where: { portfolioId: portfolio.id, status: { not: "running" } }, orderBy: { completedAt: "desc" }, take: 20 }),
    prisma.portfolioIqOwnerWatchReview.findMany({ where: { portfolioId: portfolio.id, userId: input.userId } }),
  ]);
  const assetById = new Map(portfolio.assets.map((asset) => [asset.id, asset]));
  const candidateByIdentity = new Map(candidates.map((candidate) => [`${candidate.objectType}:${candidate.objectKey}`, candidate]));
  const refsForAssetIds = (assetIds: string[], signalId?: string): OwnerWatchObjectRef[] => {
    const refs: OwnerWatchObjectRef[] = [];
    for (const assetId of assetIds) {
      const asset = assetById.get(assetId);
      if (!asset) continue;
      refs.push({ objectType: "property", objectKey: asset.id, label: asset.name });
      for (const key of [`city:${asset.city}`, `zip:${asset.postalCode}`]) {
        const geography = candidateByIdentity.get(`geography:${key}`);
        if (geography) refs.push({ objectType: "geography", objectKey: key, label: geography.label });
      }
      const operatorName = asset.operatorAssignments[0]?.observedOperatorName ?? asset.observedOperatorName;
      if (operatorName) refs.push({ objectType: "operator", objectKey: operatorKey(operatorName), label: operatorName });
    }
    if (signalId) {
      const decision = candidateByIdentity.get(`decision:${signalId}`);
      refs.push({ objectType: "decision", objectKey: signalId, label: decision?.label ?? "Decision" });
    }
    return uniqueRefs(refs);
  };
  const events: OwnerWatchActivityEvent[] = [];
  for (const signal of signals) {
    const assetIds = [...new Set([...(signal.assetId ? [signal.assetId] : []), ...signal.exposures.map((exposure) => exposure.assetId)])];
    events.push({
      id: `evidence:${signal.id}:${signal.firstSeenAt.toISOString()}`, kind: "evidence", headline: signal.headline,
      detail: signal.narrative, href: `/today/cases/${signal.id}`, severity: signal.severity, occurredAt: signal.firstSeenAt,
      objects: refsForAssetIds(assetIds, signal.id),
      evidenceGate: { category: signal.category, confidence: signal.confidence },
    });
  }
  for (const event of decisionEvents) {
    const signal = event.decision.signal;
    const assetIds = signal.assetId ? [signal.assetId] : [];
    events.push({
      id: `decision:${event.id}`, kind: "decision", headline: decisionActionLabel(event.action),
      detail: `${signal.headline}${event.assignedTo ? ` · ${event.assignedTo}` : ""}${event.note ? ` · ${event.note}` : ""}`,
      href: `/today/cases/${signal.id}`, severity: signal.severity, occurredAt: event.createdAt,
      objects: refsForAssetIds(assetIds, signal.id),
      evidenceGate: { category: signal.category, confidence: signal.confidence },
    });
  }
  for (const outcome of outcomes) {
    const signal = outcome.decision.signal;
    const assetIds = signal.assetId ? [signal.assetId] : [];
    events.push({
      id: `outcome:${outcome.id}:${outcome.updatedAt.toISOString()}`, kind: "outcome",
      headline: outcome.status === "reviewed" ? `Outcome reviewed: ${outcome.conclusion ?? "inconclusive"}` : "Outcome review available",
      detail: `${signal.headline} · Source health: ${outcome.sourceHealth}`,
      href: "/portfolio-iq/outcomes", severity: outcome.conclusion === "worsened" ? "high" : "medium", occurredAt: outcome.reviewedAt ?? outcome.generatedAt,
      objects: refsForAssetIds(assetIds, signal.id),
      evidenceGate: { category: signal.category, confidence: signal.confidence, sourceHealth: outcome.sourceHealth },
    });
  }
  for (const run of monitoringRuns) {
    if (run.materialChanges === 0 && run.sourceHealth !== "unavailable") continue;
    events.push({
      id: `source:${run.id}`, kind: "source",
      headline: run.sourceHealth === "unavailable" ? "A monitoring source was unavailable" : `${run.materialChanges} material ${run.materialChanges === 1 ? "change" : "changes"} detected`,
      detail: run.sourceHealth === "unavailable" ? "No listing records were substituted or fabricated. Existing evidence remains unchanged." : `${run.alertsActivated} alerts activated and ${run.alertsResolved} resolved in this observation period.`,
      href: "/portfolio-iq/changes", severity: run.sourceHealth === "unavailable" ? "info" : "high", occurredAt: run.completedAt ?? run.startedAt,
      objects: [{ objectType: "watchlist", objectKey: "all", label: "Owner Watchlist" }],
      evidenceGate: { category: run.sourceHealth === "unavailable" ? "readiness" : "performance", confidence: run.sourceHealth === "unavailable" ? "setup" : "high", sourceHealth: run.sourceHealth },
    });
  }
  const activity = buildOwnerWatchActivity({ events, pinnedObjects: pins, reviews });
  return { ...watchlist, activity, reviews };
}
