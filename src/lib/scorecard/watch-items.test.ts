import test from "node:test";
import { strict as assert } from "node:assert";
import { buildWatchItems } from "./watch-items";

function sc(overrides: any = {}): any {
  return {
    concessionRate: 0.48,
    coverage: { yearsVisible: 2.3 },
    lendingSignals: {
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

test("short history is a data limitation; concentration is context; ordered risk before data before context", () => {
  const kinds = buildWatchItems(sc(), 0.01).map((i) => i.kind);
  assert.ok(kinds.includes("data"));
  assert.ok(kinds.includes("context"));
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

test("rating downgrade NAMES the metric that dropped a tier (not a reader question)", () => {
  const items = buildWatchItems(sc(quiet), null, traj([
    { date: "2024-06-30", goldCount: 3, silverCount: 1, starsPerMetric: { leaseUp: "gold", tenancy: "gold", rentPerformance: "gold", marketingDiscipline: "silver", inventoryTransparency: null } },
    { date: "2025-06-30", goldCount: 2, silverCount: 1, starsPerMetric: { leaseUp: "gold", tenancy: "silver", rentPerformance: "gold", marketingDiscipline: "silver", inventoryTransparency: null } },
  ]));
  const item = items.find((i) => i.kind === "risk" && /rating downgrade/i.test(i.headline));
  assert.ok(item);
  assert.match(item!.explanation, /tenant retention dropped from gold to silver/i);
  assert.doesNotMatch(item!.ask ?? "", /which operating metric/i);
  assert.match(item!.ask ?? "", /durable/i);
});

test("rating downgrade lists multiple dropped metrics", () => {
  const items = buildWatchItems(sc(quiet), null, traj([
    { date: "2024-06-30", goldCount: 3, silverCount: 0, starsPerMetric: { leaseUp: "gold", tenancy: "gold", rentPerformance: "gold", marketingDiscipline: null, inventoryTransparency: null } },
    { date: "2025-06-30", goldCount: 1, silverCount: 0, starsPerMetric: { leaseUp: "gold", tenancy: null, rentPerformance: null, marketingDiscipline: null, inventoryTransparency: null } },
  ]));
  const item = items.find((i) => i.kind === "risk" && /rating downgrade/i.test(i.headline));
  assert.ok(item);
  assert.match(item!.explanation, /tenant retention/i);
  assert.match(item!.explanation, /rent performance/i);
  assert.match(item!.explanation, /slipped out of the top tiers/i);
});

test("rating improvement names the metric that climbed", () => {
  const items = buildWatchItems(sc(quiet), null, traj([
    { date: "2024-06-30", goldCount: 1, silverCount: 0, starsPerMetric: { leaseUp: "gold", tenancy: null, rentPerformance: null, marketingDiscipline: null, inventoryTransparency: null } },
    { date: "2025-06-30", goldCount: 1, silverCount: 1, starsPerMetric: { leaseUp: "gold", tenancy: null, rentPerformance: null, marketingDiscipline: "silver", inventoryTransparency: null } },
  ]));
  const item = items.find((i) => i.kind === "positive" && /rating improvement/i.test(i.headline));
  assert.ok(item);
  assert.match(item!.explanation, /marketing discipline climbed into the top tier/i);
});

test("rating move falls back to generic wording (+ reader ask) when per-metric stars are absent", () => {
  const items = buildWatchItems(sc(quiet), null, traj([
    { date: "2024-06-30", goldCount: 3, silverCount: 1 },
    { date: "2025-06-30", goldCount: 1, silverCount: 1 },
  ]));
  const item = items.find((i) => i.kind === "risk" && /rating downgrade/i.test(i.headline));
  assert.ok(item);
  assert.match(item!.explanation, /one or more metrics fell out of the top tiers/i);
  assert.match(item!.ask ?? "", /which operating metric/i);
});

test("falling below the listing threshold is a risk", () => {
  const items = buildWatchItems(sc(quiet), null, traj([
    { date: "2024-06-30", eligible: true, goldCount: 1, silverCount: 0 },
    { date: "2025-06-30", eligible: false, goldCount: 0, silverCount: 0 },
  ]));
  assert.ok(items.some((i) => i.kind === "risk" && /listing threshold/i.test(i.headline)));
});

test("concession-spike trend is suppressed when the level-based risk already fired", () => {
  // Level fires: 0.6 >= max(0.1, 0.02*5). Trajectory would also flag "climbing"
  // (0.05 → 0.6) — but must be suppressed so a single spike isn't double-counted.
  const items = buildWatchItems(
    sc({ concessionRate: 0.6, coverage: { yearsVisible: 6 } }),
    0.02,
    traj([
      { date: "2024-06-30", concessionRate: 0.05 },
      { date: "2025-06-30", concessionRate: 0.6 },
    ])
  );
  assert.ok(items.some((i) => /heavy concession/i.test(i.headline)));
  assert.ok(items.every((i) => !/climbing/i.test(i.headline)));
});

test("no trajectory → no trend items (back-compat)", () => {
  const items = buildWatchItems(sc(), 0.01);
  assert.ok(items.every((i) => !/climbing|downgrade|listing threshold|improvement/i.test(i.headline)));
});

// ── Single-community watch item tests ────────────────────────────────────────

test("observedCommunities = 1 yields a data item with headline matching /single community/i for MF/BTR", () => {
  const items = buildWatchItems(
    sc({ pm: { quadrant7Cell: "MF/BTR" }, coverage: { observedCommunities: 1, monthsOnPlatform: 6, urusT12: 58, yearsVisible: 6 } }),
    0.01
  );
  const item = items.find((i) => /single community/i.test(i.headline));
  assert.ok(item !== undefined);
  assert.equal(item!.kind, "data");
});

test("observedCommunities = 40 does not yield a single-community data item (MF/BTR)", () => {
  const items = buildWatchItems(
    sc({ pm: { quadrant7Cell: "MF/BTR" }, coverage: { observedCommunities: 40, yearsVisible: 6 } }),
    0.01
  );
  assert.ok(items.every((i) => !/single community/i.test(i.headline) && !/limited footprint/i.test(i.headline)));
});

test("SFR: observedCommunities = 1 does NOT yield a single-community item ('community' is meaningless for SFR)", () => {
  const items = buildWatchItems(
    sc({ pm: { quadrant7Cell: "SFR Independent" }, coverage: { observedCommunities: 1, monthsOnPlatform: 6, urusT12: 58, yearsVisible: 6 } }),
    0.01
  );
  assert.ok(items.every((i) => !/single community/i.test(i.headline) && !/limited footprint/i.test(i.headline)));
});

// ── v0.25: absolute concession trigger + tiers + scored metrics + geo margin + cap ──

const clean = (o: any = {}) =>
  sc({ concessionRate: 0, coverage: { yearsVisible: 6 }, lendingSignals: undefined, ...o });

test("objectively-high concessions flag even in a low-concession market (the Doorby case)", () => {
  // 60% in a 17% market: 5× would need ~85%, so the old relative-only rule missed it.
  const items = buildWatchItems(clean({ concessionRate: 0.604 }), 0.171);
  assert.ok(items.some((i) => i.kind === "risk" && /heavy concession/i.test(i.headline)));
});

test("40–60% concessions is 'elevated', not 'heavy'", () => {
  // mkt 0.20 so the 5× relative arm isn't tripped — only the 40% absolute arm.
  const items = buildWatchItems(clean({ concessionRate: 0.45 }), 0.2);
  assert.ok(items.some((i) => /elevated concession/i.test(i.headline)));
  assert.ok(items.every((i) => !/heavy concession/i.test(i.headline)));
});

test("modest concessions barely above a low market do NOT flag (no card-style over-firing)", () => {
  // 12% vs 10% market = 1.2×: the card WATCHes, but it isn't objectively high.
  const items = buildWatchItems(clean({ concessionRate: 0.12 }), 0.1);
  assert.ok(items.every((i) => !/concession/i.test(i.headline)));
});

test("a bottom-quartile graded metric becomes a risk with an Ask; a strong one does not", () => {
  const items = buildWatchItems(clean(), null, undefined, [
    { title: "Tenant retention", position: 0.12, star: null },
    { title: "Lease-up speed", position: 0.7, star: null },
  ]);
  const weak = items.find((i) => /bottom-quartile tenant retention/i.test(i.headline));
  assert.ok(weak && weak.kind === "risk" && !!weak.ask);
  assert.ok(items.every((i) => !/lease-up/i.test(i.headline)));
});

test("gold graded metrics roll up into a single positive", () => {
  const items = buildWatchItems(clean(), null, undefined, [
    { title: "Marketing discipline", position: 0.9, star: "gold" },
    { title: "Lease-up speed", position: 0.88, star: "gold" },
  ]);
  const pos = items.filter((i) => i.kind === "positive");
  assert.equal(pos.length, 1);
  assert.match(pos[0].headline, /top-tier/i);
});

test("geography fires only when meaningfully above cohort, not just above median", () => {
  const justAbove = buildWatchItems(
    clean({ lendingSignals: { geographicConcentration: { top3CityShare: 0.66, cohortMedianTop3: 0.61 } } }),
    null
  );
  assert.ok(justAbove.every((i) => !/concentrated geography/i.test(i.headline))); // +5pts < 10pt margin
  const wellAbove = buildWatchItems(
    clean({ lendingSignals: { geographicConcentration: { top3CityShare: 0.8, cohortMedianTop3: 0.61 } } }),
    null
  );
  assert.ok(wellAbove.some((i) => /concentrated geography/i.test(i.headline)));
});

test("the item list is capped to stay scannable", () => {
  const items = buildWatchItems(
    sc({
      concessionRate: 0.7,
      pm: { quadrant7Cell: "MF/BTR" },
      coverage: { yearsVisible: 1, observedCommunities: 1, monthsOnPlatform: 6, urusT12: 40 },
      lendingSignals: { geographicConcentration: { top3CityShare: 0.9, cohortMedianTop3: 0.5 } },
    }),
    0.02,
    undefined,
    [
      { title: "Tenant retention", position: 0.1, star: null },
      { title: "Lease-up speed", position: 0.05, star: null },
      { title: "Rent performance", position: 0.2, star: null },
      { title: "Marketing discipline", position: 0.15, star: null },
    ]
  );
  assert.ok(items.length <= 6);
});
