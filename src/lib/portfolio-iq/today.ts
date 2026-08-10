export interface TodaySignalCandidate {
  id: string;
  assetId: string | null;
  category: string;
  severity: string;
  rankScore: number;
  evidence: string;
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
 * the portfolio, while readiness is capped so evidence-backed decisions lead.
 */
export function selectTodaySignals<T extends TodaySignalCandidate>(signals: T[], limit = 5): T[] {
  const selected: T[] = [];
  const seenAssets = new Set<string>();
  let readinessCount = 0;

  for (const signal of [...signals].sort((left, right) => right.rankScore - left.rankScore)) {
    if (selected.length >= limit) break;
    const assetKey = signal.assetId ?? `signal:${signal.id}`;
    if (seenAssets.has(assetKey)) continue;
    if (signal.category === "readiness" && readinessCount >= 1) continue;
    selected.push(signal);
    seenAssets.add(assetKey);
    if (signal.category === "readiness") readinessCount += 1;
  }

  return selected;
}
