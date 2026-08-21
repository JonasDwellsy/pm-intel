import "server-only";

import { CLEVELAND_MSA_CODE } from "@/lib/dwellsy-source/active-listings.server";
import { withDwellsyReadOnly } from "@/lib/dwellsy-source/db.server";
import {
  buildDwellsyPropertyUrl,
  formatMarketIqListingAddress,
  type MarketIqPropertyType,
} from "@/lib/market-iq/report/report";
import type {
  MarketIqAgingThresholdDays,
  MarketIqListingEvent,
  MarketIqMarketActivity,
  MarketIqMarketActivityAvailability,
} from "@/lib/market-iq/listing-events";
import { readMarketIqActivityAvailability } from "@/lib/market-iq/listing-events";
import { parseAdvertisedConcession } from "@/lib/market-iq/concessions";

type EventRow = {
  event_id: string;
  event_type: "new_listing" | "price_change" | "delisting" | "aging_threshold" | "concession";
  property_id: string | number;
  address_1: string | null;
  address_2: string | null;
  address_3: string | null;
  city: string | null;
  postal_code: string | null;
  property_type: "Apartment" | "House";
  bedrooms: string | number;
  asking_rent: string | number;
  previous_rent: string | number | null;
  listing_age_days: string | number | null;
  observed_at: Date | string;
  media: unknown;
  concession_text: string | null;
};

type CountRow = {
  new_listings_24h: string | number;
  source_updates_24h: string | number;
  confirmed_price_changes_24h: string | number;
  advertised_concessions_24h: string | number;
  delistings_24h: string | number;
  aging_thresholds_24h: string | number;
  as_of: Date | string;
};

const MAX_SAVED_ACTIVITY_EVENTS = 200;
const MIN_SAVED_EVENTS_PER_TYPE = 6;

