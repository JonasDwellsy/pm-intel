export interface TodaySignalCandidate {
  id: string;
  assetId: string | null;
  category: string;
  severity: string;
  confidence?: string;
  rankScore: number;
  evidence: string;
  exposures?: Array<{ assetId: string }>;
}

export type EvidenceDestination = "today" | "watchlist" | "setup";

export function classifySignalEvidenceDestination(signal: TodaySignalCandidate): EvidenceDestination {
  if (signal.category === "readiness" || signal.confidence === "setup") return "setup";
  const confidence = signal.confidence ?? "high";
  if (signal.severity === "high" && ["high", "medium"].includes(confidence)) return "today";
  if (signal.severity === "medium" && confidence === "high") return "today";
  return "watchlist";
}

export interface TodaySignalEvidence {
  bedrooms: number | null;
  observations: number | null;
  alertId: string | null;
}

export function parseTodaySignalEvidence(value: string): TodaySignalEvidence {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      bedrooms: typeof parsed.bedrooms === "number" ? parsed.bedrooms : null,
      observations: typeof parsed.observations === "number" ? parsed.observations : null,
      alertId: typeof parsed.alertId === "string" ? parsed.alertId : null,
    };
  } catch {
    return { bedrooms: null, observations: null, alertId: null };
  }
}

/**
 * Build an owner attention queue rather than reproducing a raw signal table.
 * One issue per asset prevents a single property from crowding out the rest of
 * the portfolio. Setup work and developing evidence remain available in their
 * dedicated destinations rather than competing for owner attention.
 */
export function selectTodaySignals<T extends TodaySignalCandidate>(signals: T[], limit = 5): T[] {
  const selected: T[] = [];
  const seenAssets = new Set<string>();

  for (const signal of [...signals].sort((left, right) => right.rankScore - left.rankScore)) {
    if (selected.length >= limit) break;
    if (classifySignalEvidenceDestination(signal) !== "today") continue;
    const exposureAssetIds = signal.exposures?.map((exposure) => exposure.assetId) ?? [];
    const assetKeys = exposureAssetIds.length ? exposureAssetIds : [signal.assetId ?? `signal:${signal.id}`];
    if (assetKeys.some((assetKey) => seenAssets.has(assetKey))) continue;
    selected.push(signal);
    for (const assetKey of assetKeys) seenAssets.add(assetKey);
  }

  return selected;
}
