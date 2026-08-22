export const MARKET_IQ_STABLE_PREVIEW_MAX_SNAPSHOT_AGE_DAYS = 62;

export type MarketIqStablePreviewCheck = {
  id: "market_iq_database" | "source_configuration" | "verified_snapshot";
  status: "ready" | "blocked";
  detail: string;
};

export type MarketIqStablePreviewHealth = {
  product: "market-iq";
  status: "ready" | "blocked";
  checkedAt: string;
  marketId: string;
  sourceAvailableThrough: string | null;
  snapshotGeneratedAt: string | null;
  latestRefreshStatus: string | null;
  checks: MarketIqStablePreviewCheck[];
};

const DAY_MILLISECONDS = 86_400_000;

function snapshotAgeDays(sourceAvailableThrough: Date, now: Date) {
  return Math.max(0, (now.getTime() - sourceAvailableThrough.getTime()) / DAY_MILLISECONDS);
}

export function resolveMarketIqStablePreviewHealth(input: {
  marketId: string;
  now: Date;
  databaseConfigured: boolean;
  databaseReachable: boolean;
  sourceConfigured: boolean;
  snapshot: {
    sourceAvailableThrough: Date;
    generatedAt: Date;
    valid: boolean;
  } | null;
  latestRefreshStatus: string | null;
}): MarketIqStablePreviewHealth {
  const snapshotCurrent = Boolean(
    input.snapshot?.valid
      && snapshotAgeDays(input.snapshot.sourceAvailableThrough, input.now)
        <= MARKET_IQ_STABLE_PREVIEW_MAX_SNAPSHOT_AGE_DAYS,
  );
  const checks: MarketIqStablePreviewCheck[] = [
    {
      id: "market_iq_database",
      status: input.databaseConfigured && input.databaseReachable ? "ready" : "blocked",
      detail: input.databaseConfigured && input.databaseReachable
        ? "The isolated Market IQ evidence store is reachable."
        : "The isolated Market IQ evidence store is unavailable.",
    },
    {
      id: "source_configuration",
      status: input.sourceConfigured ? "ready" : "blocked",
      detail: input.sourceConfigured
        ? "The read-only Trends source is configured."
        : "The read-only Trends source is not configured.",
    },
    {
      id: "verified_snapshot",
      status: snapshotCurrent ? "ready" : "blocked",
      detail: snapshotCurrent
        ? "A current, structurally valid Trends snapshot is available."
        : "A current, structurally valid Trends snapshot is not available.",
    },
  ];

  return {
    product: "market-iq",
    status: checks.every((check) => check.status === "ready") ? "ready" : "blocked",
    checkedAt: input.now.toISOString(),
    marketId: input.marketId,
    sourceAvailableThrough: input.snapshot?.sourceAvailableThrough.toISOString() ?? null,
    snapshotGeneratedAt: input.snapshot?.generatedAt.toISOString() ?? null,
    latestRefreshStatus: input.latestRefreshStatus,
    checks,
  };
}
