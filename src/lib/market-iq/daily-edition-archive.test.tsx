import { describe, expect, it } from "vitest";

import {
  selectMarketIqDailyEditionArchive,
  type MarketIqDailyEditionCandidate,
} from "@/lib/market-iq/daily-edition-archive";

function available(
  id: string,
  observedAt: string,
  generatedAt = observedAt,
): MarketIqDailyEditionCandidate<string> {
  return {
    id,
    generatedAt,
    value: id,
    availability: {
      state: "available",
      activity: {
        asOf: observedAt,
        newListings24h: 0,
        sourceUpdates24h: 0,
        confirmedPriceChanges24h: 0,
        advertisedConcessions24h: 0,
        delistings24h: 0,
        agingThresholds24h: 0,
        events: [],
      },
    },
  };
}

describe("daily edition archive selection", () => {
  it("keeps the newest persisted refresh for each market-local observation day", () => {
    const archive = selectMarketIqDailyEditionArchive({
      timeZone: "America/New_York",
      candidates: [
        available("older-refresh", "2026-08-22T01:00:00.000Z", "2026-08-22T01:05:00.000Z"),
        available("newer-refresh", "2026-08-22T02:00:00.000Z", "2026-08-22T02:05:00.000Z"),
        available("prior-day", "2026-08-21T02:00:00.000Z", "2026-08-21T02:05:00.000Z"),
      ],
    });

    expect(archive.recent.map((edition) => edition.id)).toEqual(["newer-refresh", "prior-day"]);
    expect(archive.current?.observedAt).toBe("2026-08-22T02:00:00.000Z");
    expect(archive.previous?.id).toBe("prior-day");
    expect(archive.next).toBeNull();
  });

  it("navigates persisted editions without reconstructing missing days", () => {
    const archive = selectMarketIqDailyEditionArchive({
      timeZone: "America/New_York",
      requestedEditionId: "middle",
      candidates: [
        available("latest", "2026-08-23T03:00:00.000Z"),
        available("middle", "2026-08-21T03:00:00.000Z"),
        available("oldest", "2026-08-18T03:00:00.000Z"),
      ],
    });

    expect(archive.current?.id).toBe("middle");
    expect(archive.next?.id).toBe("latest");
    expect(archive.previous?.id).toBe("oldest");
    expect(archive.recent).toHaveLength(3);
  });

  it("uses attemptedAt for unavailable reads and never substitutes generatedAt", () => {
    const archive = selectMarketIqDailyEditionArchive({
      timeZone: "America/New_York",
      candidates: [{
        id: "unavailable",
        generatedAt: "2030-01-01T00:00:00.000Z",
        value: "unavailable",
        availability: { state: "unavailable", attemptedAt: "2026-08-20T14:00:00.000Z" },
      }],
    });

    expect(archive.current).toMatchObject({
      id: "unavailable",
      observedAt: "2026-08-20T14:00:00.000Z",
      state: "unavailable",
    });
    expect(archive.current?.observedAt).not.toBe("2030-01-01T00:00:00.000Z");
  });

  it("reports an unknown requested edition instead of falling back to latest", () => {
    const archive = selectMarketIqDailyEditionArchive({
      timeZone: "America/New_York",
      requestedEditionId: "missing",
      candidates: [available("latest", "2026-08-23T03:00:00.000Z")],
    });

    expect(archive.current).toBeNull();
    expect(archive.latest?.id).toBe("latest");
    expect(archive.requestedEditionMissing).toBe(true);
  });

  it("ignores snapshots with no activity availability record", () => {
    const archive = selectMarketIqDailyEditionArchive({
      timeZone: "America/New_York",
      candidates: [{
        id: "monthly-only",
        generatedAt: "2026-08-23T03:00:00.000Z",
        value: "monthly-only",
        availability: undefined,
      }],
    });

    expect(archive.latest).toBeNull();
    expect(archive.recent).toEqual([]);
  });
});
