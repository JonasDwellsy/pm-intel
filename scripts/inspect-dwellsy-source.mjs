import pg from "pg";

const connectionString = process.env.DWELLSY_DATABASE_URL;
if (!connectionString) throw new Error("DWELLSY_DATABASE_URL is required");

const client = new pg.Client({
  connectionString,
  application_name: "market-iq-source-inspection",
  statement_timeout: 30_000,
  query_timeout: 35_000,
  options: "-c default_transaction_read_only=on",
});

await client.connect();
try {
  await client.query("BEGIN READ ONLY");

  const identity = await client.query(`
    SELECT current_database() AS database,
           current_user AS role,
           current_setting('transaction_read_only') AS read_only
  `);

  const msa = await client.query(`
    SELECT code, name, msa_status
    FROM dwellsy_prod.msa_table
    WHERE name ILIKE '%Cleveland%'
    ORDER BY name
  `);

  const relationKinds = await client.query(`
    SELECT c.relname,
           CASE c.relkind
             WHEN 'r' THEN 'table'
             WHEN 'v' THEN 'view'
             WHEN 'm' THEN 'materialized_view'
             ELSE c.relkind::text
           END AS relation_kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'dwellsy_prod'
      AND c.relname IN (
        'active_listing_table',
        'property_listing_table',
        'property_table',
        'full_export_view',
        'trend_view_2026_all_new',
        'listing_amount_log_table'
      )
    ORDER BY c.relname
  `);

  const enumLabels = await client.query(`
    SELECT t.typname AS enum_name, e.enumlabel AS label
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'dwellsy_prod'
      AND t.typname IN (
        SELECT DISTINCT udt_name
        FROM information_schema.columns
        WHERE table_schema = 'dwellsy_prod'
          AND table_name IN ('active_listing_table', 'property_listing_table')
          AND data_type = 'USER-DEFINED'
      )
    ORDER BY t.typname, e.enumsortorder
  `);

  const activeCoverage = await client.query(`
    SELECT property_category::text AS property_category,
           COUNT(*)::int AS listings,
           COUNT(*) FILTER (WHERE listing_amount IS NOT NULL)::int AS with_rent,
           COUNT(*) FILTER (WHERE bedrooms IS NOT NULL)::int AS with_bedrooms,
           COUNT(*) FILTER (WHERE square_feet IS NOT NULL)::int AS with_square_feet,
           MAX(last_update_time) AS latest_source_update,
           MAX(listing_create_time) AS latest_listing_created
    FROM dwellsy_prod.active_listing_table
    WHERE msa_code = '17460'
      AND active_listing_status = 'active'
      AND record_status = 'active'
      AND COALESCE(room_for_rent_flag, false) = false
      AND listing_amount > 0
      AND bedrooms IS NOT NULL
    GROUP BY property_category
    ORDER BY listings DESC
  `);

  const listingIdentity = await client.query(`
    SELECT COUNT(*)::int AS active_rows,
           COUNT(DISTINCT listing_id)::int AS unique_listing_ids,
           COUNT(DISTINCT property_id)::int AS unique_property_ids,
           COUNT(*) FILTER (WHERE listing_id IS NULL)::int AS missing_listing_id,
           COUNT(*) FILTER (WHERE property_id IS NULL)::int AS missing_property_id
    FROM dwellsy_prod.active_listing_table
    WHERE msa_code = '17460'
      AND active_listing_status = 'active'
      AND record_status = 'active'
      AND property_category::text IN ('Apartment', 'House')
      AND COALESCE(room_for_rent_flag, false) = false
      AND listing_amount > 0
      AND bedrooms IS NOT NULL
  `);

  const recentLifecycle = await client.query(`
    SELECT COUNT(*) FILTER (WHERE pl.creation_time >= now() - interval '30 days')::int AS created_30d,
           COUNT(*) FILTER (WHERE pl.deactivation_time >= now() - interval '30 days')::int AS deactivated_30d,
           MAX(pl.last_update_time) AS latest_listing_update
    FROM dwellsy_prod.property_listing_table pl
    JOIN dwellsy_prod.property_table p ON p.id = pl.property_id
    WHERE p.msa_code = '17460'
      AND p.property_category::text IN ('Apartment', 'House')
  `);

  console.log(JSON.stringify({
    identity: identity.rows,
    msa: msa.rows,
    relationKinds: relationKinds.rows,
    enumLabels: enumLabels.rows,
    activeCoverage: activeCoverage.rows,
    listingIdentity: listingIdentity.rows,
    recentLifecycle: recentLifecycle.rows,
  }, null, 2));

  await client.query("ROLLBACK");
} finally {
  await client.end();
}
