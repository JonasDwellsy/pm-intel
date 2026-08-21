import "server-only";

import { CLEVELAND_MSA_CODE } from "@/lib/dwellsy-source/active-listings.server";
import { withDwellsyReadOnly } from "@/lib/dwellsy-source/db.server";
import {
  readMarketIqTimeToResolutionAvailability,
  type MarketIqResolutionSegment,
  type MarketIqTimeToResolution,
} from "@/lib/market-iq/time-to-resolution";

type SummaryRow = {
  sample_size: string | number;
  p25_days: string | number;
  median_days: string | number;
  p75_days: string | number;
  p90_days: string | number;
  as_of: Date | string;
  window_start: Date | string;
  window_end: Date | string;
};

type BedroomRow = {
  property_category: "Apartment" | "House";
  bedrooms: string | number;
  sample_size: string | number;
  median_days: string | number;
  p25_days: string | number;
  p75_days: string | number;
};

type RentBandRow = {
  rent_band: "under_1000" | "1000_1499" | "1500_1999" | "2000_2499" | "2500_plus";
  sample_size: string | number;
  median_days: string | number;
  p25_days: string | number;
  p75_days: string | number;
};

const RESOLUTION_WINDOW_DAYS = 90;
const MIN_SEGMENT_SAMPLE = 25;

const ELIGIBLE_CTE = `
  WITH eligible AS (
    SELECT property.property_category,
           property.bedrooms,
           listing.listing_amount,
           listing.deactivation_time,
           EXTRACT(EPOCH FROM (listing.deactivation_time - listing.creation_time)) / 86400.0 AS resolution_days
    FROM dwellsy_prod.property_listing_table listing
    JOIN dwellsy_prod.property_table property ON property.id = listing.property_id
    WHERE property.msa_code = $1::bigint
      AND property.property_category IN ('Apartment', 'House')
      AND property.record_status = 'active'
      AND listing.property_listing_status = 'inactive'
      AND listing.record_status = 'active'
      AND listing.listing_type::text = 'Housing'
      AND listing.listing_category::text = 'For Rent'
      AND listing.listing_portion::text = 'Whole'
      AND COALESCE(listing.room_for_rent_flag, 0) = 0
      AND listing.creation_time IS NOT NULL
      AND listing.deactivation_time >= listing.creation_time
      AND listing.deactivation_time >= NOW() - make_interval(days => $2::integer)
      AND listing.deactivation_time <= NOW()
  )
`;

const SUMMARY_SQL = `${ELIGIBLE_CTE}
  SELECT COUNT(*) AS sample_size,
         PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY resolution_days) AS p25_days,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY resolution_days) AS median_days,
         PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY resolution_days) AS p75_days,
         PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY resolution_days) AS p90_days,
         MAX(deactivation_time) AS as_of,
         NOW() - make_interval(days => $2::integer) AS window_start,
         NOW() AS window_end
  FROM eligible
`;

const BEDROOM_SQL = `${ELIGIBLE_CTE}
  SELECT property_category, bedrooms, COUNT(*) AS sample_size,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY resolution_days) AS median_days,
         PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY resolution_days) AS p25_days,
         PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY resolution_days) AS p75_days
  FROM eligible
  WHERE bedrooms BETWEEN 0 AND 5
  GROUP BY property_category, bedrooms
  HAVING COUNT(*) >= ${MIN_SEGMENT_SAMPLE}
  ORDER BY property_category, bedrooms
`;

const RENT_BAND_SQL = `${ELIGIBLE_CTE}, banded AS (
  SELECT CASE
           WHEN listing_amount < 1000 THEN 'under_1000'
           WHEN listing_amount < 1500 THEN '1000_1499'
           WHEN listing_amount < 2000 THEN '1500_1999'
           WHEN listing_amount < 2500 THEN '2000_2499'
           ELSE '2500_plus'
         END AS rent_band,
         resolution_days
  FROM eligible
  WHERE listing_amount > 0
)
  SELECT rent_band, COUNT(*) AS sample_size,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY resolution_days) AS median_days,
         PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY resolution_days) AS p25_days,
         PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY resolution_days) AS p75_days
  FROM banded
  GROUP BY rent_band
  HAVING COUNT(*) >= ${MIN_SEGMENT_SAMPLE}
  ORDER BY MIN(CASE rent_band WHEN 'under_1000' THEN 1 WHEN '1000_1499' THEN 2 WHEN '1500_1999' THEN 3 WHEN '2000_2499' THEN 4 ELSE 5 END)
`;

function number(value: string | number) {
  return Number(value);
}

function days(value: string | number) {
  return Math.round(Number(value) * 10) / 10;
}

function iso(value: Date | string) {
  return new Date(value).toISOString();
}

function segment(row: BedroomRow | RentBandRow, key: string, label: string): MarketIqResolutionSegment {
  return {
    key,
    label,
    sampleSize: number(row.sample_size),
    medianDays: days(row.median_days),
    p25Days: days(row.p25_days),
    p75Days: days(row.p75_days),
  };
}

function bedroomLabel(row: BedroomRow) {
  const bedroom = number(row.bedrooms) === 0 ? "Studio" : `${number(row.bedrooms)}-bedroom`;
  const property = row.property_category === "House" ? "houses" : "apartments";
  return `${bedroom} ${property}`;
}

const RENT_BAND_LABELS: Record<RentBandRow["rent_band"], string> = {
  under_1000: "Under $1,000",
  "1000_1499": "$1,000–$1,499",
  "1500_1999": "$1,500–$1,999",
  "2000_2499": "$2,000–$2,499",
  "2500_plus": "$2,500+",
};

export async function loadMarketTimeToResolution(msaCode: string): Promise<MarketIqTimeToResolution> {
  return withDwellsyReadOnly(async (client) => {
    const values = [msaCode, RESOLUTION_WINDOW_DAYS];
    const summaryResult = await client.query<SummaryRow>(SUMMARY_SQL, values);
    const bedroomResult = await client.query<BedroomRow>(BEDROOM_SQL, values);
    const rentBandResult = await client.query<RentBandRow>(RENT_BAND_SQL, values);
    const summary = summaryResult.rows[0];
    if (!summary || number(summary.sample_size) === 0 || !summary.as_of) {
      throw new Error(`Dwellsy time-to-resolution source returned no rows for MSA ${msaCode}.`);
    }

    return {
      asOf: iso(summary.as_of),
      windowStart: iso(summary.window_start),
      windowEnd: iso(summary.window_end),
      sampleSize: number(summary.sample_size),
      medianDays: days(summary.median_days),
      p25Days: days(summary.p25_days),
      p75Days: days(summary.p75_days),
      p90Days: days(summary.p90_days),
      bedroomSegments: bedroomResult.rows.map((row) => segment(
        row,
        `${row.property_category.toLowerCase()}:${number(row.bedrooms)}`,
        bedroomLabel(row),
      )),
      rentBands: rentBandResult.rows.map((row) => segment(row, row.rent_band, RENT_BAND_LABELS[row.rent_band])),
    };
  });
}

export function loadMarketTimeToResolutionAvailability(msaCode: string, attemptedAt = new Date()) {
  return readMarketIqTimeToResolutionAvailability(
    () => loadMarketTimeToResolution(msaCode),
    attemptedAt,
  );
}

export function loadClevelandTimeToResolutionAvailability(attemptedAt = new Date()) {
  return loadMarketTimeToResolutionAvailability(CLEVELAND_MSA_CODE, attemptedAt);
}
