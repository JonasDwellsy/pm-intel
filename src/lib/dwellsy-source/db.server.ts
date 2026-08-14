import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForDwellsySource = globalThis as unknown as {
  dwellsySourcePool: Pool | undefined;
};

function connectionString() {
  const value = process.env.DWELLSY_DATABASE_URL;
  if (!value) {
    throw new Error("The read-only Dwellsy production source is not configured.");
  }
  return value;
}

function sourcePool() {
  if (!globalForDwellsySource.dwellsySourcePool) {
    globalForDwellsySource.dwellsySourcePool = new Pool({
      connectionString: connectionString(),
      application_name: "market-iq-live-listing-feed",
      max: 2,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 45_000,
      query_timeout: 50_000,
      options: "-c default_transaction_read_only=on",
    });
  }
  return globalForDwellsySource.dwellsySourcePool;
}

export function dwellsySourceConfigured() {
  return Boolean(process.env.DWELLSY_DATABASE_URL);
}

export async function withDwellsyReadOnly<T>(
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await sourcePool().connect();
  try {
    await client.query("BEGIN READ ONLY");
    const readOnly = await client.query<QueryResultRow>(
      "SELECT current_setting('transaction_read_only') AS read_only"
    );
    if (readOnly.rows[0]?.read_only !== "on") {
      throw new Error("Dwellsy source transaction is not read-only.");
    }
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
