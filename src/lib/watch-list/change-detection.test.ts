// v0.16 — diff library coverage.
//
// The diff function is the methodology-adjacent surface that drives
// every banner count and every detail-table row, so it's worth
// pinning each signal individually + at the aggregate level. None
// of these tests touch the DB — diffSnapshots() is pure.

import test from "node:test";
import { strict as assert } from "node:assert";
import {
  CONCESSION_SHIFT_THRESHOLD_PP,
  PORTFOLIO_SIZE_THRESHOLD_PCT,
  diffSnapshots,
  summariseChanges,
  type OperatorChange,
} from "./change-detection";
import type { SnapshotRow, StarsPerMetric } from "./snapshot";

/** Build a snapshot row with sensible defaults. Tests override only
 *  the fields they exercise so the diff for the rest is empty. */
function makeSnapshot(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  const baselineStars: StarsPerMetric = {
    leaseUp: null,
    tenancy: null,
    rentPerformance: null,
    marketingDiscipline: null,
    inventoryTransparency: null,
  };
  return {
    pmSlug: "test-operator-chattanooga-tn",
    snapshotDate: new Date("2026-04-30"),
    methodologyVersion: "v0.8",
    starsPerMetric: baselineStars,
    starGoldCount: 0,
    starSilverCount: 0,
    estimatedPortfolioPoint: null,
    estimatedPortfolioBand: null,
    topMSAs: ["chattanooga-tn"],
    topSubmarkets: [],
    concessionRate: null,
    isEligibleForRanking: false,
    ...overrides,
  };
}

test("two identical snapshots produce no changes", () => {
  const s = makeSnapshot();
  assert.deepEqual(diffSnapshots(s, s), []);
});

// ── Star changes ──────────────────────────────────────────────────────

test("star tier change surfaces one change per metric that moved", () => {
  const prior = makeSnapshot({
    starsPerMetric: {
      leaseUp: "silver",
      tenancy: "gold",
      rentPerformance: null,
      marketingDiscipline: null,
      inventoryTransparency: null,
    },
  });
  const current = makeSnapshot({
    starsPerMetric: {
      leaseUp: "gold", // promoted
      tenancy: "gold", // unchanged
      rentPerformance: "silver", // earned
      marketingDiscipline: null, // unchanged
      inventoryTransparency: null, // unchanged
    },
  });
  const changes = diffSnapshots(prior, current);
  const starChanges = changes.filter((c): c is Extract<OperatorChange, { type: "star" }> => c.type === "star");
  assert.equal(starChanges.length, 2);
  assert.deepEqual(
    starChanges.find((c) => c.metric === "leaseUp"),
    { type: "star", metric: "leaseUp", before: "silver", after: "gold" }
  );
  assert.deepEqual(
    starChanges.find((c) => c.metric === "rentPerformance"),
    { type: "star", metric: "rentPerformance", before: null, after: "silver" }
  );
});

test("losing a star (gold → null) surfaces as a star change with after=null", () => {
  const prior = makeSnapshot({
    starsPerMetric: {
      leaseUp: "gold",
      tenancy: null,
      rentPerformance: null,
      marketingDiscipline: null,
      inventoryTransparency: null,
    },
  });
  const current = makeSnapshot({
    starsPerMetric: {
      leaseUp: null,
      tenancy: null,
      rentPerformance: null,
      marketingDiscipline: null,
      inventoryTransparency: null,
    },
  });
  const changes = diffSnapshots(prior, current);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], {
    type: "star",
    metric: "leaseUp",
    before: "gold",
    after: null,
  });
});

// ── Portfolio band + size ─────────────────────────────────────────────

test("portfolio band change (Low → Medium) surfaces as a band change", () => {
  const prior = makeSnapshot({
    estimatedPortfolioPoint: 200,
    estimatedPortfolioBand: "Low",
  });
  const current = makeSnapshot({
    estimatedPortfolioPoint: 210,
    estimatedPortfolioBand: "Medium",
  });
  const changes = diffSnapshots(prior, current);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], {
    type: "portfolio_band",
    before: "Low",
    after: "Medium",
  });
});

