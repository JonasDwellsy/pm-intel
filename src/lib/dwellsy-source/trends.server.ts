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
