export interface TodaySignalCandidate {
  id: string;
  assetId: string | null;
  category: string;
  severity: string;
  confidence?: string;
  rankScore: number;
  evidence: string;
  exposures?: Array<{ assetId: string }>;
  signalType?: string;
  sourceAlertId?: string | null;
  bedrooms?: number | null;
  qualityObservations?: number | null;
  evidenceSources?: string;
  observedAt?: Date;
  decision?: {
    state?: string;
    assignedTo?: string | null;
    dueAt?: Date | null;
  } | null;
}

export type EvidenceDestination = "today" | "watchlist" | "setup";

export type CalibratedFindingConfidence = "high" | "medium" | "developing" | "setup";

export interface FindingQuality {
  score: number;
  calibratedConfidence: CalibratedFindingConfidence;
  destination: EvidenceDestination;
  reason: string;
  observations: number | null;
  evidenceSourceCount: number;
  exposedAssetCount: number;
  annualFinancialExposure: number | null;
  consolidatedCount: number;
  relatedSignalIds: string[];
}

export type QualityRankedSignal<T extends TodaySignalCandidate> = T & { findingQuality: FindingQuality };

export interface OwnerAttentionQueue<T extends TodaySignalCandidate> {
  today: Array<QualityRankedSignal<T>>;
  watchlist: Array<QualityRankedSignal<T>>;
  setup: Array<QualityRankedSignal<T>>;
  evaluatedCount: number;
  consolidatedCount: number;
}

function parseEvidenceSourceCount(value: string | undefined): number {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? new Set(parsed.filter((item): item is string => typeof item === "string")).size : 0;
  } catch {
    return 0;
  }
}

function calibratedConfidence(signal: TodaySignalCandidate, observations: number | null, evidenceSourceCount: number): CalibratedFindingConfidence {
  if (signal.category === "readiness" || signal.confidence === "setup") return "setup";
  if (observations !== null) {
    if (signal.category === "market") {
      if (observations < 5) return "developing";
      if (observations < 15) return "medium";
      return "high";
    }
    if (observations < 3) return "developing";
    if (observations < 8) return "medium";
    return evidenceSourceCount >= 2 ? "high" : "medium";
  }
  if (signal.confidence === undefined) return "high";
  if (signal.confidence === "high") return "high";
  if (signal.confidence === "medium") return "medium";
  return "developing";
}

function signalTheme(signal: TodaySignalCandidate): string {
  const type = signal.signalType ?? signal.category;
  if (/rent(_psf)?_(above|below)_comps/.test(type)) return type.includes("below") ? "pricing_below_comps" : "pricing_above_comps";
  if (type.includes("softening")) return "rent_softening";
  if (type.includes("velocity")) return "listing_velocity";
  return type.replace(/^segment_/, "");
}

function consolidationKey(signal: TodaySignalCandidate): string {
  if (signal.category === "market" && signal.sourceAlertId) return `market:${signal.sourceAlertId}`;
  const assets = signal.exposures?.map((item) => item.assetId).sort().join(",") || signal.assetId || signal.id;
  return `${signal.category}:${assets}:${signal.bedrooms ?? parseTodaySignalEvidence(signal.evidence).bedrooms ?? "all"}:${signalTheme(signal)}`;
}

function financialExposureFor(signal: TodaySignalCandidate, values: Map<string, number>): number | null {
  const assetIds = signal.exposures?.length ? signal.exposures.map((item) => item.assetId) : signal.assetId ? [signal.assetId] : [];
  const found = assetIds.flatMap((assetId) => values.has(assetId) ? [Math.abs(values.get(assetId) ?? 0)] : []);
  return found.length ? found.reduce((sum, value) => sum + value, 0) : null;
}

