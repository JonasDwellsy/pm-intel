import fs from "node:fs/promises";
import pg from "pg";

const [slug, msaCode] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(slug ?? "") || !/^\d{5}$/.test(msaCode ?? "")) {
  throw new Error("Usage: node scripts/refresh-market-universe.mjs <slug> <five-digit-cbsa>");
}

const secretPath = `${process.env.HOME}/Documents/Dwellsy/secrets/db_connection.txt`;
const connectionString = process.env.DWELLSY_DATABASE_URL ?? (await fs.readFile(secretPath, "utf8")).trim();
const client = new pg.Client({
  connectionString,
  application_name: "market-iq-universe-refresh",
  statement_timeout: 60_000,
  query_timeout: 65_000,
  options: "-c default_transaction_read_only=on",
});

await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const result = await client.query(`
    SELECT ARRAY_AGG(DISTINCT c.name ORDER BY c.name) AS cities,
           (SELECT ARRAY_AGG(DISTINCT z.zip::text ORDER BY z.zip::text)
              FROM dwellsy_prod.msa_new_zip_table z
             WHERE z.msa_code = $1::bigint) AS zips
    FROM dwellsy_prod.msa_city_table membership
    JOIN dwellsy_prod.city_table c ON c.id = membership.city_id
    WHERE membership.msa_code = $1::bigint
  `, [msaCode]);
  const cities = result.rows[0]?.cities ?? [];
  const zips = result.rows[0]?.zips ?? [];
  if (!cities.length || !zips.length) throw new Error(`No market universe found for CBSA ${msaCode}`);
  await fs.writeFile(new URL(`../src/data/market-iq/${slug}-msa-cities.json`, import.meta.url), `${JSON.stringify(cities, null, 2)}\n`);
  await fs.writeFile(new URL(`../src/data/market-iq/${slug}-msa-zips.json`, import.meta.url), `${JSON.stringify(zips, null, 2)}\n`);
  console.log(`Wrote ${cities.length} cities and ${zips.length} ZIPs for CBSA ${msaCode}.`);
  await client.query("ROLLBACK");
} finally {
  await client.end();
}
