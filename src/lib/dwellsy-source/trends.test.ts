import { describe, expect, it } from "vitest";
import { mapDwellsyTrendRows } from "./trends";

describe("Dwellsy Trends source mapping", () => {
  it("groups authoritative city and ZIP statistics without recalculating rent", () => {
    const series = mapDwellsyTrendRows([
      { geography_type: "zip", geography_value: "44113", geography_label: "ZIP 44113", address_type: "Apartment", bedrooms: 1, month: "2026-06-01", observations: 14, rent: "1220", year_over_year_pct: "-5.1" },
      { geography_type: "zip", geography_value: "44113", geography_label: "ZIP 44113", address_type: "Apartment", bedrooms: 1, month: "2026-07-01", observations: 17, rent: "1199", year_over_year_pct: "-7.77" },
      { geography_type: "city", geography_value: "Cleveland, OH", geography_label: "Cleveland", address_type: "House", bedrooms: 3, month: "2026-07-01", observations: 88, rent: "1387", year_over_year_pct: "-1.35" },
    ]);
    expect(series).toHaveLength(2);
    expect(series.find((item) => item.geographyValue === "44113")?.points.at(-1)).toEqual({ rent: 1199, yearOverYearPct: -7.77, observations: 17, month: "2026-07-01" });
    expect(series.find((item) => item.geographyValue === "Cleveland, OH")).toMatchObject({ propertyType: "house", bedrooms: 3 });
  });

  it("drops unusable source rows rather than estimating them", () => {
    expect(mapDwellsyTrendRows([
      { geography_type: "zip", geography_value: "44123", geography_label: "ZIP 44123", address_type: "House", bedrooms: 3, month: "2026-07-01", observations: 7, rent: null, year_over_year_pct: null },
    ])).toEqual([]);
  });

  it("preserves the explicit temporary basis on 999-bedroom summaries", () => {
    const series = mapDwellsyTrendRows([
      { geography_type: "msa", geography_value: "17460", geography_label: "Cleveland-Elyria, OH", address_type: "Apartment", bedrooms: 999, month: "2026-05-01", observations: 376, rent: 1050, year_over_year_pct: -16, value_basis: "median_999_proxy" },
    ]);
    expect(series[0]?.points[0]).toMatchObject({ rent: 1050, valueBasis: "median_999_proxy" });
  });
});
