import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Pool, type PoolClient } from "pg";

import {
  assessMarketIqRecoveryEvidence,
  MARKET_IQ_RECOVERY_REQUIRED_TABLES,
  type MarketIqRecoveryEvidence,
  type MarketIqRecoveryRequiredTable,
} from "../src/lib/market-iq/recovery-readiness";

const EXPECTED_MARKET_IDS = [
  "cleveland-elyria-mentor-oh",
  "columbus-oh",
  "san-francisco-oakland-berkeley-ca",
  "san-jose-sunnyvale-santa-clara-ca",
] as const;
const LISTING_MARKET_IDS = ["cleveland-elyria-mentor-oh"] as const;

type Command =
  | { kind: "capture"; outputPath: string }
  | { kind: "verify"; baselinePath: string };

type SqlDate = Date | string;

function iso(value: SqlDate | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function requiredPath(value: string | undefined, usage: string) {
  if (!value) throw new Error(usage);
  return path.resolve(value);
}

export function parseMarketIqRecoveryCommand(arguments_: string[]): Command {
  const [kind, file] = arguments_;
  if (kind === "capture") {
    return {
      kind,
      outputPath: requiredPath(
        file,
        "Usage: market-iq:verify-recovery capture <baseline-output.json>",
      ),
    };
  }
  if (kind === "verify") {
    return {
      kind,
      baselinePath: requiredPath(
        file,
        "Usage: market-iq:verify-recovery verify <baseline.json>",
      ),
    };
  }
  throw new Error(
    "Usage: market-iq:verify-recovery <capture|verify> <baseline.json>",
  );
}

function expectedMigrations() {
  return readdirSync(path.resolve("prisma/market-iq/migrations"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function tableRowCounts(client: PoolClient) {
  const counts = {} as Record<MarketIqRecoveryRequiredTable, number>;
  for (const table of MARKET_IQ_RECOVERY_REQUIRED_TABLES) {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "${table}"`,
    );
    counts[table] = Number(result.rows[0]?.count ?? Number.NaN);
  }
  return counts;
}

async function captureEvidence(client: PoolClient): Promise<MarketIqRecoveryEvidence> {
  const readOnly = await client.query<{ transaction_read_only: string }>(
    "SHOW transaction_read_only",
  );
  const migrations = await client.query<{ migration_name: string }>(`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name
  `);
  const roleCapabilities = await client.query<{
    canCreateInPublicSchema: boolean;
    tableName: MarketIqRecoveryRequiredTable;
    canWrite: boolean;
  }>(`
    SELECT
      has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreateInPublicSchema",
      table_name AS "tableName",
      has_table_privilege(
        current_user,
        format('%I.%I', table_schema, table_name),
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      ) AS "canWrite"
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [MARKET_IQ_RECOVERY_REQUIRED_TABLES]);
  const reportSnapshots = await client.query<{
    marketId: string;
    id: string;
    checksum: string;
    sourceAvailableThrough: SqlDate;
    generatedAt: SqlDate;
  }>(`
    SELECT DISTINCT ON ("marketId")
      "marketId", id, checksum, "sourceAvailableThrough", "generatedAt"
    FROM "MarketIqReportSourceSnapshot"
    ORDER BY "marketId", "sourceAvailableThrough" DESC, "generatedAt" DESC
  `);
  const listingSupply = await client.query<{
    marketId: string;
    id: string;
    snapshotDate: SqlDate;
    feedRunId: string;
    activeListings: number;
    apartmentListings: number;
    houseListings: number;
    sourceAvailableThrough: SqlDate;
    capturedAt: SqlDate;
  }>(`
    SELECT DISTINCT ON ("marketId")
      "marketId", id, "snapshotDate", "feedRunId", "activeListings",
      "apartmentListings", "houseListings", "sourceAvailableThrough", "capturedAt"
    FROM "MarketIqListingSupplySnapshot"
    ORDER BY "marketId", "snapshotDate" DESC, "capturedAt" DESC
  `);
  const sourceRefreshes = await client.query<{
    marketId: string;
    id: string;
    status: string;
    recordCount: number;
    sourceAvailableThrough: SqlDate | null;
    completedAt: SqlDate;
  }>(`
    SELECT DISTINCT ON ("marketId")
      "marketId", id, status, "recordCount", "sourceAvailableThrough", "completedAt"
    FROM "MarketIqSourceRefresh"
    WHERE "completedAt" IS NOT NULL
    ORDER BY "marketId", "completedAt" DESC, "startedAt" DESC
  `);
  const listingFeedRuns = await client.query<{
    marketId: string;
    id: string;
    status: string;
    recordCount: number;
    sourceAvailableThrough: SqlDate | null;
    completedAt: SqlDate;
  }>(`
    SELECT DISTINCT ON ("marketId")
      "marketId", id, status, "recordCount", "sourceAvailableThrough", "completedAt"
    FROM "MarketIqListingFeedRun"
    WHERE "completedAt" IS NOT NULL
    ORDER BY "marketId", "completedAt" DESC, "startedAt" DESC
  `);

  return {
    formatVersion: 1,
    capturedAt: new Date().toISOString(),
    transactionReadOnly: readOnly.rows[0]?.transaction_read_only === "on",
    roleCanCreateInPublicSchema:
      roleCapabilities.rows[0]?.canCreateInPublicSchema ?? true,
    roleWriteCapableTables: roleCapabilities.rows
      .filter((row) => row.canWrite)
      .map((row) => row.tableName),
    appliedMigrations: migrations.rows.map((row) => row.migration_name),
    tableRowCounts: await tableRowCounts(client),
    reportSnapshots: reportSnapshots.rows.map((row) => ({
      marketId: row.marketId,
      id: row.id,
      checksum: row.checksum,
      sourceAvailableThrough: iso(row.sourceAvailableThrough)!,
      generatedAt: iso(row.generatedAt)!,
    })),
    listingSupplySnapshots: listingSupply.rows.map((row) => ({
      marketId: row.marketId,
      id: row.id,
      snapshotDate: iso(row.snapshotDate)!,
      feedRunId: row.feedRunId,
      activeListings: row.activeListings,
      apartmentListings: row.apartmentListings,
      houseListings: row.houseListings,
      sourceAvailableThrough: iso(row.sourceAvailableThrough)!,
      capturedAt: iso(row.capturedAt)!,
    })),
    sourceRefreshes: sourceRefreshes.rows.map((row) => ({
      marketId: row.marketId,
      id: row.id,
      status: row.status,
      recordCount: row.recordCount,
      sourceAvailableThrough: iso(row.sourceAvailableThrough),
      completedAt: iso(row.completedAt)!,
    })),
    listingFeedRuns: listingFeedRuns.rows.map((row) => ({
      marketId: row.marketId,
      id: row.id,
      status: row.status,
      recordCount: row.recordCount,
      sourceAvailableThrough: iso(row.sourceAvailableThrough),
      completedAt: iso(row.completedAt)!,
    })),
  };
}

function parseBaseline(file: string): MarketIqRecoveryEvidence {
  const value = JSON.parse(readFileSync(file, "utf8")) as MarketIqRecoveryEvidence;
  if (value.formatVersion !== 1) {
    throw new Error("The recovery baseline has an unsupported format version.");
  }
  return value;
}

export async function runMarketIqRecoveryVerification(
  command: Command,
  connectionString = process.env.MARKET_IQ_RECOVERY_DATABASE_URL,
) {
  if (!connectionString) {
    throw new Error(
      "MARKET_IQ_RECOVERY_DATABASE_URL is required. Use only a purpose-scoped read-only connection.",
    );
  }
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const evidence = await captureEvidence(client);
    await client.query("COMMIT");
    const baseline = command.kind === "verify"
      ? parseBaseline(command.baselinePath)
      : undefined;
    const assessment = assessMarketIqRecoveryEvidence({
      evidence,
      baseline,
      expectedMigrations: expectedMigrations(),
      expectedMarketIds: EXPECTED_MARKET_IDS,
      listingMarketIds: LISTING_MARKET_IDS,
    });

    for (const check of assessment.checks) {
      console.log(`${check.status === "ready" ? "READY" : "BLOCKED"} ${check.id}: ${check.detail}`);
    }
    if (assessment.status !== "ready") {
      throw new Error("Market IQ recovery verification failed closed.");
    }
    if (command.kind === "capture") {
      writeFileSync(command.outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      console.log(`Recovery baseline written to ${command.outputPath}. Do not commit this file.`);
    } else {
      console.log("Recovered Market IQ evidence matches the captured baseline exactly.");
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMarketIqRecoveryVerification(parseMarketIqRecoveryCommand(process.argv.slice(2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Recovery verification failed.");
      process.exitCode = 1;
    });
}