test("portfolio size +25% with same band surfaces as size change", () => {
  const prior = makeSnapshot({
    estimatedPortfolioPoint: 100,
    estimatedPortfolioBand: "Medium",
  });
  const current = makeSnapshot({
    estimatedPortfolioPoint: 130,
    estimatedPortfolioBand: "Medium",
  });
  const changes = diffSnapshots(prior, current);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, "portfolio_size");
  const c = changes[0] as Extract<OperatorChange, { type: "portfolio_size" }>;
  assert.equal(c.before, 100);
  assert.equal(c.after, 130);
  assert.ok(Math.abs(c.pctChange - 0.3) < 1e-9);
});

test("portfolio size +15% with same band stays below threshold — no change surfaced", () => {
  const prior = makeSnapshot({
    estimatedPortfolioPoint: 100,
    estimatedPortfolioBand: "Medium",
  });
  const current = makeSnapshot({
    estimatedPortfolioPoint: 115,
    estimatedPortfolioBand: "Medium",
  });
  assert.deepEqual(diffSnapshots(prior, current), []);
});

test("transition from non-estimated to estimated fires the BAND change, not size (avoids double-counting)", () => {
  const prior = makeSnapshot({
    estimatedPortfolioPoint: null,
    estimatedPortfolioBand: "insufficient_data",
  });
  const current = makeSnapshot({
    estimatedPortfolioPoint: 250,
    estimatedPortfolioBand: "Medium",
  });
  const changes = diffSnapshots(prior, current);
  // Band change yes, size change no (prior point was null).
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, "portfolio_band");
});

test("portfolio threshold matches the documented 20% exact constant", () => {
  // Guards against accidental constant drift — the spec calls
  // out 20% explicitly so it shouldn't be tuned away from that.
  assert.equal(PORTFOLIO_SIZE_THRESHOLD_PCT, 0.2);
});

// ── Market + submarket coverage ───────────────────────────────────────

test("market added surfaces one change per added MSA", () => {
  const prior = makeSnapshot({ topMSAs: ["chattanooga-tn"] });
  const current = makeSnapshot({
    topMSAs: ["chattanooga-tn", "jacksonville-fl", "memphis-tn-ms-ar"],
  });
  const changes = diffSnapshots(prior, current);
  const adds = changes.filter((c) => c.type === "market_added");
  assert.equal(adds.length, 2);
  const addedMsaIds = adds
    .map((c) => (c as Extract<OperatorChange, { type: "market_added" }>).marketId)
    .sort();
  assert.deepEqual(addedMsaIds, ["jacksonville-fl", "memphis-tn-ms-ar"]);
});

test("market dropped surfaces one change per removed MSA", () => {
  const prior = makeSnapshot({
    topMSAs: ["chattanooga-tn", "knoxville-tn"],
  });
  const current = makeSnapshot({ topMSAs: ["chattanooga-tn"] });
  const changes = diffSnapshots(prior, current);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], { type: "market_dropped", marketId: "knoxville-tn" });
});

test("submarket added + dropped surface as separate per-submarket changes", () => {
  const prior = makeSnapshot({ topSubmarkets: ["north", "south"] });
  const current = makeSnapshot({ topSubmarkets: ["north", "east"] });
  const changes = diffSnapshots(prior, current);
  const adds = changes.filter((c) => c.type === "submarket_added");
  const drops = changes.filter((c) => c.type === "submarket_dropped");
  assert.equal(adds.length, 1);
  assert.equal(drops.length, 1);
  assert.equal(
    (adds[0] as Extract<OperatorChange, { type: "submarket_added" }>).submarketSlug,
    "east"
  );
  assert.equal(
    (drops[0] as Extract<OperatorChange, { type: "submarket_dropped" }>).submarketSlug,
    "south"
  );
});

// ── Concession ─────────────────────────────────────────────────────────

test("concession appears (null → number) surfaces as a transition", () => {
  const prior = makeSnapshot({ concessionRate: null });
  const current = makeSnapshot({ concessionRate: 0.18 });
  const changes = diffSnapshots(prior, current);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], {
    type: "concession_transition",
    direction: "appeared",
    before: null,
    after: 0.18,
  });
});

