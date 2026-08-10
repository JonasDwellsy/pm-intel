import { describe, expect, it } from "vitest";
import { buildTrendAlertCandidates } from "@/lib/market-iq/alerts";

describe("buildTrendAlertCandidates", () => {
  it("flags material year-over-year and monthly changes with sample guardrails", () => {
    const alerts = buildTrendAlertCandidates([
      { month: new Date("2026-05-01T00:00:00Z"), propertyType: "apartment", bedrooms: 1, observations: 10, askingRent: 900, yearOverYearPct: 2 },
      { month: new Date("2026-06-01T00:00:00Z"), propertyType: "apartment", bedrooms: 1, observations: 12, askingRent: 960, yearOverYearPct: 8.2 },
      { month: new Date("2026-06-01T00:00:00Z"), propertyType: "house", bedrooms: 3, observations: 2, askingRent: 1500, yearOverYearPct: -9 },
    ]);
    expect(alerts.map((alert) => alert.signalType)).toEqual(["yoy_growth", "monthly_move"]);
    expect(alerts.every((alert) => alert.severity === "material")).toBe(true);
  });
});
