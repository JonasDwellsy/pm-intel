import { describe, expect, it } from "vitest";
import { readMarketIqTimeToResolutionAvailability } from "./time-to-resolution";

describe("time-to-resolution availability", () => {
  it("preserves source freshness for a successful read", async () => {
    const resolution = {
      asOf: "2026-08-21T18:53:05.000Z",
      windowStart: "2026-05-23T19:00:00.000Z",
      windowEnd: "2026-08-21T19:00:00.000Z",
      sampleSize: 4_125,
      medianDays: 27.4,
      p25Days: 10,
      p75Days: 56,
      p90Days: 111.8,
      bedroomSegments: [],
      rentBands: [],
    };

    await expect(readMarketIqTimeToResolutionAvailability(() => Promise.resolve(resolution))).resolves.toEqual({
      state: "available",
      resolution,
    });
  });

  it("returns only an attempt timestamp when the source read fails", async () => {
    const result = await readMarketIqTimeToResolutionAvailability(
      () => Promise.reject(new Error("source unavailable")),
      new Date("2026-08-21T19:15:00.000Z"),
    );

    expect(result).toEqual({ state: "unavailable", attemptedAt: "2026-08-21T19:15:00.000Z" });
    expect(result).not.toHaveProperty("asOf");
    expect(result).not.toHaveProperty("resolution");
  });
});
