import assert from "node:assert/strict";
import test from "node:test";
import { MARKET_IQ_MARKETS } from "@/data/market-iq/markets";
import type { MarketIqHomeMarketSummary } from "@/lib/market-iq/home-summary";
import {
  buildMarketIqBriefingArchivePayload,
  buildMarketIqWeeklyBriefing,
  marketIqBriefingWeekOf,
  parseMarketIqBriefingArchivePayload,
  parseMarketIqEditionComparison,
} from "@/lib/market-iq/weekly-briefing";

function summary(index: number, overrides: Partial<MarketIqHomeMarketSummary> = {}): MarketIqHomeMarketSummary {
  return {
    market: MARKET_IQ_MARKETS[index]!,
    snapshot: null,
    source: "dwellsy_trends",
    configured: true,
    recurringEnabled: true,
    draft: null,
    latestPublishedAt: null,
    clientAdvisoryEnabled: true,
    apartment: null,
    house: null,
    notable: null,
    latestMonth: "2026-07-31",
    priority: 10,
    status: "Monitoring",
    headline: "Current",
    actionLabel: "Open market read",
    actionHref: "/market-iq/market",
    ...overrides,
  } as MarketIqHomeMarketSummary;
}

test("briefing puts review work ahead of current market direction", () => {
  const comparison = parseMarketIqEditionComparison(JSON.stringify({
    state: "changed",
    heading: "One material change",
    narrative: "A direction band changed.",
    priorReportId: "prior",
    priorPeriodLabel: "June 2026",
    priorPublishedAt: "2026-07-01",
    findings: [{
      id: "finding",
      kind: "direction_change",
      importance: "high",
      headline: "Columbus apartments shifted from stable to rising",
      detail: "The published Trends IQ year-over-year direction changed.",
      geographyType: "msa",
      geographyLabel: "Columbus",
      segmentLabel: "1-bedroom apartments",
      currentValue: 4,
      priorValue: 0,
      currentMonth: "2026-07-31",
      priorMonth: "2026-06-30",
      observations: null,
    }],
  }));
  const briefing = buildMarketIqWeeklyBriefing([
    { summary: summary(0), comparison: null },
    { summary: summary(1, { draft: { id: "draft", periodEnd: "2026-07-31", materialChangeCount: 1 } }), comparison },
  ]);

  assert.equal(briefing.headline, "1 market has a new edition to review");
  assert.equal(briefing.reviews[0]?.market.id, MARKET_IQ_MARKETS[1]?.id);
  assert.equal(briefing.reviews[0]?.findings[0]?.importance, "high");
});

test("briefing keeps setup and source gaps distinct", () => {
  const briefing = buildMarketIqWeeklyBriefing([
    { summary: summary(0, { configured: false, status: "Setup needed" }), comparison: null },
    { summary: summary(1, { source: "unavailable", status: "Source unavailable" }), comparison: null },
  ]);

  assert.equal(briefing.setupNeeds.length, 1);
  assert.equal(briefing.sourceGaps.length, 1);
  assert.equal(briefing.currentMarkets.length, 1);
});

test("invalid stored comparisons fail closed", () => {
  assert.equal(parseMarketIqEditionComparison("not json"), null);
  assert.equal(parseMarketIqEditionComparison(JSON.stringify({ state: "changed" })), null);
});

test("briefing archive uses a stable Monday idempotency boundary", () => {
  assert.equal(marketIqBriefingWeekOf(new Date("2026-08-18T18:00:00Z")), "2026-08-17");
  assert.equal(marketIqBriefingWeekOf(new Date("2026-08-23T23:59:59Z")), "2026-08-17");
});

test("archive payload retains compact findings and source periods", () => {
  const briefing = buildMarketIqWeeklyBriefing([{ summary: summary(0), comparison: null }]);
  const payload = buildMarketIqBriefingArchivePayload(briefing, new Date("2026-08-18T18:00:00Z"));
  const parsed = parseMarketIqBriefingArchivePayload(JSON.stringify(payload));
  assert.equal(parsed?.weekOf, "2026-08-17");
  assert.equal(parsed?.counts.markets, 1);
  assert.deepEqual(parsed?.sourcePeriods, { [MARKET_IQ_MARKETS[0]!.id]: "2026-07-31" });
});
