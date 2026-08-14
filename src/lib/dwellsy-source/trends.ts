import type {
  MarketIqGeographyType,
  MarketIqPropertyType,
  MarketIqTrendSeries,
} from "@/lib/market-iq/report/report";

export type DwellsyTrendSourceRow = {
  geography_type: "msa" | "city" | "zip";
  geography_value: string;
  geography_label: string;
  address_type: "Apartment" | "House";
  bedrooms: number | string;
  month: Date | string;
  observations: number | string | null;
  rent: number | string | null;
  year_over_year_pct: number | string | null;
  value_basis?: "trends_value" | "trends_median_999";
};

function numberOrNull(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthIso(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function mapDwellsyTrendRows(rows: DwellsyTrendSourceRow[]): MarketIqTrendSeries[] {
  const grouped = new Map<string, MarketIqTrendSeries>();
  for (const row of rows) {
    const rent = numberOrNull(row.rent);
    const observations = numberOrNull(row.observations);
    const bedrooms = Number(row.bedrooms);
    if (rent === null || rent <= 0 || observations === null || !Number.isInteger(bedrooms)) continue;
    const geographyType = row.geography_type as MarketIqGeographyType;
    const propertyType = row.address_type.toLowerCase() as MarketIqPropertyType;
    const key = `${geographyType}:${row.geography_value}:${propertyType}:${bedrooms}`;
    const series = grouped.get(key) ?? {
      geographyType,
      geographyValue: row.geography_value,
      geographyLabel: row.geography_label,
      propertyType,
      bedrooms,
      points: [],
    };
    series.points.push({
      rent,
      yearOverYearPct: numberOrNull(row.year_over_year_pct),
      observations,
      month: monthIso(row.month),
      valueBasis: row.value_basis,
    });
    grouped.set(key, series);
  }
  return [...grouped.values()].map((series) => ({
    ...series,
    points: series.points.sort((a, b) => a.month.localeCompare(b.month)),
  }));
}
