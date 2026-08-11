import "server-only";
import { prisma } from "@/lib/prisma";
import { loadOwnerToday } from "@/lib/portfolio-iq/today.server";
import { buildOwnerWatchGroups, type OwnerWatchCandidate } from "@/lib/portfolio-iq/owner-watchlist";

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function loadOwnerWatchlist(input: { organizationId: string; userId: string; portfolioId?: string }) {
  const today = await loadOwnerToday(input);
  if (!today) return null;
  const { portfolio, signals } = today;
  const signalAssetIds = (signal: (typeof signals)[number]) => new Set([
    ...(signal.assetId ? [signal.assetId] : []),
    ...signal.exposures.map((exposure) => exposure.assetId),
  ]);
  const propertyCandidates: OwnerWatchCandidate[] = portfolio.assets.map((asset) => {
    const count = signals.filter((signal) => signalAssetIds(signal).has(asset.id)).length;
    return {
      objectType: "property", objectKey: asset.id, label: asset.name,
      href: `/portfolio-iq/properties/${asset.slug}`,
      detail: `${asset.city}, ${asset.state} · ${asset.postalCode} · ${asset.readinessStatus.replaceAll("_", " ")}`,
      signalCount: count, priority: count * 12 + (asset.readinessStatus === "monitoring" ? 8 : 2), source: "Portfolio IQ",
    };
  });

  const geographyMap = new Map<string, OwnerWatchCandidate>();
  for (const asset of portfolio.assets) {
    for (const geography of [
      { kind: "city", value: asset.city, label: `${asset.city}, ${asset.state}` },
      { kind: "zip", value: asset.postalCode, label: `ZIP ${asset.postalCode}` },
    ]) {
      const key = `${geography.kind}:${geography.value}`;
      const exposedAssets = portfolio.assets.filter((candidate) => geography.kind === "city" ? candidate.city === geography.value : candidate.postalCode === geography.value);
      const ids = new Set(exposedAssets.map((candidate) => candidate.id));
      const count = signals.filter((signal) =>
        (signal.geographyType === geography.kind && signal.geographyValue?.includes(geography.value)) ||
        [...signalAssetIds(signal)].some((id) => ids.has(id))
      ).length;
      geographyMap.set(key, {
        objectType: "geography", objectKey: key, label: geography.label, href: "/market-iq",
        detail: `${exposedAssets.length} portfolio ${exposedAssets.length === 1 ? "property" : "properties"} exposed`,
        signalCount: count, priority: count * 10 + exposedAssets.length * 4, source: "Market IQ",
      });
    }
  }

  const operatorMap = new Map<string, OwnerWatchCandidate>();
  for (const asset of portfolio.assets) {
    const name = asset.operatorAssignments[0]?.observedOperatorName ?? asset.observedOperatorName;
    if (!name) continue;
    const key = slug(name);
    const managedAssets = portfolio.assets.filter((candidate) => (candidate.operatorAssignments[0]?.observedOperatorName ?? candidate.observedOperatorName) === name);
    const ids = new Set(managedAssets.map((candidate) => candidate.id));
    const count = signals.filter((signal) => [...signalAssetIds(signal)].some((id) => ids.has(id))).length;
    operatorMap.set(key, {
      objectType: "operator", objectKey: key, label: name, href: "/property-managers",
      detail: `${managedAssets.length} observed portfolio ${managedAssets.length === 1 ? "assignment" : "assignments"}`,
      signalCount: count, priority: count * 9 + managedAssets.length * 5, source: "Operator IQ",
    });
  }

  const decisionCandidates: OwnerWatchCandidate[] = signals.flatMap((signal) => signal.decision?.state === "resolved" ? [] : [{
    objectType: "decision" as const, objectKey: signal.id, label: signal.headline, href: `/today/cases/${signal.id}`,
    detail: `${signal.severity} priority · ${signal.decision?.state ?? "open"}${signal.decision?.assignedTo ? ` · ${signal.decision.assignedTo}` : " · unassigned"}`,
    signalCount: 1, priority: signal.rankScore + (signal.decision?.state === "acknowledged" ? 5 : 0), source: "Decision system" as const,
  }]);
  const candidates = [...propertyCandidates, ...geographyMap.values(), ...operatorMap.values(), ...decisionCandidates];
  const [pins, latestRun, sourceImports] = await Promise.all([
    prisma.portfolioIqOwnerWatchItem.findMany({ where: { portfolioId: portfolio.id }, orderBy: { updatedAt: "desc" } }),
    prisma.portfolioIqMonitoringRun.findFirst({ where: { portfolioId: portfolio.id }, orderBy: { startedAt: "desc" } }),
    prisma.marketIqDataImport.findMany({ where: { marketId: portfolio.marketId, status: "complete" }, orderBy: { importedAt: "desc" }, distinct: ["sourceKind"] }),
  ]);
  return { portfolio, candidates, groups: buildOwnerWatchGroups({ candidates, pins }), pins, latestRun, sourceImports };
}
