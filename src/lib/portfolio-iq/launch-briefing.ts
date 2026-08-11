export const LAUNCH_BRIEFING_VERSION = 1 as const;

export interface LaunchBriefingSnapshot {
  version: typeof LAUNCH_BRIEFING_VERSION;
  generatedAt: string;
  sourceAvailableThrough: string | null;
  portfolio: { id: string; name: string; marketId: string; assetCount: number; buildingCount: number };
  executiveRead: string;
  readiness: { monitoring: number; matched: number; uruCovered: number; compsLocked: number; openTasks: number };
  market: { heading: string; narrative: string; historicalRead: string | null; sourceLabel: string };
  decisions: Array<{ signalId: string; assetSlug: string | null; assetName: string | null; severity: string; headline: string; narrative: string; ownerQuestion: string | null }>;
  assets: Array<{
    id: string;
    slug: string;
    name: string;
    location: string;
    product: string;
    buildings: number;
    readinessStatus: string;
    matchStatus: string;
    uruStatus: string;
    compStatus: string;
    observationCount: number;
    askingRent: number | null;
    askingRentVsComps: number | null;
    observedOperatorName: string | null;
    operatorStatus: string;
    operatorRank: string | null;
  }>;
  exceptions: Array<{ assetName: string; type: string; detail: string }>;
}

export function parseLaunchBriefingSnapshot(value: string): LaunchBriefingSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<LaunchBriefingSnapshot>;
    return parsed.version === LAUNCH_BRIEFING_VERSION && Array.isArray(parsed.assets) && Array.isArray(parsed.decisions) && Array.isArray(parsed.exceptions)
      ? parsed as LaunchBriefingSnapshot
      : null;
  } catch {
    return null;
  }
}

export function launchReadinessPercent(snapshot: LaunchBriefingSnapshot): number {
  const denominator = Math.max(snapshot.portfolio.assetCount * 4, 1);
  return Math.round(((snapshot.readiness.monitoring + snapshot.readiness.matched + snapshot.readiness.uruCovered + snapshot.readiness.compsLocked) / denominator) * 100);
}
