import test from "node:test";
import { strict as assert } from "node:assert";
import { buildWatchItems } from "./watch-items";

function sc(overrides: any = {}): any {
  return {
    concessionRate: 0.48,
    coverage: { yearsVisible: 2.3 },
    lendingSignals: {
      rentStability: { volatilityPP: 1.1, cohortMedianVolatility: 3.0, suppressed: false },
      geographicConcentration: { top3CityShare: 0.84, cohortMedianTop3: 0.61 },
    },
    ...overrides,
  };
}

test("heavy concession use becomes a risk with an Ask, ordered first", () => {
  const items = buildWatchItems(sc(), 0.01);
  assert.equal(items[0].kind, "risk");
  assert.match(items[0].headline, /concession/i);
  assert.ok(items[0].ask && items[0].ask.length > 0);
});

test("short history is a data limitation; concentration is context; low volatility is positive", () => {
  const kinds = buildWatchItems(sc(), 0.01).map((i) => i.kind);
  assert.ok(kinds.includes("data"));
  assert.ok(kinds.includes("context"));
  assert.ok(kinds.includes("positive"));
  // ordering: risk before data before context before positive
  const order = ["risk", "data", "context", "positive"];
  const idx = kinds.map((k) => order.indexOf(k));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
});

test("no items when nothing is notable", () => {
  const quiet = sc({
    concessionRate: 0.0,
    coverage: { yearsVisible: 6 },
    lendingSignals: {
      rentStability: { volatilityPP: 3.1, cohortMedianVolatility: 3.0, suppressed: false },
      geographicConcentration: { top3CityShare: 0.55, cohortMedianTop3: 0.61 },
    },
  });
  assert.equal(buildWatchItems(quiet, 0.01).length, 0);
});
