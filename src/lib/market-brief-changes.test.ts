import test from "node:test";
import { strict as assert } from "node:assert";
import { buildMarketChangeSummary } from "./market-brief-changes";
import type { SnapshotRow } from "./watch-list/snapshot";

const D_PRIOR = new Date("2026-06-01");
const D_CUR = new Date("2026-07-01");

function snap(
  pmSlug: string,
  date: Date,
  o: Partial<SnapshotRow> = {},
): SnapshotRow {
  return {
    pmSlug,
    snapshotDate: date,
    methodologyVersion: "v0.6.4",
    starsPerMetric: {
      leaseUp: null, tenancy: null, rentPerformance: null,
      marketingDiscipline: null, inventoryTransparency: null,
    },
    starGoldCount: 0,
    starSilverCount: 0,
    estimatedPortfolioPoint: null,
    estimatedPortfolioBand: null,
    topMSAs: [],
    topSubmarkets: [],
    concessionRate: null,
    isEligibleForRanking: true,
    quadrant7Cell: null,
    operatorStatus: "active" as const,
    lastListingDate: null,
    ...o,
  };
}
const names = new Map([
  ["acme", { name: "Acme PM", scorecardUrl: "/u/acme" }],
  ["beta", { name: "Beta Homes", scorecardUrl: "/u/beta" }],
]);

test("no prior snapshot → null (first period, no change block)", () => {
  assert.equal(buildMarketChangeSummary([], [snap("acme", D_CUR)], names), null);
});

test("new entrant = became eligible this period", () => {
  const prior = [snap("acme", D_PRIOR, { isEligibleForRanking: false })];
  const cur = [snap("acme", D_CUR, { isEligibleForRanking: true })];
  const s = buildMarketChangeSummary(prior, cur, names)!;
  assert.deepEqual(s.newEntrants, [{ pmSlug: "acme", name: "Acme PM", scorecardUrl: "/u/acme" }]);
  assert.equal(s.isQuiet, false);
});

test("rating up and down split by gold-count direction", () => {
  const prior = [snap("acme", D_PRIOR, { starGoldCount: 1 }), snap("beta", D_PRIOR, { starGoldCount: 3 })];
  const cur = [snap("acme", D_CUR, { starGoldCount: 3 }), snap("beta", D_CUR, { starGoldCount: 1 })];
  const s = buildMarketChangeSummary(prior, cur, names)!;
  assert.equal(s.ratingUp[0].pmSlug, "acme");
  assert.equal(s.ratingUp[0].goldAfter, 3);
  assert.equal(s.ratingDown[0].pmSlug, "beta");
});

test("size swing surfaces only at ≥20% point move", () => {
  const prior = [snap("acme", D_PRIOR, { estimatedPortfolioPoint: 100 }), snap("beta", D_PRIOR, { estimatedPortfolioPoint: 100 })];
  const cur = [snap("acme", D_CUR, { estimatedPortfolioPoint: 130 }), snap("beta", D_CUR, { estimatedPortfolioPoint: 110 })];
  const s = buildMarketChangeSummary(prior, cur, names)!;
  assert.equal(s.sizeSwings.length, 1); // beta's +10% is below threshold
  assert.equal(s.sizeSwings[0].pmSlug, "acme");
  assert.ok(Math.abs(s.sizeSwings[0].pctChange - 0.3) < 1e-9);
});

test("cohort move needs both snapshots to carry quadrant7Cell", () => {
  const withCell = buildMarketChangeSummary(
    [snap("acme", D_PRIOR, { quadrant7Cell: "Hybrid" })],
    [snap("acme", D_CUR, { quadrant7Cell: "Small MF/BTR Independent" })],
    names,
  )!;
  assert.deepEqual(withCell.cohortMoves, [
    { pmSlug: "acme", name: "Acme PM", scorecardUrl: "/u/acme", before: "Hybrid", after: "Small MF/BTR Independent" },
  ]);
  // Prior lacks the field (older row) → no cohort move detected.
  const priorNull = buildMarketChangeSummary(
    [snap("acme", D_PRIOR, { quadrant7Cell: null })],
    [snap("acme", D_CUR, { quadrant7Cell: "Small MF/BTR Independent" })],
    names,
  )!;
  assert.equal(priorNull.cohortMoves.length, 0);
});

test("ineligible-current operators are excluded from rating/size/cohort", () => {
  const prior = [snap("acme", D_PRIOR, { starGoldCount: 1, isEligibleForRanking: true })];
  const cur = [snap("acme", D_CUR, { starGoldCount: 4, isEligibleForRanking: false })];
  const s = buildMarketChangeSummary(prior, cur, names)!;
  assert.equal(s.ratingUp.length, 0);
  assert.equal(s.isQuiet, true);
});

test("isQuiet when nothing surfaced", () => {
  const s = buildMarketChangeSummary(
    [snap("acme", D_PRIOR, { starGoldCount: 2, estimatedPortfolioPoint: 100 })],
    [snap("acme", D_CUR, { starGoldCount: 2, estimatedPortfolioPoint: 105 })],
    names,
  )!;
  assert.equal(s.isQuiet, true);
});

test("methodology-version change suppresses re-derived moves (stars/size/cohort)", () => {
  // Same operator, but the two snapshots were computed under DIFFERENT
  // methodology versions — so gold-count, portfolio point, and cohort all move
  // as re-derivation artifacts, not behaviour. All three must be suppressed so
  // a methodology refresh doesn't fire a spurious market-wide wave.
  const prior = [
    snap("acme", D_PRIOR, {
      methodologyVersion: "v0.6.4",
      starGoldCount: 1,
      estimatedPortfolioPoint: 100,
      quadrant7Cell: "Hybrid",
    }),
  ];
  const cur = [
    snap("acme", D_CUR, {
      methodologyVersion: "v0.7",
      starGoldCount: 4,
      estimatedPortfolioPoint: 200,
      quadrant7Cell: "Small MF/BTR Independent",
    }),
  ];
  const s = buildMarketChangeSummary(prior, cur, names)!;
  assert.equal(s.ratingUp.length, 0);
  assert.equal(s.ratingDown.length, 0);
  assert.equal(s.sizeSwings.length, 0);
  assert.equal(s.cohortMoves.length, 0);
  assert.equal(s.isQuiet, true);
});

test("new entrant still counts across a methodology-version change", () => {
  // Behavioural signals (an operator becoming eligible) are NOT re-derivation
  // artifacts, so they still fire across a methodology boundary.
  const prior = [
    snap("acme", D_PRIOR, { methodologyVersion: "v0.6.4", isEligibleForRanking: false }),
  ];
  const cur = [
    snap("acme", D_CUR, { methodologyVersion: "v0.7", isEligibleForRanking: true }),
  ];
  const s = buildMarketChangeSummary(prior, cur, names)!;
  assert.equal(s.newEntrants.length, 1);
  assert.equal(s.newEntrants[0].pmSlug, "acme");
});
