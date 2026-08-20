export type MarketIqRecordedSourceAttempt = {
  status: string;
  startedAt: Date;
  completedAt: Date | null;
};

export type MarketIqRecordedSourceReadiness =
  | { state: "source_not_configured" }
  | { state: "source_unreachable"; lastAttempt: MarketIqRecordedSourceAttempt | null }
  | { state: "no_saved_report"; lastAttempt: MarketIqRecordedSourceAttempt | null }
  | {
      state: "saved_report_available";
      sourceAvailableThrough: Date;
      generatedAt: Date;
      lastAttempt: MarketIqRecordedSourceAttempt | null;
    };

export function resolveMarketIqRecordedSourceReadiness(input: {
  sourceConfigured: boolean;
  evidenceStoreReachable: boolean;
  savedSnapshot: { sourceAvailableThrough: Date; generatedAt: Date } | null;
  lastAttempt: MarketIqRecordedSourceAttempt | null;
}): MarketIqRecordedSourceReadiness {
  if (input.savedSnapshot) {
    return {
      state: "saved_report_available",
      ...input.savedSnapshot,
      lastAttempt: input.lastAttempt,
    };
  }
  if (!input.sourceConfigured) return { state: "source_not_configured" };
  if (!input.evidenceStoreReachable || input.lastAttempt?.status === "blocked") {
    return { state: "source_unreachable", lastAttempt: input.lastAttempt };
  }
  return { state: "no_saved_report", lastAttempt: input.lastAttempt };
}
