export const MARKET_IQ_RECOVERY_REQUIRED_TABLES = [
  "MarketIqDataImport",
  "MarketIqSourceRefresh",
  "MarketIqSourceRefreshItem",
  "MarketIqTrendObservation",
  "MarketIqAlert",
  "MarketIqReportSourceSnapshot",
  "MarketIqMarketSummary",
  "MarketIqListing",
  "MarketIqListingFeedRun",
  "MarketIqListingSupplySnapshot",
  "MarketIqLiveListingSnapshot",
  "MarketIqListingEvent",
] as const;

export type MarketIqRecoveryRequiredTable =
  (typeof MARKET_IQ_RECOVERY_REQUIRED_TABLES)[number];

export type MarketIqRecoverySnapshotAnchor = {
  marketId: string;
  id: string;
  checksum: string;
  sourceAvailableThrough: string;
  generatedAt: string;
};

export type MarketIqRecoverySupplyAnchor = {
  marketId: string;
  id: string;
  snapshotDate: string;
  feedRunId: string;
  activeListings: number;
  apartmentListings: number;
  houseListings: number;
  sourceAvailableThrough: string;
  capturedAt: string;
};

export type MarketIqRecoveryRunAnchor = {
  marketId: string;
  id: string;
  status: string;
  recordCount: number;
  sourceAvailableThrough: string | null;
  completedAt: string;
};

export type MarketIqRecoveryEvidence = {
  formatVersion: 1;
  capturedAt: string;
  transactionReadOnly: boolean;
  roleCanCreateInPublicSchema: boolean;
  roleWriteCapableTables: MarketIqRecoveryRequiredTable[];
  appliedMigrations: string[];
  tableRowCounts: Record<MarketIqRecoveryRequiredTable, number>;
  reportSnapshots: MarketIqRecoverySnapshotAnchor[];
  listingSupplySnapshots: MarketIqRecoverySupplyAnchor[];
  sourceRefreshes: MarketIqRecoveryRunAnchor[];
  listingFeedRuns: MarketIqRecoveryRunAnchor[];
};

export type MarketIqRecoveryCheck = {
  id: string;
  status: "ready" | "blocked";
  detail: string;
};

export type MarketIqRecoveryAssessment = {
  status: "ready" | "blocked";
  checks: MarketIqRecoveryCheck[];
};

function check(id: string, ready: boolean, readyDetail: string, blockedDetail: string) {
  return {
    id,
    status: ready ? "ready" as const : "blocked" as const,
    detail: ready ? readyDetail : blockedDetail,
  };
}

function equalJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function assessMarketIqRecoveryEvidence(input: {
  evidence: MarketIqRecoveryEvidence;
  expectedMigrations: readonly string[];
  expectedMarketIds: readonly string[];
  listingMarketIds: readonly string[];
  baseline?: MarketIqRecoveryEvidence;
}): MarketIqRecoveryAssessment {
  const {
    evidence,
    expectedMigrations,
    expectedMarketIds,
    listingMarketIds,
    baseline,
  } = input;
  const appliedMigrations = new Set(evidence.appliedMigrations);
  const missingMigrations = expectedMigrations.filter(
    (migration) => !appliedMigrations.has(migration),
  );
  const reportMarkets = new Set(evidence.reportSnapshots.map((row) => row.marketId));
  const missingReportMarkets = expectedMarketIds.filter(
    (marketId) => !reportMarkets.has(marketId),
  );
  const listingMarkets = new Set(
    evidence.listingSupplySnapshots.map((row) => row.marketId),
  );
  const missingListingMarkets = listingMarketIds.filter(
    (marketId) => !listingMarkets.has(marketId),
  );
  const sourceRefreshMarkets = new Set(
    evidence.sourceRefreshes
      .filter((row) => row.status === "complete")
      .map((row) => row.marketId),
  );
  const missingRefreshMarkets = expectedMarketIds.filter(
    (marketId) => !sourceRefreshMarkets.has(marketId),
  );
  const listingRunMarkets = new Set(
    evidence.listingFeedRuns
      .filter((row) => ["complete", "baseline_complete"].includes(row.status))
      .map((row) => row.marketId),
  );
  const missingListingRunMarkets = listingMarketIds.filter(
    (marketId) => !listingRunMarkets.has(marketId),
  );

  const checks: MarketIqRecoveryCheck[] = [
    check(
      "read_only_transaction",
      evidence.transactionReadOnly,
      "The evidence was read inside a PostgreSQL read-only transaction.",
      "PostgreSQL did not confirm a read-only transaction.",
    ),
    check(
      "read_only_role",
      !evidence.roleCanCreateInPublicSchema
        && evidence.roleWriteCapableTables.length === 0,
      "The database role cannot create public-schema objects or write Market IQ evidence tables.",
      evidence.roleCanCreateInPublicSchema
        ? "The database role can create objects in the public schema."
        : `The database role can write tables: ${evidence.roleWriteCapableTables.join(", ") || "unknown"}.`,
    ),
    check(
      "migrations",
      missingMigrations.length === 0,
      "Every repository Market IQ migration is applied.",
      `Missing migrations: ${missingMigrations.join(", ") || "unknown"}.`,
    ),
    check(
      "report_snapshots",
      missingReportMarkets.length === 0,
      "Every configured Market IQ market has a saved Trends snapshot.",
      `Markets without a saved Trends snapshot: ${missingReportMarkets.join(", ") || "unknown"}.`,
    ),
    check(
      "source_refreshes",
      missingRefreshMarkets.length === 0,
      "Every configured Market IQ market has a completed Trends refresh.",
      `Markets without a completed Trends refresh: ${missingRefreshMarkets.join(", ") || "unknown"}.`,
    ),
    check(
      "listing_supply",
      missingListingMarkets.length === 0,
      "Every listing-feed market has a saved supply snapshot.",
      `Markets without a saved supply snapshot: ${missingListingMarkets.join(", ") || "unknown"}.`,
    ),
    check(
      "listing_feed_runs",
      missingListingRunMarkets.length === 0,
      "Every listing-feed market has a completed feed run.",
      `Markets without a completed listing-feed run: ${missingListingRunMarkets.join(", ") || "unknown"}.`,
    ),
  ];

  if (baseline) {
    const comparableFields = [
      "roleCanCreateInPublicSchema",
      "roleWriteCapableTables",
      "appliedMigrations",
      "tableRowCounts",
      "reportSnapshots",
      "listingSupplySnapshots",
      "sourceRefreshes",
      "listingFeedRuns",
    ] as const;
    for (const field of comparableFields) {
      checks.push(check(
        `baseline_${field}`,
        equalJson(evidence[field], baseline[field]),
        `Recovered ${field} matches the captured baseline exactly.`,
        `Recovered ${field} does not match the captured baseline.`,
      ));
    }
  }

  return {
    status: checks.every((candidate) => candidate.status === "ready")
      ? "ready"
      : "blocked",
    checks,
  };
}