test("concession clears (number → null) surfaces as a transition", () => {
  const prior = makeSnapshot({ concessionRate: 0.12 });
  const current = makeSnapshot({ concessionRate: null });
  const changes = diffSnapshots(prior, current);
  assert.equal(changes.length, 1);
  assert.equal(
    (changes[0] as Extract<OperatorChange, { type: "concession_transition" }>).direction,
    "cleared"
  );
});

test("concession shifts ≥5pp surfaces as a shift", () => {
  const prior = makeSnapshot({ concessionRate: 0.05 });
  const current = makeSnapshot({ concessionRate: 0.12 }); // +7pp
  const changes = diffSnapshots(prior, current);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, "concession_shift");
  const c = changes[0] as Extract<OperatorChange, { type: "concession_shift" }>;
  assert.ok(Math.abs(c.deltaPp - 7) < 1e-9);
});

test("concession shift of 3pp stays below threshold — no change", () => {
  const prior = makeSnapshot({ concessionRate: 0.05 });
  const current = makeSnapshot({ concessionRate: 0.08 });
  assert.deepEqual(diffSnapshots(prior, current), []);
});

test("concession threshold matches the documented 5pp constant", () => {
  assert.equal(CONCESSION_SHIFT_THRESHOLD_PP, 5);
});

// ── Eligibility ────────────────────────────────────────────────────────

test("eligibility entry surfaces with direction='entered'", () => {
  const prior = makeSnapshot({ isEligibleForRanking: false });
  const current = makeSnapshot({ isEligibleForRanking: true });
  const changes = diffSnapshots(prior, current);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], { type: "eligibility_flip", direction: "entered" });
});

test("eligibility exit surfaces with direction='exited'", () => {
  const prior = makeSnapshot({ isEligibleForRanking: true });
  const current = makeSnapshot({ isEligibleForRanking: false });
  const changes = diffSnapshots(prior, current);
  assert.equal(
    (changes[0] as Extract<OperatorChange, { type: "eligibility_flip" }>).direction,
    "exited"
  );
});

// ── Multi-signal + aggregation ────────────────────────────────────────

test("multiple signal types on the same operator all surface", () => {
  const prior = makeSnapshot({
    starsPerMetric: {
      leaseUp: "silver",
      tenancy: null,
      rentPerformance: null,
      marketingDiscipline: null,
      inventoryTransparency: null,
    },
    estimatedPortfolioPoint: 100,
    estimatedPortfolioBand: "Low",
    concessionRate: null,
    isEligibleForRanking: false,
  });
  const current = makeSnapshot({
    starsPerMetric: {
      leaseUp: "gold",
      tenancy: null,
      rentPerformance: null,
      marketingDiscipline: null,
      inventoryTransparency: null,
    },
    estimatedPortfolioPoint: 200,
    estimatedPortfolioBand: "Medium",
    concessionRate: 0.1,
    isEligibleForRanking: true,
  });
  const changes = diffSnapshots(prior, current);
  // star + band + size (100→200 = +100%) + concession-transition + eligibility-flip
  assert.equal(changes.length, 5);
});

test("summariseChanges rolls up multi-operator counts by category", () => {
  const m = new Map<string, OperatorChange[]>([
    [
      "op-a",
      [
        { type: "star", metric: "leaseUp", before: "silver", after: "gold" },
        { type: "portfolio_band", before: "Low", after: "Medium" },
      ],
    ],
    [
      "op-b",
      [
        { type: "market_added", marketId: "phoenix-az" },
      ],
    ],
    ["op-c", []], // zero changes — excluded from operator count
  ]);
  const summary = summariseChanges(m);
  assert.equal(summary.operatorCount, 2);
  assert.equal(summary.totalChanges, 3);
  assert.equal(summary.starChanges, 1);
  assert.equal(summary.portfolioChanges, 1);
  assert.equal(summary.marketEntries, 1);
  assert.equal(summary.marketDrops, 0);
});