function scoreFinding(input: {
  signal: TodaySignalCandidate;
  observations: number | null;
  evidenceSourceCount: number;
  exposedAssetCount: number;
  annualFinancialExposure: number | null;
  confidence: CalibratedFindingConfidence;
  now: Date;
}): number {
  const { signal } = input;
  let score = Math.max(0, Math.min(55, signal.rankScore * 0.55));
  score += signal.severity === "high" ? 14 : signal.severity === "medium" ? 8 : 2;
  score += Math.min(9, input.evidenceSourceCount * 3);
  if (input.observations !== null) {
    score += input.observations >= 30 ? 12 : input.observations >= 15 ? 10 : input.observations >= 8 ? 7 : input.observations >= 5 ? 4 : input.observations >= 3 ? 0 : -18;
  }
  score += input.exposedAssetCount >= 3 ? 9 : input.exposedAssetCount === 2 ? 6 : input.exposedAssetCount === 1 ? 2 : 0;
  if (input.annualFinancialExposure !== null) {
    score += input.annualFinancialExposure >= 25_000 ? 15 : input.annualFinancialExposure >= 10_000 ? 12 : input.annualFinancialExposure >= 5_000 ? 9 : input.annualFinancialExposure >= 1_000 ? 5 : 2;
  }
  if (signal.decision?.assignedTo) score += 3;
  if (signal.decision?.dueAt) {
    const daysUntilDue = (signal.decision.dueAt.getTime() - input.now.getTime()) / 86_400_000;
    if (daysUntilDue <= 7) score += 6;
  }
  if (signal.observedAt) {
    const ageDays = Math.max(0, (input.now.getTime() - signal.observedAt.getTime()) / 86_400_000);
    score += ageDays <= 14 ? 4 : ageDays <= 45 ? 2 : 0;
  }
  if (input.confidence === "developing") score -= 15;
  if (input.confidence === "setup") score -= 25;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function qualityReason(input: {
  confidence: CalibratedFindingConfidence;
  observations: number | null;
  exposedAssetCount: number;
  annualFinancialExposure: number | null;
  score: number;
  destination: EvidenceDestination;
}): string {
  if (input.destination === "setup") return "Activation evidence is incomplete, so this remains in setup.";
  if (input.confidence === "developing") return input.observations === null
    ? "The evidence is still developing and remains on the watchlist."
    : `Only ${input.observations} observations support this change, so it remains on the watchlist.`;
  if (input.destination === "watchlist") return "The finding is credible, but it did not clear the current owner-attention threshold.";
  if (input.annualFinancialExposure !== null && input.annualFinancialExposure >= 5_000) return `Prioritized because verified annual asking-rent exposure is approximately $${Math.round(input.annualFinancialExposure).toLocaleString("en-US")}.`;
  if (input.exposedAssetCount > 1) return `Prioritized because the change affects ${input.exposedAssetCount} portfolio assets.`;
  return `Prioritized by evidence quality and decision materiality with a score of ${input.score}/100.`;
}

export function buildOwnerAttentionQueue<T extends TodaySignalCandidate>(
  signals: T[],
  options: { limit?: number; now?: Date; annualFinancialExposureByAssetId?: Map<string, number> } = {}
): OwnerAttentionQueue<T> {
  const now = options.now ?? new Date();
  const financialValues = options.annualFinancialExposureByAssetId ?? new Map<string, number>();
  const evaluated = signals.map((signal) => {
    const parsed = parseTodaySignalEvidence(signal.evidence);
    const observations = signal.qualityObservations ?? parsed.observations;
    const evidenceSourceCount = parseEvidenceSourceCount(signal.evidenceSources);
    const exposedAssetCount = new Set(signal.exposures?.map((item) => item.assetId) ?? (signal.assetId ? [signal.assetId] : [])).size;
    const annualFinancialExposure = financialExposureFor(signal, financialValues);
    const confidence = calibratedConfidence(signal, observations, evidenceSourceCount);
    const score = scoreFinding({ signal, observations, evidenceSourceCount, exposedAssetCount, annualFinancialExposure, confidence, now });
    const hasQualityEvidence = signal.qualityObservations !== undefined || signal.evidenceSources !== undefined;
    let destination = classifySignalEvidenceDestination({ ...signal, confidence });
    if (confidence === "developing") destination = "watchlist";
    if (destination === "today" && hasQualityEvidence && score < 55) destination = "watchlist";
    return { signal, observations, evidenceSourceCount, exposedAssetCount, annualFinancialExposure, confidence, score, destination };
  });

  const consolidated = new Map<string, typeof evaluated[number] & { relatedSignalIds: string[] }>();
  for (const item of evaluated.sort((left, right) => right.score - left.score || right.signal.rankScore - left.signal.rankScore)) {
    const key = consolidationKey(item.signal);
    const existing = consolidated.get(key);
    if (!existing) consolidated.set(key, { ...item, relatedSignalIds: [item.signal.id] });
    else existing.relatedSignalIds.push(item.signal.id);
  }

  const ranked = [...consolidated.values()].map((item): QualityRankedSignal<T> => {
    const reason = qualityReason({ ...item, destination: item.destination });
    return Object.assign({}, item.signal, { findingQuality: {
      score: item.score,
      calibratedConfidence: item.confidence,
      destination: item.destination,
      reason,
      observations: item.observations,
      evidenceSourceCount: item.evidenceSourceCount,
      exposedAssetCount: item.exposedAssetCount,
      annualFinancialExposure: item.annualFinancialExposure,
      consolidatedCount: item.relatedSignalIds.length,
      relatedSignalIds: item.relatedSignalIds,
    } });
  }).sort((left, right) => right.findingQuality.score - left.findingQuality.score || right.rankScore - left.rankScore);

  const limit = options.limit ?? 5;
  const today: Array<QualityRankedSignal<T>> = [];
  const watchlist = ranked.filter((item) => item.findingQuality.destination === "watchlist");
  const setup = ranked.filter((item) => item.findingQuality.destination === "setup");
  const seenAssets = new Set<string>();
  for (const item of ranked.filter((candidate) => candidate.findingQuality.destination === "today")) {
    const assetKeys = item.exposures?.length ? item.exposures.map((exposure) => exposure.assetId) : [item.assetId ?? `signal:${item.id}`];
    if (assetKeys.some((assetKey) => seenAssets.has(assetKey)) || today.length >= limit) {
      item.findingQuality.destination = "watchlist";
      item.findingQuality.reason = today.length >= limit
        ? `Held on the watchlist because Today is limited to ${limit} primary decisions.`
        : "Held on the watchlist because a higher-quality finding already represents this asset.";
      watchlist.push(item);
      continue;
    }
    today.push(item);
    assetKeys.forEach((assetKey) => seenAssets.add(assetKey));
  }
  watchlist.sort((left, right) => right.findingQuality.score - left.findingQuality.score || right.rankScore - left.rankScore);
  return { today, watchlist, setup, evaluatedCount: signals.length, consolidatedCount: ranked.length };
}

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
  return buildOwnerAttentionQueue(signals, { limit }).today;
}
