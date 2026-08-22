import { describe, expect, it } from "vitest";

import { compareMarketIqDailyEditions } from "@/lib/market-iq/daily-edition-comparison";
import type { MarketIqMarketActivityAvailability } from "@/lib/market-iq/listing-events";

function available(observedAt: string, values: Partial<{
  newListings24h: number;
  delistings24h: number;
  confirmedPriceChanges24h: number;
  advertisedConcessions24h: number;
  agingThresholds24h: number;
}> = {}): MarketIqMarketActivityAvailability {
  return {
    state: "available",
    activity: {
      asOf: observedAt,
      newListings24h: values.newListings24h ?? 0,
      sourceUpdates24h: 999,
      confirmedPriceChanges24h: values.confirmedPriceChanges24h ?? 0,
      advertisedConcessions24h: values.advertisedConcessions24h ?? 0,
      delistings24h: values.delistings24h ?? 0,
      agingThresholds24h: values.agingThresholds24h ?? 0,
      events: [],
    },
  };
}

describe("daily edition comparison", () => {
  it("compares observed flow counts from two available editions", () => {
    const comparison = compareMarketIqDailyEditions({
      current: available("2026-08-22T02:00:00.000Z", {
        newListings24h: 46,
        delistings24h: 52,
        confirmedPriceChanges24h: 14,
        advertisedConcessions24h: 8,
        agingThresholds24h: 20,
      }),
      previous: { availability: available("2026-08-21T02:00:00.000Z", {
        newListings24h: 40,
        delistings24h: 60,
        confirmedPriceChanges24h: 14,
        advertisedConcessions24h: 3,
        agingThresholds24h: 22,
      }) },
    });

    expect(comparison.state).toBe("available");
    if (comparison.state !== "available") return;
    expect(comparison.metrics.map(({ key, difference }) => [key, difference])).toEqual([
      ["new_listings", 6],
      ["off_market", -8],
      ["rent_moves", 0],
      ["concessions", 5],
      ["aging_crossings", -2],
    ]);
    expect(comparison.metrics.map((metric) => String(metric.key))).not.toContain("source_updates");
  });

  it("does not skip an unavailable preceding edition in favor of older data", () => {
    expect(compareMarketIqDailyEditions({
      current: available("2026-08-22T02:00:00.000Z"),
      previous: { availability: { state: "unavailable", attemptedAt: "2026-08-21T02:00:00.000Z" } },
    })).toEqual({ state: "previous_unavailable", attemptedAt: "2026-08-21T02:00:00.000Z" });
  });

  it("distinguishes no preceding edition from unavailable current data", () => {
    expect(compareMarketIqDailyEditions({
      current: available("2026-08-22T02:00:00.000Z"),
      previous: null,
    })).toEqual({ state: "no_previous" });

    expect(compareMarketIqDailyEditions({
      current: { state: "unavailable", attemptedAt: "2026-08-22T02:00:00.000Z" },
      previous: { availability: available("2026-08-21T02:00:00.000Z") },
    })).toEqual({ state: "current_unavailable", attemptedAt: "2026-08-22T02:00:00.000Z" });
  });

  it("does not substitute a timestamp when a saved edition has no activity record", () => {
    expect(compareMarketIqDailyEditions({
      current: available("2026-08-22T02:00:00.000Z"),
      previous: { availability: undefined },
    })).toEqual({ state: "previous_unavailable" });
  });
});
