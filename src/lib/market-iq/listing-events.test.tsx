import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { MarketIqMarketActivity } from "@/lib/market-iq/listing-events";
import { readMarketIqActivityAvailability } from "@/lib/market-iq/listing-events";

const activity: MarketIqMarketActivity = {
  asOf: "2026-08-21T15:00:00.000Z",
  newListings24h: 0,
  sourceUpdates24h: 0,
  confirmedPriceChanges24h: 0,
  delistings24h: 0,
  events: [],
};

describe("readMarketIqActivityAvailability", () => {
  it("keeps source freshness only on an available read", async () => {
    assert.deepEqual(await readMarketIqActivityAvailability(async () => activity), {
      state: "available",
      activity,
    });
  });

  it("records the attempt time without fabricating source freshness when the read fails", async () => {
    const attemptedAt = new Date("2026-08-21T16:00:00.000Z");
    const result = await readMarketIqActivityAvailability(async () => {
      throw new Error("source unavailable");
    }, attemptedAt);

    assert.deepEqual(result, { state: "unavailable", attemptedAt: attemptedAt.toISOString() });
    assert.equal("asOf" in result, false);
    assert.equal("activity" in result, false);
  });
});
