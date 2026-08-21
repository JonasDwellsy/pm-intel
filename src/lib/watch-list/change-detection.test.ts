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
  SUBMARKET_NET_THRESHOLD,
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
    quadrant7Cell: null,
    operatorStatus: "active" as const,
    lastListingDate: null,
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

test("crossing a size-band edge surfaces as a band change", () => {
  // 380 → 420 crosses 200–400 into 400–800. This is the move a reader can
  // see on the scorecard, so it is the move worth alerting on.
  const prior = makeSnapshot({ estimatedPortfolioPoint: 380, estimatedPortfolioBand: "300–500" });
  const current = makeSnapshot({ estimatedPortfolioPoint: 420, estimatedPortfolioBand: "340–560" });
  const changes = diffSnapshots(prior, current);
  const band = changes.filter((c) => c.type === "portfolio_band");
  assert.equal(band.length, 1);
  assert.deepEqual(band[0], { type: "portfolio_band", before: "200–400", after: "400–800" });
});

test("drift WITHIN a band surfaces nothing, even though the stored range moved", () => {
  // The regression this guards. `estimatedPortfolioBand` holds the raw low–high
  // turnover range, which shifts a few units every refresh as the T12 window
  // slides. Diffing that string fired 7,202 times on the Jul-17 → Aug-20 pair
  // — roughly once per watched operator — with transitions like 77–128 → 72–120
  // that mean nothing to a reader. Both points below sit in 50–100.
  const prior = makeSnapshot({ estimatedPortfolioPoint: 77, estimatedPortfolioBand: "77–128" });
  const current = makeSnapshot({ estimatedPortfolioPoint: 72, estimatedPortfolioBand: "72–120" });
  assert.deepEqual(diffSnapshots(prior, current), []);
});

