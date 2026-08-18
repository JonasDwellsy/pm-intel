import assert from "node:assert/strict";
import test from "node:test";
import { compareMarketIqBriefingArchives, type MarketIqBriefingArchivePayload } from "./weekly-briefing";

function archive(overrides: Partial<MarketIqBriefingArchivePayload> = {}): MarketIqBriefingArchivePayload {
  return {
    version: 1,
    preparedAt: "2026-08-17T12:00:00.000Z",
    weekOf: "2026-08-17",
    headline: "Every configured market is current",
    counts: { markets: 3, currentSources: 3, reviews: 0, exceptions: 0 },
    reviews: [],
    currentMoves: [],
    exceptions: [],
    sourcePeriods: {},
    ...overrides,
  };
}

test("archive comparison matches the same market, geography, and segment", () => {
  const prior = archive({
    weekOf: "2026-08-10",
    currentMoves: [{ marketId: "cleveland", marketName: "Cleveland", geographyLabel: "ZIP 44113", segmentLabel: "1-bed apartments", rent: 1000, yearOverYearPct: 2, sourcePeriodEnd: "2026-06-30" }],
  });
  const current = archive({
    currentMoves: [{ marketId: "cleveland", marketName: "Cleveland", geographyLabel: "ZIP 44113", segmentLabel: "1-bed apartments", rent: 1050, yearOverYearPct: -1, sourcePeriodEnd: "2026-07-31" }],
  });
  const comparison = compareMarketIqBriefingArchives(current, prior);
  assert.equal(comparison?.moveChanges[0]?.rentChange, 50);
  assert.equal(comparison?.moveChanges[0]?.directionChange, -3);
});

test("archive comparison identifies added and resolved exceptions", () => {
  const prior = archive({ exceptions: [{ marketId: "columbus", marketName: "Columbus", kind: "setup" }] });
  const current = archive({ exceptions: [{ marketId: "san-jose", marketName: "San Jose", kind: "source" }] });
  const comparison = compareMarketIqBriefingArchives(current, prior);
  assert.equal(comparison?.addedExceptions[0]?.marketId, "san-jose");
  assert.equal(comparison?.resolvedExceptions[0]?.marketId, "columbus");
});

test("the first archive has no week-over-week comparison", () => {
  assert.equal(compareMarketIqBriefingArchives(archive(), null), null);
});
