import fs from "node:fs/promises";
import pg from "pg";

const msaCode = process.argv[2];
if (!/^\d{5}$/.test(msaCode ?? "")) {
  throw new Error("Usage: node scripts/inspect-market-adapter.mjs <five-digit-cbsa>");
}

const secretPath = `${process.env.HOME}/Documents/Dwellsy/secrets/db_connection.txt`;
const connectionString = process.env.DWELLSY_DATABASE_URL ?? (await fs.readFile(secretPath, "utf8")).trim();
const client = new pg.Client({
  connectionString,
  application_name: "market-iq-adapter-inspection",
  statement_timeout: 60_000,
  query_timeout: 65_000,
  options: "-c default_transaction_read_only=on",
});

await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const identity = await client.query(`
    SELECT code::text AS code, name
    FROM dwellsy_prod.msa_table
    WHERE code = $1
  `, [msaCode]);
  const trends = await client.query(`
    SELECT 'msa' AS geography_type,
           COUNT(*) FILTER (WHERE month >= DATE '2025-04-01')::int AS rows,
           COUNT(DISTINCT address_type) FILTER (WHERE month >= DATE '2025-04-01')::int AS products,
           COUNT(DISTINCT bedrooms) FILTER (WHERE month >= DATE '2025-04-01')::int AS bedroom_counts,
           1 AS geographies,
           MAX(month) AS latest_month
    FROM dwellsy_prod.ai_msa_stats_table
    WHERE msa = $1::bigint
    UNION ALL
    SELECT 'city',
           COUNT(*) FILTER (WHERE stats.month >= DATE '2025-04-01')::int,
           COUNT(DISTINCT stats.address_type) FILTER (WHERE stats.month >= DATE '2025-04-01')::int,
           COUNT(DISTINCT stats.bedrooms) FILTER (WHERE stats.month >= DATE '2025-04-01')::int,
           COUNT(DISTINCT stats.city_id) FILTER (WHERE stats.month >= DATE '2025-04-01')::int,
           MAX(stats.month)
    FROM dwellsy_prod.ai_city_stats_table stats
    JOIN dwellsy_prod.msa_city_table membership ON membership.city_id = stats.city_id
    WHERE membership.msa_code = $1::bigint
    UNION ALL
    SELECT 'zip',
           COUNT(*) FILTER (WHERE stats.month >= DATE '2025-04-01')::int,
           COUNT(DISTINCT stats.address_type) FILTER (WHERE stats.month >= DATE '2025-04-01')::int,
           COUNT(DISTINCT stats.bedrooms) FILTER (WHERE stats.month >= DATE '2025-04-01')::int,
           COUNT(DISTINCT stats.zip) FILTER (WHERE stats.month >= DATE '2025-04-01')::int,
           MAX(stats.month)
    FROM dwellsy_prod.ai_zip_stats_table stats
    JOIN dwellsy_prod.msa_new_zip_table membership ON membership.zip = stats.zip
    WHERE membership.msa_code = $1::bigint
  `, [msaCode]);
  const listings = await client.query(`
    SELECT COUNT(*)::int AS active_listings,
           COUNT(DISTINCT address_city)::int AS cities,
           COUNT(DISTINCT address_zip)::int AS zips,
           MAX(last_update_time) AS latest_update,
           ARRAY_AGG(DISTINCT address_city ORDER BY address_city) FILTER (WHERE address_city IS NOT NULL) AS city_values,
           ARRAY_AGG(DISTINCT address_zip ORDER BY address_zip) FILTER (WHERE address_zip IS NOT NULL) AS zip_values
    FROM dwellsy_prod.active_listing_table
    WHERE msa_code = $1
      AND active_listing_status = 'active'
      AND record_status = 'active'
      AND property_category::text IN ('Apartment', 'House')
      AND COALESCE(room_for_rent_flag, false) = false
      AND listing_amount > 0
      AND bedrooms IS NOT NULL
  `, [msaCode]);
  const membership = await client.query(`
    SELECT ARRAY_AGG(DISTINCT c.name ORDER BY c.name) AS city_values,
           (SELECT ARRAY_AGG(DISTINCT z.zip::text ORDER BY z.zip::text)
              FROM dwellsy_prod.msa_new_zip_table z
             WHERE z.msa_code = $1::bigint) AS zip_values
    FROM dwellsy_prod.msa_city_table membership
    JOIN dwellsy_prod.city_table c ON c.id = membership.city_id
    WHERE membership.msa_code = $1::bigint
  `, [msaCode]);
  console.log(JSON.stringify({ market: identity.rows[0] ?? null, trends: trends.rows, listings: listings.rows[0], membership: membership.rows[0] }, null, 2));
  await client.query("ROLLBACK");
} finally {
  await client.end();
}