test("a sub-band move big enough to matter still reports, as portfolio_size", () => {
  // Nothing is lost by banding the alert: a ≥20% move that stays inside one
  // band is still reported, just as the thresholded size change.
  const prior = makeSnapshot({ estimatedPortfolioPoint: 1000, estimatedPortfolioBand: "1,000–1,600" });
  const current = makeSnapshot({ estimatedPortfolioPoint: 1400, estimatedPortfolioBand: "1,400–2,240" });
  const changes = diffSnapshots(prior, current);
  assert.equal(changes.filter((c) => c.type === "portfolio_band").length, 0, "same band (800–1,600)");
  assert.equal(changes.filter((c) => c.type === "portfolio_size").length, 1);
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

test("in-one-out-one submarket churn surfaces nothing", () => {
  // Net zero. Membership in topSubmarkets is ">=1 listing in the T12 window",
  // so this is indistinguishable from one listing drifting across a boundary.
  // 115 operators looked exactly like this on the Jul-17 → Aug-20 pair.
  const prior = makeSnapshot({ topSubmarkets: ["north", "south"] });
  const current = makeSnapshot({ topSubmarkets: ["north", "east"] });
  assert.deepEqual(diffSnapshots(prior, current), []);
});

test("a single added submarket surfaces nothing", () => {
  // Net +1 — the most common shape by far (708 of 1,104 operators) and below
  // the floor of what one listing can distinguish.
  const prior = makeSnapshot({ topSubmarkets: ["north", "south"] });
  const current = makeSnapshot({ topSubmarkets: ["north", "south", "east"] });
  assert.deepEqual(diffSnapshots(prior, current), []);
});

test("a net footprint move of 2+ enumerates every submarket that moved", () => {
  // The gate is on the NET count, but once it passes the reader still sees
  // exactly which submarkets changed — including the dropped one.
  const prior = makeSnapshot({ topSubmarkets: ["north", "south"] });
  const current = makeSnapshot({ topSubmarkets: ["north", "east", "west", "up"] });
  const changes = diffSnapshots(prior, current);
  const adds = changes
    .filter((c) => c.type === "submarket_added")
    .map((c) => (c as Extract<OperatorChange, { type: "submarket_added" }>).submarketSlug);
  const drops = changes
    .filter((c) => c.type === "submarket_dropped")
    .map((c) => (c as Extract<OperatorChange, { type: "submarket_dropped" }>).submarketSlug);
  assert.deepEqual(adds.sort(), ["east", "up", "west"]);
  assert.deepEqual(drops, ["south"]);
});

test("a net contraction of 2+ also reports", () => {
  const prior = makeSnapshot({ topSubmarkets: ["a", "b", "c", "d"] });
  const current = makeSnapshot({ topSubmarkets: ["a", "b"] });
  const drops = diffSnapshots(prior, current).filter((c) => c.type === "submarket_dropped");
  assert.equal(drops.length, 2);
});

test("submarket threshold matches the documented net-count constant", () => {
  assert.equal(SUBMARKET_NET_THRESHOLD, 2);
  const prior = makeSnapshot({ topSubmarkets: ["a"] });
  // Exactly at the threshold fires; one below does not.
  const at = makeSnapshot({ topSubmarkets: ["a", "b", "c"] });
  const below = makeSnapshot({ topSubmarkets: ["a", "b"] });
  assert.ok(diffSnapshots(prior, at).some((c) => c.type === "submarket_added"));
  assert.deepEqual(diffSnapshots(prior, below), []);
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

// ─── methodology-version guard ────────────────────────────────────

test("methodology-version change suppresses re-derived star / portfolio changes", () => {
  // Stars, portfolio point, and the size band are all RE-DERIVED under the
  // current methodology. When the version bumps between snapshots (e.g. a
  // cohort reclassification or size recalibration), those move for the whole
  // cohort without any operator behaviour changing — so the diff must NOT
  // emit star / portfolio_size / portfolio_band across that boundary.
  const prior = makeSnapshot({
    methodologyVersion: "v0.7",
    starsPerMetric: {
      leaseUp: "gold",
      tenancy: null,
      rentPerformance: null,
      marketingDiscipline: null,
      inventoryTransparency: null,
    },
    estimatedPortfolioPoint: 1000,
    estimatedPortfolioBand: "800–1200",
    topMSAs: ["chattanooga-tn"],
  });
  const current = makeSnapshot({
    methodologyVersion: "v0.8",
    starsPerMetric: {
      leaseUp: null, // flipped
      tenancy: null,
      rentPerformance: null,
      marketingDiscipline: null,
      inventoryTransparency: null,
    },
    estimatedPortfolioPoint: 500, // −50%
    estimatedPortfolioBand: "400–600",
    topMSAs: ["chattanooga-tn", "nashville-tn"], // genuine coverage change
  });
  const changes = diffSnapshots(prior, current);
  const types = changes.map((c) => c.type);
  assert.equal(types.includes("star"), false);
  assert.equal(types.includes("portfolio_size"), false);
  assert.equal(types.includes("portfolio_band"), false);
  // ...but a genuinely behavioural change (new market coverage) still fires.
  assert.equal(types.includes("market_added"), true);
});

test("same methodology version still fires star + portfolio changes", () => {
  const prior = makeSnapshot({
    methodologyVersion: "v0.8",
    starsPerMetric: {
      leaseUp: "gold",
      tenancy: null,
      rentPerformance: null,
      marketingDiscipline: null,
      inventoryTransparency: null,
    },
    estimatedPortfolioPoint: 1000,
  });
  const current = makeSnapshot({
    methodologyVersion: "v0.8",
    starsPerMetric: {
      leaseUp: null,
      tenancy: null,
      rentPerformance: null,
      marketingDiscipline: null,
      inventoryTransparency: null,
    },
    estimatedPortfolioPoint: 500,
  });
  const types = diffSnapshots(prior, current).map((c) => c.type);
  assert.equal(types.includes("star"), true);
  assert.equal(types.includes("portfolio_size"), true);
});
