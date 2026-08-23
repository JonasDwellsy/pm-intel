import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assessMarketIqRecoveryEvidence,
  MARKET_IQ_RECOVERY_REQUIRED_TABLES,
  type MarketIqRecoveryEvidence,
} from "@/lib/market-iq/recovery-readiness";
import { parseMarketIqRecoveryCommand } from "../../scripts/verify-market-iq-recovery";

const MARKETS = ["cleveland", "columbus"];
const MIGRATIONS = ["baseline", "listing-supply"];

function evidence(): MarketIqRecoveryEvidence {
  return {
    formatVersion: 1,
    capturedAt: "2026-08-22T12:00:00.000Z",
    transactionReadOnly: true,
    roleCanCreateInPublicSchema: false,
    roleWriteCapableTables: [],
    appliedMigrations: [...MIGRATIONS],
    tableRowCounts: Object.fromEntries(
      MARKET_IQ_RECOVERY_REQUIRED_TABLES.map((table) => [table, 1]),
    ) as MarketIqRecoveryEvidence["tableRowCounts"],
    reportSnapshots: MARKETS.map((marketId) => ({
      marketId,
      id: `${marketId}-snapshot`,
      checksum: `${marketId}-checksum`,
      sourceAvailableThrough: "2026-07-31T00:00:00.000Z",
      generatedAt: "2026-08-22T09:00:00.000Z",
    })),
    listingSupplySnapshots: [{
      marketId: "cleveland",
      id: "supply",
      snapshotDate: "2026-08-22T00:00:00.000Z",
      feedRunId: "feed",
      activeListings: 1_756,
      apartmentListings: 1_300,
      houseListings: 456,
      sourceAvailableThrough: "2026-08-22T08:00:00.000Z",
      capturedAt: "2026-08-22T08:05:00.000Z",
    }],
    sourceRefreshes: MARKETS.map((marketId) => ({
      marketId,
      id: `${marketId}-refresh`,
      status: "complete",
      recordCount: 100,
      sourceAvailableThrough: "2026-07-31T00:00:00.000Z",
      completedAt: "2026-08-22T09:00:00.000Z",
    })),
    listingFeedRuns: [{
      marketId: "cleveland",
      id: "feed",
      status: "complete",
      recordCount: 1_756,
      sourceAvailableThrough: "2026-08-22T08:00:00.000Z",
      completedAt: "2026-08-22T08:05:00.000Z",
    }],
  };
}

test("a structurally complete recovery is ready", () => {
  const result = assessMarketIqRecoveryEvidence({
    evidence: evidence(),
    expectedMigrations: MIGRATIONS,
    expectedMarketIds: MARKETS,
    listingMarketIds: ["cleveland"],
  });
  assert.equal(result.status, "ready");
  assert.equal(result.checks.every((check) => check.status === "ready"), true);
});

test("recovery fails closed on missing migrations and market evidence", () => {
  const incomplete = evidence();
  incomplete.appliedMigrations = ["baseline"];
  incomplete.reportSnapshots = incomplete.reportSnapshots.slice(0, 1);
  const result = assessMarketIqRecoveryEvidence({
    evidence: incomplete,
    expectedMigrations: MIGRATIONS,
    expectedMarketIds: MARKETS,
    listingMarketIds: ["cleveland"],
  });
  assert.equal(result.status, "blocked");
  assert.equal(
    result.checks.find((check) => check.id === "migrations")?.status,
    "blocked",
  );
  assert.equal(
    result.checks.find((check) => check.id === "report_snapshots")?.status,
    "blocked",
  );
});

test("recovery rejects a role with database write capabilities", () => {
  const writable = evidence();
  writable.roleWriteCapableTables = ["MarketIqReportSourceSnapshot"];
  const result = assessMarketIqRecoveryEvidence({
    evidence: writable,
    expectedMigrations: MIGRATIONS,
    expectedMarketIds: MARKETS,
    listingMarketIds: ["cleveland"],
  });
  assert.equal(result.status, "blocked");
  assert.equal(
    result.checks.find((check) => check.id === "read_only_role")?.status,
    "blocked",
  );
});

test("verification detects row-count and evidence-anchor drift", () => {
  const baseline = evidence();
  const recovered = structuredClone(baseline);
  recovered.capturedAt = "2026-08-22T12:05:00.000Z";
  recovered.tableRowCounts.MarketIqListingEvent += 1;
  recovered.reportSnapshots[0].checksum = "different";
  const result = assessMarketIqRecoveryEvidence({
    evidence: recovered,
    baseline,
    expectedMigrations: MIGRATIONS,
    expectedMarketIds: MARKETS,
    listingMarketIds: ["cleveland"],
  });
  assert.equal(result.status, "blocked");
  assert.equal(
    result.checks.find((check) => check.id === "baseline_tableRowCounts")?.status,
    "blocked",
  );
  assert.equal(
    result.checks.find((check) => check.id === "baseline_reportSnapshots")?.status,
    "blocked",
  );
});

test("capture and verify commands require explicit baseline paths", () => {
  assert.equal(parseMarketIqRecoveryCommand(["capture", "baseline.json"]).kind, "capture");
  assert.equal(parseMarketIqRecoveryCommand(["verify", "baseline.json"]).kind, "verify");
  assert.throws(() => parseMarketIqRecoveryCommand([]), /Usage/);
  assert.throws(() => parseMarketIqRecoveryCommand(["capture"]), /Usage/);
});

test("the database probe is read-only and purpose-scoped", () => {
  const script = readFileSync("scripts/verify-market-iq-recovery.ts", "utf8");
  assert.match(script, /MARKET_IQ_RECOVERY_DATABASE_URL/);
  assert.doesNotMatch(script, /MARKET_IQ_DATABASE_URL(?:_UNPOOLED)?/);
  assert.match(script, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(script, /SHOW transaction_read_only/);
  assert.doesNotMatch(
    script,
    /await client\.query(?:<[^>]+>)?\(\s*[`"']\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i,
  );
});