const CONCESSION_SQL_PATTERN = [
  String.raw`\m([0-9]+|one|two|three)[ -]?(month|week)s?\M.{0,24}\m(free|credit)\M`,
  String.raw`\mfree\M.{0,16}\m(month|week|rent)\M`,
  String.raw`\$[[:space:]]?[0-9][0-9,]*(\.[0-9]{2})?.{0,12}\m(off|credit)\M`,
  String.raw`\m(rent|lease)\M.{0,20}\mcredit\M`,
  String.raw`\m(waive|waived|waiving|free)\M.{0,16}\m(application|admin|fee)\M`,
  String.raw`\m(application|admin|fee)\M.{0,16}\m(waived|free)\M`,
  String.raw`\mdeposit[- ]free\M`,
  String.raw`\m(waive|waived|waiving)\M.{0,16}\mdeposit\M`,
  String.raw`\mdeposit\M.{0,20}\mspecial\M`,
  String.raw`\m(move[ -]?in|leasing|lease|rent)\M.{0,24}\m(special|discount)\M`,
].join("|");
const CONCESSION_SQL_NEGATED_PATTERN = [
  String.raw`(\m(no|not|without)\M|n['’]t).{0,24}(${CONCESSION_SQL_PATTERN})`,
  String.raw`\m(application|admin|fee)\M.{0,16}(\m(no|not|without)\M|n['’]t).{0,16}\m(waived|free)\M`,
].join("|");

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
    WHERE amount_log.created_at >= NOW() - INTERVAL '24 hours'
      AND prior.listing_amount IS DISTINCT FROM amount_log.listing_amount
  ),
  new_events AS (
    SELECT CONCAT('new:', listing.listing_id::text) AS event_id,
           'new_listing'::text AS event_type,
           listing.property_id,
           listing.address_1,
           listing.address_2,
           listing.address_3,
           listing.address_city AS city,
           listing.address_zip AS postal_code,
           listing.property_category AS property_type,
           listing.bedrooms,
           listing.listing_amount AS asking_rent,
           NULL::numeric AS previous_rent,
           NULL::integer AS listing_age_days,
           listing.listing_create_time AS observed_at,
           listing.media,
           NULL::text AS concession_text
    FROM dwellsy_prod.active_listing_table listing
    WHERE listing.msa_code = $1::bigint
      AND listing.active_listing_status = 'active'
      AND listing.record_status = 'active'
      AND listing.property_category IN ('Apartment', 'House')
      AND COALESCE(listing.room_for_rent_flag, false) = false
      AND listing.listing_amount > 0
      AND listing.bedrooms IS NOT NULL
      AND listing.property_id IS NOT NULL
      AND NULLIF(BTRIM(listing.address_1), '') IS NOT NULL
      AND NULLIF(BTRIM(listing.address_city), '') IS NOT NULL
      AND NULLIF(BTRIM(listing.address_zip), '') IS NOT NULL
      AND listing.listing_create_time >= NOW() - INTERVAL '24 hours'
  ),
  concession_events AS (
    SELECT CONCAT('concession:', listing.listing_id::text) AS event_id,
           'concession'::text AS event_type,
           listing.property_id,
           listing.address_1,
           listing.address_2,
           listing.address_3,
           listing.address_city AS city,
           listing.address_zip AS postal_code,
           listing.property_category AS property_type,
           listing.bedrooms,
           listing.listing_amount AS asking_rent,
           NULL::numeric AS previous_rent,
           NULL::integer AS listing_age_days,
           listing.listing_create_time AS observed_at,
           listing.media,
           CONCAT_WS(' ', canonical.listing_title, canonical.listing_short_text, canonical.listing_long_text) AS concession_text
    FROM dwellsy_prod.active_listing_table listing
    JOIN dwellsy_prod.property_listing_table canonical ON canonical.id = listing.listing_id
    WHERE listing.msa_code = $1::bigint
      AND listing.active_listing_status = 'active'
      AND listing.record_status = 'active'
      AND listing.property_category IN ('Apartment', 'House')
      AND COALESCE(listing.room_for_rent_flag, false) = false
      AND listing.listing_amount > 0
      AND listing.bedrooms IS NOT NULL
      AND listing.property_id IS NOT NULL
      AND NULLIF(BTRIM(listing.address_1), '') IS NOT NULL
      AND NULLIF(BTRIM(listing.address_city), '') IS NOT NULL
      AND NULLIF(BTRIM(listing.address_zip), '') IS NOT NULL
      AND listing.listing_create_time >= NOW() - INTERVAL '24 hours'
      AND CONCAT_WS(' ', canonical.listing_title, canonical.listing_short_text, canonical.listing_long_text) ~* $concession$${CONCESSION_SQL_PATTERN}$concession$
      AND NOT CONCAT_WS(' ', canonical.listing_title, canonical.listing_short_text, canonical.listing_long_text) ~* $negated$${CONCESSION_SQL_NEGATED_PATTERN}$negated$
  ),
  price_events AS (
    SELECT CONCAT('price:', price.id::text) AS event_id,
           'price_change'::text AS event_type,
           listing.property_id,
           listing.address_1,
           listing.address_2,
           listing.address_3,
           listing.address_city AS city,
           listing.address_zip AS postal_code,
           listing.property_category AS property_type,
           listing.bedrooms,
           price.listing_amount AS asking_rent,
           price.previous_amount AS previous_rent,
           NULL::integer AS listing_age_days,
           price.created_at AS observed_at,
           listing.media,
           NULL::text AS concession_text
    FROM recent_price_logs price
    JOIN dwellsy_prod.active_listing_table listing ON listing.listing_id = price.listing_id
    WHERE listing.msa_code = $1::bigint
      AND listing.active_listing_status = 'active'
      AND listing.record_status = 'active'
      AND listing.property_category IN ('Apartment', 'House')
      AND COALESCE(listing.room_for_rent_flag, false) = false
      AND listing.listing_amount > 0
      AND listing.bedrooms IS NOT NULL
      AND listing.property_id IS NOT NULL
      AND NULLIF(BTRIM(listing.address_1), '') IS NOT NULL
      AND NULLIF(BTRIM(listing.address_city), '') IS NOT NULL
      AND NULLIF(BTRIM(listing.address_zip), '') IS NOT NULL
  ),
  aging_events AS (
    SELECT CONCAT('aging:', listing.listing_id::text, ':', threshold.days::text) AS event_id,
           'aging_threshold'::text AS event_type,
           listing.property_id,
           listing.address_1,
           listing.address_2,
           listing.address_3,
           listing.address_city AS city,
           listing.address_zip AS postal_code,
           listing.property_category AS property_type,
           listing.bedrooms,
           listing.listing_amount AS asking_rent,
           NULL::numeric AS previous_rent,
           threshold.days::integer AS listing_age_days,
           listing.listing_create_time + make_interval(days => threshold.days) AS observed_at,
           listing.media,
           NULL::text AS concession_text
    FROM dwellsy_prod.active_listing_table listing
    CROSS JOIN (VALUES (30), (60), (90)) threshold(days)
    WHERE listing.msa_code = $1::bigint
      AND listing.active_listing_status = 'active'
      AND listing.record_status = 'active'
      AND listing.property_category IN ('Apartment', 'House')
      AND COALESCE(listing.room_for_rent_flag, false) = false
      AND listing.listing_amount > 0
      AND listing.bedrooms IS NOT NULL
      AND listing.property_id IS NOT NULL
      AND NULLIF(BTRIM(listing.address_1), '') IS NOT NULL
      AND NULLIF(BTRIM(listing.address_city), '') IS NOT NULL
      AND NULLIF(BTRIM(listing.address_zip), '') IS NOT NULL
      AND listing.listing_create_time + make_interval(days => threshold.days) >= NOW() - INTERVAL '24 hours'
      AND listing.listing_create_time + make_interval(days => threshold.days) <= NOW()
  ),
  delisting_events AS (
    SELECT CONCAT('delisting:', listing.id::text) AS event_id,
           'delisting'::text AS event_type,
           listing.property_id,
           property.address_1,
           property.address_2,
           property.address_3,
           property.address_city AS city,
           property.address_zip AS postal_code,
           property.property_category AS property_type,
           property.bedrooms,
           listing.listing_amount AS asking_rent,
           NULL::numeric AS previous_rent,
           FLOOR(EXTRACT(EPOCH FROM (listing.deactivation_time - listing.creation_time)) / 86400)::integer AS listing_age_days,
           listing.deactivation_time AS observed_at,
           NULL::json AS media,
           NULL::text AS concession_text
    FROM dwellsy_prod.property_listing_table listing
    JOIN dwellsy_prod.property_table property ON property.id = listing.property_id
    WHERE property.msa_code = $1::bigint
      AND property.property_category IN ('Apartment', 'House')
      AND property.bedrooms IS NOT NULL
      AND property.record_status = 'active'
      AND listing.property_listing_status = 'inactive'
      AND listing.listing_status_info IS DISTINCT FROM 'Stale listing'
      AND listing.record_status = 'active'
      AND listing.listing_type::text = 'Housing'
      AND listing.listing_category::text = 'For Rent'
      AND listing.listing_portion::text = 'Whole'
      AND COALESCE(listing.room_for_rent_flag, 0) = 0
      AND listing.listing_amount > 0
      AND listing.creation_time IS NOT NULL
      AND listing.deactivation_time >= NOW() - INTERVAL '24 hours'
      AND listing.deactivation_time >= listing.creation_time
      AND listing.property_id IS NOT NULL
      AND NULLIF(BTRIM(property.address_1), '') IS NOT NULL
      AND NULLIF(BTRIM(property.address_city), '') IS NOT NULL
      AND NULLIF(BTRIM(property.address_zip), '') IS NOT NULL
  )
  SELECT event_id, event_type, property_id, address_1, address_2, address_3,
         city, postal_code, property_type, bedrooms, asking_rent, previous_rent,
         listing_age_days, observed_at, media, concession_text
  FROM (
    SELECT activity.*,
           ROW_NUMBER() OVER (PARTITION BY event_type ORDER BY observed_at DESC) AS event_rank
    FROM (
      SELECT * FROM new_events
      UNION ALL
      SELECT * FROM concession_events
      UNION ALL
      SELECT * FROM price_events
      UNION ALL
      SELECT * FROM aging_events
      UNION ALL
      SELECT * FROM delisting_events
    ) activity
  ) ranked_activity
  ORDER BY CASE WHEN event_rank <= ${MIN_SAVED_EVENTS_PER_TYPE} THEN 0 ELSE 1 END,
           observed_at DESC
  LIMIT ${MAX_SAVED_ACTIVITY_EVENTS + 1}
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
  ),
  concession_counts AS (
    SELECT COUNT(*) AS advertised_concessions_24h,
           MAX(listing.listing_create_time) AS as_of
    FROM dwellsy_prod.active_listing_table listing
    JOIN dwellsy_prod.property_listing_table canonical ON canonical.id = listing.listing_id
    WHERE listing.msa_code = $1::bigint
      AND listing.active_listing_status = 'active'
      AND listing.record_status = 'active'
      AND listing.property_category IN ('Apartment', 'House')
      AND COALESCE(listing.room_for_rent_flag, false) = false
      AND listing.listing_amount > 0
      AND listing.bedrooms IS NOT NULL
      AND listing.property_id IS NOT NULL
      AND NULLIF(BTRIM(listing.address_1), '') IS NOT NULL
      AND NULLIF(BTRIM(listing.address_city), '') IS NOT NULL
      AND NULLIF(BTRIM(listing.address_zip), '') IS NOT NULL
      AND listing.listing_create_time >= NOW() - INTERVAL '24 hours'
      AND CONCAT_WS(' ', canonical.listing_title, canonical.listing_short_text, canonical.listing_long_text) ~* $concession$${CONCESSION_SQL_PATTERN}$concession$
      AND NOT CONCAT_WS(' ', canonical.listing_title, canonical.listing_short_text, canonical.listing_long_text) ~* $negated$${CONCESSION_SQL_NEGATED_PATTERN}$negated$
  ),
  aging_counts AS (
    SELECT COUNT(*) AS aging_thresholds_24h
    FROM dwellsy_prod.active_listing_table listing
    CROSS JOIN (VALUES (30), (60), (90)) threshold(days)
    WHERE listing.msa_code = $1::bigint
      AND listing.active_listing_status = 'active'
      AND listing.record_status = 'active'
      AND listing.property_category IN ('Apartment', 'House')
      AND COALESCE(listing.room_for_rent_flag, false) = false
      AND listing.listing_amount > 0
      AND listing.bedrooms IS NOT NULL
      AND listing.property_id IS NOT NULL
      AND NULLIF(BTRIM(listing.address_1), '') IS NOT NULL
      AND NULLIF(BTRIM(listing.address_city), '') IS NOT NULL
      AND NULLIF(BTRIM(listing.address_zip), '') IS NOT NULL
      AND listing.listing_create_time + make_interval(days => threshold.days) >= NOW() - INTERVAL '24 hours'
      AND listing.listing_create_time + make_interval(days => threshold.days) <= NOW()
  ),
  delisting_counts AS (
    SELECT COUNT(*) AS delistings_24h,
           MAX(listing.deactivation_time) AS as_of
    FROM dwellsy_prod.property_listing_table listing
    JOIN dwellsy_prod.property_table property ON property.id = listing.property_id
    WHERE property.msa_code = $1::bigint
      AND property.property_category IN ('Apartment', 'House')
      AND property.bedrooms IS NOT NULL
      AND property.record_status = 'active'
      AND listing.property_listing_status = 'inactive'
      AND listing.listing_status_info IS DISTINCT FROM 'Stale listing'
      AND listing.record_status = 'active'
      AND listing.listing_type::text = 'Housing'
      AND listing.listing_category::text = 'For Rent'
      AND listing.listing_portion::text = 'Whole'
      AND COALESCE(listing.room_for_rent_flag, 0) = 0
      AND listing.listing_amount > 0
      AND listing.creation_time IS NOT NULL
      AND listing.deactivation_time >= NOW() - INTERVAL '24 hours'
      AND listing.deactivation_time >= listing.creation_time
      AND listing.property_id IS NOT NULL
      AND NULLIF(BTRIM(property.address_1), '') IS NOT NULL
      AND NULLIF(BTRIM(property.address_city), '') IS NOT NULL
      AND NULLIF(BTRIM(property.address_zip), '') IS NOT NULL
  )
  SELECT source_counts.new_listings_24h,
         source_counts.source_updates_24h,
         confirmed_changes.confirmed_price_changes_24h,
         concession_counts.advertised_concessions_24h,
         delisting_counts.delistings_24h,
         aging_counts.aging_thresholds_24h,
         GREATEST(source_counts.as_of, confirmed_changes.as_of, concession_counts.as_of, delisting_counts.as_of) AS as_of
  FROM source_counts CROSS JOIN confirmed_changes CROSS JOIN concession_counts CROSS JOIN delisting_counts CROSS JOIN aging_counts
