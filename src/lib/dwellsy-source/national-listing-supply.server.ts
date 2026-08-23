import "server-only";

import { withDwellsyReadOnly } from "@/lib/dwellsy-source/db.server";
import type { NationalListingSupplyAggregate } from "@/lib/market-iq/national-listing-supply";

type NationalSupplyRow = {
  cbsa_code: string;
  market_name: string;
  state_codes: string[] | null;
  time_zone: string | null;
  source_available_through: Date | string | null;
  active_listings: string | number;
  apartment_listings: string | number;
  house_listings: string | number;
  age_observed_listings: string | number;
  median_active_age_days: string | number | null;
  active_over_30_days: string | number;
  active_over_30_share_pct: string | number | null;
  activated_last_7_days: string | number;
  activated_last_30_days: string | number;
  age_0_to_7_days: string | number;
  age_8_to_14_days: string | number;
  age_15_to_30_days: string | number;
  age_31_to_60_days: string | number;
  age_61_plus_days: string | number;
};

export const NATIONAL_LISTING_SUPPLY_SQL = `
  WITH qualified AS (
    SELECT listing.msa_code,
           listing.property_category,
           listing.listing_create_time,
           listing.last_update_time,
           FLOOR(EXTRACT(EPOCH FROM ($1::timestamptz - listing.listing_create_time)) / 86400)::int AS age_days
    FROM dwellsy_prod.active_listing_table listing
    WHERE listing.msa_code IS NOT NULL
      AND listing.active_listing_status = 'active'
      AND listing.record_status = 'active'
      AND listing.property_category IN ('Apartment', 'House')
      AND COALESCE(listing.room_for_rent_flag, false) = false
      AND listing.listing_amount > 0
      AND listing.bedrooms IS NOT NULL
  ), aggregated AS (
    SELECT msa_code,
           MAX(last_update_time) AS source_available_through,
           COUNT(*)::int AS active_listings,
           COUNT(*) FILTER (WHERE property_category = 'Apartment')::int AS apartment_listings,
           COUNT(*) FILTER (WHERE property_category = 'House')::int AS house_listings,
           COUNT(*) FILTER (WHERE age_days >= 0)::int AS age_observed_listings,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_days)
             FILTER (WHERE age_days >= 0))::int AS median_active_age_days,
           COUNT(*) FILTER (WHERE age_days >= 31)::int AS active_over_30_days,
           ROUND(1000.0 * COUNT(*) FILTER (WHERE age_days >= 31)
             / NULLIF(COUNT(*) FILTER (WHERE age_days >= 0), 0)) / 10.0 AS active_over_30_share_pct,
           COUNT(*) FILTER (WHERE age_days BETWEEN 0 AND 7)::int AS activated_last_7_days,
           COUNT(*) FILTER (WHERE age_days BETWEEN 0 AND 30)::int AS activated_last_30_days,
           COUNT(*) FILTER (WHERE age_days BETWEEN 0 AND 7)::int AS age_0_to_7_days,
           COUNT(*) FILTER (WHERE age_days BETWEEN 8 AND 14)::int AS age_8_to_14_days,
           COUNT(*) FILTER (WHERE age_days BETWEEN 15 AND 30)::int AS age_15_to_30_days,
           COUNT(*) FILTER (WHERE age_days BETWEEN 31 AND 60)::int AS age_31_to_60_days,
           COUNT(*) FILTER (WHERE age_days >= 61)::int AS age_61_plus_days
    FROM qualified
    GROUP BY msa_code
  )
  SELECT aggregated.msa_code::text AS cbsa_code,
         msa.name AS market_name,
         states.state_codes,
         zone.time_zone,
         aggregated.source_available_through,
         aggregated.active_listings,
         aggregated.apartment_listings,
         aggregated.house_listings,
         aggregated.age_observed_listings,
         aggregated.median_active_age_days,
         aggregated.active_over_30_days,
         aggregated.active_over_30_share_pct,
         aggregated.activated_last_7_days,
         aggregated.activated_last_30_days,
         aggregated.age_0_to_7_days,
         aggregated.age_8_to_14_days,
         aggregated.age_15_to_30_days,
         aggregated.age_31_to_60_days,
         aggregated.age_61_plus_days
  FROM aggregated
  JOIN dwellsy_prod.msa_table msa ON msa.code = aggregated.msa_code
  LEFT JOIN LATERAL (
    SELECT ARRAY_AGG(DISTINCT membership.state ORDER BY membership.state) AS state_codes
    FROM dwellsy_prod.msa_state_table membership
    WHERE membership.msa_code = aggregated.msa_code
  ) states ON true
  LEFT JOIN LATERAL (
    SELECT city.timezone AS time_zone
    FROM dwellsy_prod.msa_city_table membership
    JOIN dwellsy_prod.city_table city ON city.id = membership.city_id
    WHERE membership.msa_code = aggregated.msa_code
      AND city.timezone IS NOT NULL
    ORDER BY city.population DESC NULLS LAST, city.id
    LIMIT 1
  ) zone ON true
  ORDER BY aggregated.msa_code
`;

function integer(value: string | number) {
  return Number(value);
}

function optionalNumber(value: string | number | null) {
  return value === null ? null : Number(value);
}

export async function loadNationalListingSupply(capturedAt: Date): Promise<NationalListingSupplyAggregate[]> {
  return withDwellsyReadOnly(async (client) => {
    const result = await client.query<NationalSupplyRow>(NATIONAL_LISTING_SUPPLY_SQL, [capturedAt]);
    return result.rows.map((row) => ({
      cbsaCode: row.cbsa_code,
      marketName: row.market_name,
      stateCodes: row.state_codes ?? [],
      timeZone: row.time_zone,
      sourceAvailableThrough: row.source_available_through ? new Date(row.source_available_through) : null,
      activeListings: integer(row.active_listings),
      apartmentListings: integer(row.apartment_listings),
      houseListings: integer(row.house_listings),
      ageObservedListings: integer(row.age_observed_listings),
      medianActiveAgeDays: optionalNumber(row.median_active_age_days),
      activeOver30Days: integer(row.active_over_30_days),
      activeOver30SharePct: optionalNumber(row.active_over_30_share_pct),
      activatedLast7Days: integer(row.activated_last_7_days),
      activatedLast30Days: integer(row.activated_last_30_days),
      age0To7Days: integer(row.age_0_to_7_days),
      age8To14Days: integer(row.age_8_to_14_days),
      age15To30Days: integer(row.age_15_to_30_days),
      age31To60Days: integer(row.age_31_to_60_days),
      age61PlusDays: integer(row.age_61_plus_days),
    }));
  });
}
