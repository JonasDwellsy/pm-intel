import type { OwnerAttentionQueue, TodaySignalCandidate } from "@/lib/portfolio-iq/today";

type ImpactCandidate = TodaySignalCandidate & { headline: string };
type RankedFinding = OwnerAttentionQueue<ImpactCandidate>["today"][number];
type Placement = "today" | "watchlist" | "setup";

export type CalibrationImpactChange = {
  signalId: string;
  headline: string;
  assetId: string | null;
  beforePlacement: Placement | null;
  afterPlacement: Placement | null;
  beforeRank: number | null;
  afterRank: number | null;
  beforeScore: number | null;
  afterScore: number | null;
};

export type CalibrationImpact = {
  changes: CalibrationImpactChange[];
  enteredToday: number;
  leftToday: number;
  reordered: number;
  affectedAssetIds: string[];
  currentTodayIds: string[];
  proposedTodayIds: string[];
};

function flatten(queue: OwnerAttentionQueue<ImpactCandidate>) {
  const map = new Map<string, { item: RankedFinding; placement: Placement; rank: number }>();
  (["today", "watchlist", "setup"] as const).forEach((placement) => {
    queue[placement].forEach((item, index) => map.set(item.id, { item, placement, rank: index + 1 }));
  });
  return map;
}

export function compareCalibrationQueues(
  current: OwnerAttentionQueue<ImpactCandidate>,
  proposed: OwnerAttentionQueue<ImpactCandidate>
): CalibrationImpact {
  const before = flatten(current);
  const after = flatten(proposed);
  const ids = new Set([...before.keys(), ...after.keys()]);
  const changes = [...ids].flatMap((signalId) => {
    const prior = before.get(signalId) ?? null;
    const next = after.get(signalId) ?? null;
    const changed = prior?.placement !== next?.placement || prior?.rank !== next?.rank || prior?.item.findingQuality.score !== next?.item.findingQuality.score;
    if (!changed) return [];
    const item = next?.item ?? prior?.item;
    if (!item) return [];
    return [{
      signalId,
      headline: item.headline,
      assetId: item.assetId,
      beforePlacement: prior?.placement ?? null,
      afterPlacement: next?.placement ?? null,
      beforeRank: prior?.rank ?? null,
      afterRank: next?.rank ?? null,
      beforeScore: prior?.item.findingQuality.score ?? null,
      afterScore: next?.item.findingQuality.score ?? null,
    }];
  });
  return {
    changes,
    enteredToday: changes.filter((item) => item.beforePlacement !== "today" && item.afterPlacement === "today").length,
    leftToday: changes.filter((item) => item.beforePlacement === "today" && item.afterPlacement !== "today").length,
    reordered: changes.filter((item) => item.beforePlacement === item.afterPlacement && item.beforeRank !== item.afterRank).length,
    affectedAssetIds: [...new Set(changes.flatMap((item) => item.assetId ? [item.assetId] : []))],
    currentTodayIds: current.today.map((item) => item.id),
    proposedTodayIds: proposed.today.map((item) => item.id),
  };
}