`;

function primaryImageUrl(value: unknown): string | null {
  try {
    const media = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(media)) return null;
    const images = media.filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && item.media_type === "image",
    );
    const preferred = images.find((item) => item.status === "active" && typeof item.media_url === "string")
      ?? images.find((item) => typeof item.media_url === "string");
    if (!preferred || typeof preferred.media_url !== "string") return null;
    const url = new URL(preferred.media_url);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function event(row: EventRow): MarketIqListingEvent | null {
  if (!row.city || !row.postal_code) return null;
  const askingRent = Number(row.asking_rent);
  const bedrooms = Number(row.bedrooms);
  if (!Number.isFinite(askingRent) || !Number.isFinite(bedrooms)) return null;
  const previousRent = row.previous_rent === null ? null : Number(row.previous_rent);
  const listingAgeDays = row.listing_age_days === null ? null : Number(row.listing_age_days);
  const address = formatMarketIqListingAddress([row.address_1, row.address_2, row.address_3]);
  const listingUrl = buildDwellsyPropertyUrl(row.property_id);
  if (!address || !listingUrl) return null;
  const common = {
    id: row.event_id,
    address,
    city: row.city,
    zip: row.postal_code,
    propertyType: row.property_type.toLowerCase() as MarketIqPropertyType,
    bedrooms,
    askingRent,
    observedAt: new Date(row.observed_at).toISOString(),
    imageUrl: primaryImageUrl(row.media),
    listingUrl,
  };
  if (row.event_type === "price_change") {
    if (previousRent === null || !Number.isFinite(previousRent)) return null;
    return { ...common, eventType: row.event_type, previousRent };
  }
  if (row.event_type === "concession") {
    const concession = parseAdvertisedConcession(row.concession_text);
    if (!concession) return null;
    return { ...common, eventType: row.event_type, previousRent: null, concession };
  }
  if (row.event_type === "delisting") {
    if (listingAgeDays === null || !Number.isFinite(listingAgeDays) || listingAgeDays < 0) return null;
    return { ...common, eventType: row.event_type, previousRent: null, listingAgeDays };
  }
  if (row.event_type === "aging_threshold") {
    if (listingAgeDays !== 30 && listingAgeDays !== 60 && listingAgeDays !== 90) return null;
    return {
      ...common,
      eventType: row.event_type,
      previousRent: null,
      listingAgeDays: listingAgeDays as MarketIqAgingThresholdDays,
    };
  }
  return { ...common, eventType: row.event_type, previousRent: null };
}

export async function loadMarketListingActivity(msaCode: string): Promise<MarketIqMarketActivity> {
  return withDwellsyReadOnly(async (client) => {
    const [eventsResult, countsResult] = await Promise.all([
      client.query<EventRow>(ACTIVITY_SQL, [msaCode]),
      client.query<CountRow>(COUNTS_SQL, [msaCode]),
    ]);
    const counts = countsResult.rows[0];
    if (!counts?.as_of) throw new Error("Dwellsy listing activity did not include a usable source timestamp.");
    const reportableEvents = eventsResult.rows
      .map(event)
      .filter((value): value is MarketIqListingEvent => value !== null);
    return {
      asOf: new Date(counts.as_of).toISOString(),
      newListings24h: Number(counts.new_listings_24h),
      sourceUpdates24h: Number(counts.source_updates_24h),
      confirmedPriceChanges24h: Number(counts.confirmed_price_changes_24h),
      advertisedConcessions24h: Number(counts.advertised_concessions_24h),
      delistings24h: Number(counts.delistings_24h),
      agingThresholds24h: Number(counts.aging_thresholds_24h),
      eventsTruncated: reportableEvents.length > MAX_SAVED_ACTIVITY_EVENTS,
      events: reportableEvents.slice(0, MAX_SAVED_ACTIVITY_EVENTS),
    };
  });
}

export async function loadMarketListingActivityAvailability(
  msaCode: string,
  attemptedAt = new Date(),
): Promise<MarketIqMarketActivityAvailability> {
  return readMarketIqActivityAvailability(() => loadMarketListingActivity(msaCode), attemptedAt);
}

export async function loadClevelandListingActivity() {
  return loadMarketListingActivity(CLEVELAND_MSA_CODE);
}

export async function loadClevelandListingActivityAvailability(attemptedAt = new Date()) {
  return loadMarketListingActivityAvailability(CLEVELAND_MSA_CODE, attemptedAt);
}
