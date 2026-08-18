import "server-only";

import { CLEVELAND_MSA_CODE } from "@/lib/dwellsy-source/active-listings.server";
import { withDwellsyReadOnly } from "@/lib/dwellsy-source/db.server";
import type { MarketIqListingEvent, MarketIqMarketActivity, MarketIqPropertyType } from "@/lib/market-iq/report/report";

type EventRow = {
  event_id: string;
  event_type: "new_listing" | "price_change";
  city: string | null;
  postal_code: string | null;
  property_type: "Apartment" | "House";
  bedrooms: string | number;
  asking_rent: string | number;
  previous_rent: string | number | null;
  observed_at: Date | string;
};

type CountRow = {
  new_listings_24h: string | number;
  source_updates_24h: string | number;
  confirmed_price_changes_24h: string | number;
  as_of: Date | string;
};

const ACTIVITY_SQL = `
  WITH recent_price_logs AS (
    SELECT amount_log.id,
           amount_log.listing_id,
           amount_log.listing_amount,
           amount_log.created_at,
           prior.listing_amount AS previous_amount
    FROM dwellsy_prod.listing_amount_log_table amount_log
    JOIN LATERAL (
      SELECT earlier.listing_amount
      FROM dwellsy_prod.listing_amount_log_table earlier
      WHERE earlier.listing_id = amount_log.listing_id
        AND earlier.created_at < amount_log.created_at
      ORDER BY earlier.created_at DESC
      LIMIT 1
    ) prior ON true
    WHERE amount_log.created_at >= NOW() - INTERVAL '7 days'
      AND prior.listing_amount IS DISTINCT FROM amount_log.listing_amount
  ),
  new_events AS (
    SELECT CONCAT('new:', listing.listing_id::text) AS event_id,
           'new_listing'::text AS event_type,
           listing.address_city AS city,
           listing.address_zip AS postal_code,
           listing.property_category AS property_type,
           listing.bedrooms,
           listing.listing_amount AS asking_rent,
           NULL::numeric AS previous_rent,
           listing.listing_create_time AS observed_at
    FROM dwellsy_prod.active_listing_table listing
    WHERE listing.msa_code = $1::bigint
      AND listing.active_listing_status = 'active'
      AND listing.record_status = 'active'
      AND listing.property_category IN ('Apartment', 'House')
      AND COALESCE(listing.room_for_rent_flag, false) = false
      AND listing.listing_amount > 0
      AND listing.bedrooms IS NOT NULL
      AND listing.listing_create_time >= NOW() - INTERVAL '7 days'
    ORDER BY listing.listing_create_time DESC
    LIMIT 12
  ),
  price_events AS (
    SELECT CONCAT('price:', price.id::text) AS event_id,
           'price_change'::text AS event_type,
           listing.address_city AS city,
           listing.address_zip AS postal_code,
           listing.property_category AS property_type,
           listing.bedrooms,
           price.listing_amount AS asking_rent,
           price.previous_amount AS previous_rent,
           price.created_at AS observed_at
    FROM recent_price_logs price
    JOIN dwellsy_prod.active_listing_table listing ON listing.listing_id = price.listing_id
    WHERE listing.msa_code = $1::bigint
      AND listing.active_listing_status = 'active'
      AND listing.record_status = 'active'
      AND listing.property_category IN ('Apartment', 'House')
      AND COALESCE(listing.room_for_rent_flag, false) = false
    ORDER BY price.created_at DESC
    LIMIT 12
  )
  SELECT *
  FROM (
    SELECT * FROM new_events
    UNION ALL
    SELECT * FROM price_events
  ) activity
  ORDER BY observed_at DESC
  LIMIT 14
`;

const COUNTS_SQL = `
  WITH source_counts AS (
    SELECT COUNT(*) FILTER (WHERE listing_create_time >= NOW() - INTERVAL '24 hours') AS new_listings_24h,
           COUNT(*) FILTER (WHERE last_update_time >= NOW() - INTERVAL '24 hours') AS source_updates_24h,
           MAX(last_update_time) AS as_of
    FROM dwellsy_prod.active_listing_table
    WHERE msa_code = $1::bigint
      AND active_listing_status = 'active'
      AND record_status = 'active'
      AND property_category IN ('Apartment', 'House')
      AND COALESCE(room_for_rent_flag, false) = false
  ),
  confirmed_changes AS (
    SELECT COUNT(*) AS confirmed_price_changes_24h,
           MAX(amount_log.created_at) AS as_of
    FROM dwellsy_prod.listing_amount_log_table amount_log
    JOIN dwellsy_prod.active_listing_table listing ON listing.listing_id = amount_log.listing_id
    JOIN LATERAL (
      SELECT earlier.listing_amount
      FROM dwellsy_prod.listing_amount_log_table earlier
      WHERE earlier.listing_id = amount_log.listing_id
        AND earlier.created_at < amount_log.created_at
      ORDER BY earlier.created_at DESC
      LIMIT 1
    ) prior ON true
    WHERE listing.msa_code = $1::bigint
      AND listing.active_listing_status = 'active'
      AND listing.record_status = 'active'
      AND listing.property_category IN ('Apartment', 'House')
      AND amount_log.created_at >= NOW() - INTERVAL '24 hours'
      AND prior.listing_amount IS DISTINCT FROM amount_log.listing_amount
  )
  SELECT source_counts.new_listings_24h,
         source_counts.source_updates_24h,
         confirmed_changes.confirmed_price_changes_24h,
         GREATEST(source_counts.as_of, confirmed_changes.as_of) AS as_of
  FROM source_counts CROSS JOIN confirmed_changes
`;

function event(row: EventRow): MarketIqListingEvent | null {
  if (!row.city || !row.postal_code) return null;
  const askingRent = Number(row.asking_rent);
  const bedrooms = Number(row.bedrooms);
  if (!Number.isFinite(askingRent) || !Number.isFinite(bedrooms)) return null;
  return {
    id: row.event_id,
    eventType: row.event_type,
    city: row.city,
    zip: row.postal_code,
    propertyType: row.property_type.toLowerCase() as MarketIqPropertyType,
    bedrooms,
    askingRent,
    previousRent: row.previous_rent === null ? null : Number(row.previous_rent),
    observedAt: new Date(row.observed_at).toISOString(),
  };
}

export async function loadMarketListingActivity(msaCode: string): Promise<MarketIqMarketActivity> {
  return withDwellsyReadOnly(async (client) => {
    const [eventsResult, countsResult] = await Promise.all([
      client.query<EventRow>(ACTIVITY_SQL, [msaCode]),
      client.query<CountRow>(COUNTS_SQL, [msaCode]),
    ]);
    const counts = countsResult.rows[0];
    if (!counts?.as_of) throw new Error("Dwellsy listing activity did not include a usable source timestamp.");
    return {
      asOf: new Date(counts.as_of).toISOString(),
      newListings24h: Number(counts.new_listings_24h),
      sourceUpdates24h: Number(counts.source_updates_24h),
      confirmedPriceChanges24h: Number(counts.confirmed_price_changes_24h),
      events: eventsResult.rows.map(event).filter((value): value is MarketIqListingEvent => value !== null),
    };
  });
}

export async function loadClevelandListingActivity() {
  return loadMarketListingActivity(CLEVELAND_MSA_CODE);
}
