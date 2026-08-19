import assert from "node:assert/strict";
import test from "node:test";
import { MARKET_IQ_MARKETS } from "@/data/market-iq/markets";
import { rankMarketIqHomeMarkets } from "@/lib/market-iq/home-summary";

test("multi-market home ranks review work before configured and unconfigured markets", () => {
  const [cleveland, columbus, sanFrancisco] = MARKET_IQ_MARKETS;
  const ranked = rankMarketIqHomeMarkets([
    { market: columbus, marketSummary: null, source: "unavailable", configured: false, recurringEnabled: false, draft: null, latestPublishedAt: null, clientAdvisoryEnabled: true },
    { market: cleveland, marketSummary: null, source: "unavailable", configured: true, recurringEnabled: true, draft: { id: "draft", periodEnd: "2026-07-31", materialChangeCount: 2 }, latestPublishedAt: null, clientAdvisoryEnabled: true },
    { market: sanFrancisco, marketSummary: null, source: "unavailable", configured: true, recurringEnabled: false, draft: null, latestPublishedAt: null, clientAdvisoryEnabled: true },
  ]);
  assert.deepEqual(ranked.map((item) => item.market.id), [cleveland.id, columbus.id, sanFrancisco.id]);
  assert.equal(ranked[0]?.actionLabel, "Review draft");
  assert.match(ranked[1]?.actionHref ?? "", /get-started/);
});

test("multi-market home never presents verified seed values as current market intelligence", () => {
  const [cleveland] = MARKET_IQ_MARKETS;
  const summary = rankMarketIqHomeMarkets([{
    market: cleveland,
    marketSummary: {
      version: 1,
      marketId: cleveland.id,
      sourceAvailableThrough: "2026-07-31",
      generatedAt: "2026-08-01T00:00:00.000Z",
      apartment1: {
        geographyType: "msa",
        geographyLabel: "Cleveland-Elyria, OH",
        propertyType: "apartment",
        bedrooms: 1,
        label: "1-bedroom apartments",
        rent: 999,
        yearOverYearPct: 12,
      },
      house3: null,
      notable: null,
    },
    source: "verified_seed",
    configured: true,
    recurringEnabled: false,
    draft: null,
    latestPublishedAt: null,
    clientAdvisoryEnabled: true,
  }])[0];

  assert.equal(summary?.status, "Source unavailable");
  assert.equal(summary?.apartment, null);
  assert.equal(summary?.latestMonth, null);
});
