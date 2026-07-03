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

// --- Trajectory-based (trend) tests ---

const quiet = {
  concessionRate: 0.0,
  coverage: { yearsVisible: 6 },
  lendingSignals: {
    rentStability: { volatilityPP: 3.1, cohortMedianVolatility: 3.0, suppressed: false },
    geographicConcentration: { top3CityShare: 0.4, cohortMedianTop3: 0.6 },
  },
};
const traj = (points: any[]) => ({ points });

test("concession climbing sharply is a trend risk", () => {
  const items = buildWatchItems(sc({ concessionRate: 0.0 }), 0.5, traj([
    { date: "2024-06-30", concessionRate: 0.05 },
    { date: "2025-06-30", concessionRate: 0.20 },
  ]));
  assert.ok(items.some((i) => i.kind === "risk" && /climbing/i.test(i.headline)));
});

test("rating downgrade is a risk; improvement is positive", () => {
  const down = buildWatchItems(sc(quiet), null, traj([
    { date: "2024-06-30", goldCount: 3, silverCount: 1 },
    { date: "2025-06-30", goldCount: 1, silverCount: 1 },
  ]));
  assert.ok(down.some((i) => i.kind === "risk" && /downgrade/i.test(i.headline)));
  const up = buildWatchItems(sc(quiet), null, traj([
    { date: "2024-06-30", goldCount: 1, silverCount: 0 },
    { date: "2025-06-30", goldCount: 3, silverCount: 1 },
  ]));
  assert.ok(up.some((i) => i.kind === "positive" && /improvement/i.test(i.headline)));
});

test("dropped from rankings is a risk", () => {
  const items = buildWatchItems(sc(quiet), null, traj([
    { date: "2024-06-30", eligible: true, goldCount: 1, silverCount: 0 },
    { date: "2025-06-30", eligible: false, goldCount: 0, silverCount: 0 },
  ]));
  assert.ok(items.some((i) => i.kind === "risk" && /dropped/i.test(i.headline)));
});

test("no trajectory → no trend items (back-compat)", () => {
  const items = buildWatchItems(sc(), 0.01);
  assert.ok(items.every((i) => !/climbing|downgrade|dropped|improvement/i.test(i.headline)));
});

// ── Single-community watch item tests ────────────────────────────────────────

test("observedCommunities = 1 yields a data item with headline matching /single community/i", () => {
  const items = buildWatchItems(
    sc({ coverage: { observedCommunities: 1, monthsOnPlatform: 6, urusT12: 58, yearsVisible: 6 } }),
    0.01
  );
  const item = items.find((i) => /single community/i.test(i.headline));
  assert.ok(item !== undefined);
  assert.equal(item!.kind, "data");
});

test("observedCommunities = 40 does not yield a single-community data item", () => {
  const items = buildWatchItems(
    sc({ coverage: { observedCommunities: 40, yearsVisible: 6 } }),
    0.01
  );
  assert.ok(items.every((i) => !/single community/i.test(i.headline) && !/limited footprint/i.test(i.headline)));
});
