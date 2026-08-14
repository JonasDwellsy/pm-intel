import "server-only";

import { withDwellsyReadOnly } from "@/lib/dwellsy-source/db.server";
import {
  mapDwellsyTrendRows,
  type DwellsyTrendSourceRow,
} from "@/lib/dwellsy-source/trends";

const DWELLSY_TRENDS_SQL = `
  WITH selected_city_stats AS (
    SELECT 'city'::text AS geography_type,
           c.name || ', ' || c.state AS geography_value,
           c.name AS geography_label,
           s.address_type,
           s.bedrooms,
           s.month,
           s.count AS observations,
           s.trends_value AS rent,
           s.rent_change_percentage AS year_over_year_pct
    FROM dwellsy_prod.ai_city_stats_table s
    JOIN dwellsy_prod.city_table c ON c.id = s.city_id
    WHERE c.name = ANY($1::text[])
      AND c.state = 'OH'
      AND s.month >= $3::date
      AND s.address_type = ANY($4::text[])
      AND s.bedrooms = ANY($5::int[])
  ), selected_zip_stats AS (
    SELECT 'zip'::text AS geography_type,
           s.zip AS geography_value,
           'ZIP ' || s.zip AS geography_label,
           s.address_type,
           s.bedrooms,
           s.month,
           s.count AS observations,
           s.trends_value AS rent,
           s.rent_change_percentage AS year_over_year_pct
    FROM dwellsy_prod.ai_zip_stats_table s
    WHERE s.zip = ANY($2::text[])
      AND s.month >= $3::date
      AND s.address_type = ANY($4::text[])
      AND s.bedrooms = ANY($5::int[])
  )
  SELECT * FROM selected_city_stats
  UNION ALL
  SELECT * FROM selected_zip_stats
  ORDER BY geography_type, geography_value, address_type, bedrooms, month
`;

// Canonical overall-product adapter. Dwellsy data science confirmed that the
// median on the 999-bedroom row is the correct all-bedroom rent measure.
const DWELLSY_PRODUCT_ROLLUP_SQL = `
  WITH rollup AS (
    SELECT 'msa'::text AS geography_type,
           s.msa::text AS geography_value,
           'Cleveland-Elyria, OH'::text AS geography_label,
           s.address_type,
           s.bedrooms,
           s.month,
           s.count AS observations,
           s.median AS rent
    FROM dwellsy_prod.ai_msa_stats_table s
    WHERE s.msa = 17460
      AND s.month >= $1::date
      AND s.address_type = ANY($3::text[])
      AND s.bedrooms = 999

    UNION ALL

    SELECT DISTINCT 'city'::text AS geography_type,
           c.name || ', ' || c.state AS geography_value,
           c.name AS geography_label,
           s.address_type,
           s.bedrooms,
           s.month,
           s.count AS observations,
           s.median AS rent
    FROM dwellsy_prod.ai_city_stats_table s
    JOIN dwellsy_prod.city_table c ON c.id = s.city_id
    JOIN dwellsy_prod.msa_city_table membership ON membership.city_id = s.city_id
    WHERE membership.msa_code = 17460
      AND s.month >= $1::date
      AND s.address_type = ANY($3::text[])
      AND s.bedrooms = 999

    UNION ALL

    SELECT 'zip'::text AS geography_type,
           s.zip AS geography_value,
           'ZIP ' || s.zip AS geography_label,
           s.address_type,
           s.bedrooms,
           s.month,
           s.count AS observations,
           s.median AS rent
    FROM dwellsy_prod.ai_zip_stats_table s
    WHERE s.zip = ANY($2::text[])
      AND s.month >= $1::date
      AND s.address_type = ANY($3::text[])
      AND s.bedrooms = 999
  )
  SELECT current.geography_type,
         current.geography_value,
         current.geography_label,
         current.address_type,
         current.bedrooms,
         current.month,
         current.observations,
         current.rent,
         CASE WHEN prior.rent > 0
              THEN ((current.rent / prior.rent) - 1) * 100
              ELSE NULL END AS year_over_year_pct,
         'trends_median_999'::text AS value_basis
  FROM rollup current
  LEFT JOIN rollup prior
    ON prior.geography_type = current.geography_type
   AND prior.geography_value = current.geography_value
   AND prior.address_type = current.address_type
   AND prior.bedrooms = current.bedrooms
   AND prior.month = current.month - interval '1 year'
  WHERE current.rent > 0
  ORDER BY current.geography_type, current.geography_value, current.address_type, current.month
`;

export async function loadDwellsyTrendSeries(input: {
  cities: string[];
  zipCodes: string[];
  periodStart: string;
  bedrooms: number[];
}) {
  return withDwellsyReadOnly(async (client) => {
    const result = await client.query<DwellsyTrendSourceRow>(DWELLSY_TRENDS_SQL, [
      input.cities,
      input.zipCodes,
      input.periodStart,
      ["Apartment", "House"],
      input.bedrooms,
    ]);
    const series = mapDwellsyTrendRows(result.rows);
    if (!series.length) throw new Error("Dwellsy Trends returned no rows for the selected Cleveland scope.");
    return { series };
  });
}

export async function loadDwellsyProductRollupSeries(input: {
  zipCodes: string[];
  periodStart: string;
}) {
  return withDwellsyReadOnly(async (client) => {
    const result = await client.query<DwellsyTrendSourceRow>(DWELLSY_PRODUCT_ROLLUP_SQL, [
      input.periodStart,
      input.zipCodes,
      ["Apartment", "House"],
    ]);
    const series = mapDwellsyTrendRows(result.rows);
    if (!series.length) throw new Error("Dwellsy Trends returned no 999-bedroom product rollups for Cleveland.");
    return { series };
  });
}
