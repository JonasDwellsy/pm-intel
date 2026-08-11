import assert from "node:assert/strict";
import test from "node:test";
import { buildOwnerAttentionQueue, type TodaySignalCandidate } from "@/lib/portfolio-iq/today";

function candidate(overrides: Partial<TodaySignalCandidate> & Pick<TodaySignalCandidate, "id" | "assetId">): TodaySignalCandidate {
  return {
    category: "market",
    severity: "high",
    confidence: "high",
    rankScore: 85,
    evidence: "{}",
    evidenceSources: JSON.stringify(["owner_portfolio", "dwellsy_iq_trends"]),
    signalType: "local_market_change",
    observedAt: new Date("2026-08-10T00:00:00Z"),
    exposures: overrides.assetId ? [{ assetId: overrides.assetId }] : [],
    ...overrides,
  };
}

test("thin market samples are monitored without being called high confidence", () => {
  const queue = buildOwnerAttentionQueue([
    candidate({ id: "thin", assetId: "asset-1", qualityObservations: 4, rankScore: 99 }),
  ], { now: new Date("2026-08-11T00:00:00Z") });

  assert.equal(queue.today.length, 0);
  assert.equal(queue.watchlist.length, 1);
  assert.equal(queue.watchlist[0].findingQuality.calibratedConfidence, "developing");
  assert.match(queue.watchlist[0].findingQuality.reason, /Only 4 observations/);
});

test("verified financial exposure can outrank a higher raw signal score", () => {
  const queue = buildOwnerAttentionQueue([
    candidate({ id: "financial", assetId: "asset-1", rankScore: 80, qualityObservations: 40 }),
    candidate({ id: "raw", assetId: "asset-2", category: "performance", signalType: "listing_velocity_slow", rankScore: 96, qualityObservations: 20, evidenceSources: JSON.stringify(["owner_portfolio", "historical_listing_export", "approved_comps"]) }),
  ], {
    now: new Date("2026-08-11T00:00:00Z"),
    annualFinancialExposureByAssetId: new Map([["asset-1", 30_000]]),
  });

  assert.deepEqual(queue.today.map((item) => item.id), ["financial", "raw"]);
  assert.match(queue.today[0].findingQuality.reason, /\$30,000/);
});

test("related comp-position signals become one auditable finding", () => {
  const queue = buildOwnerAttentionQueue([
    candidate({ id: "rent", assetId: "asset-1", category: "performance", signalType: "segment_rent_above_comps", bedrooms: 2, qualityObservations: 30 }),
    candidate({ id: "psf", assetId: "asset-1", category: "performance", signalType: "segment_rent_psf_above_comps", bedrooms: 2, qualityObservations: 30, rankScore: 90 }),
  ], { now: new Date("2026-08-11T00:00:00Z") });

  assert.equal(queue.consolidatedCount, 1);
  assert.equal(queue.today.length, 1);
  assert.equal(queue.today[0].findingQuality.consolidatedCount, 2);
  assert.deepEqual(new Set(queue.today[0].findingQuality.relatedSignalIds), new Set(["rent", "psf"]));
});

test("Today enforces a three-decision attention budget", () => {
  const signals = [1, 2, 3, 4, 5].map((number) => candidate({
    id: `signal-${number}`,
    assetId: `asset-${number}`,
    qualityObservations: 50,
    rankScore: 100 - number,
  }));
  const queue = buildOwnerAttentionQueue(signals, { limit: 3, now: new Date("2026-08-11T00:00:00Z") });

  assert.deepEqual(queue.today.map((item) => item.id), ["signal-1", "signal-2", "signal-3"]);
  assert.deepEqual(queue.watchlist.map((item) => item.id), ["signal-4", "signal-5"]);
  assert.match(queue.watchlist[0].findingQuality.reason, /limited to 3 primary decisions/);
});

