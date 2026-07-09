import test from "node:test";
import { strict as assert } from "node:assert";
import { selectSnapshotPair, buildListChanges, filterSubscribed, isDigestDue, selectPriorForRecipient, parseCadence } from "./digest-gather";
import type { SnapshotRow, StarsPerMetric } from "./snapshot";

const noStars: StarsPerMetric = {
  leaseUp: null, tenancy: null, rentPerformance: null,
  marketingDiscipline: null, inventoryTransparency: null,
};
function snap(pmSlug: string, date: string, over: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    pmSlug, snapshotDate: new Date(date), methodologyVersion: "v0.6.4",
    starsPerMetric: noStars, starGoldCount: 0, starSilverCount: 0,
    estimatedPortfolioPoint: 100, estimatedPortfolioBand: "Low",
    topMSAs: [], topSubmarkets: [], concessionRate: null, isEligibleForRanking: true,
    quadrant7Cell: null,
    ...over,
  };
}

test("selectSnapshotPair returns the two most recent distinct dates", () => {
  const pair = selectSnapshotPair([
    new Date("2026-04-30"), new Date("2026-06-30"), new Date("2026-05-31"), new Date("2026-06-30"),
  ]);
  assert.deepEqual(pair, { latest: new Date("2026-06-30"), prior: new Date("2026-05-31") });
});

test("selectSnapshotPair returns null with fewer than two distinct dates", () => {
  assert.equal(selectSnapshotPair([new Date("2026-06-30"), new Date("2026-06-30")]), null);
  assert.equal(selectSnapshotPair([]), null);
});

test("buildListChanges diffs both-snapshot operators and drops no-change / half-snapshot ones", () => {
  const latest = new Map<string, SnapshotRow>([
    ["a", snap("a", "2026-06-30", { starGoldCount: 1, starsPerMetric: { ...noStars, tenancy: "gold" } })],
    ["b", snap("b", "2026-06-30")], // unchanged
    ["c", snap("c", "2026-06-30")], // no prior -> skipped
  ]);
  const prior = new Map<string, SnapshotRow>([
    ["a", snap("a", "2026-05-31")],
    ["b", snap("b", "2026-05-31")],
  ]);
  const meta = new Map([
    ["a", { name: "Acme", marketLabel: "Chattanooga", scorecardUrl: "https://x/a" }],
    ["b", { name: "Beta", marketLabel: "Nashville", scorecardUrl: "https://x/b" }],
    ["c", { name: "Gamma", marketLabel: "Memphis", scorecardUrl: "https://x/c" }],
  ]);
  const out = buildListChanges({
    watchListName: "L1", matchedPmSlugs: ["a", "b", "c"],
    latestBySlug: latest, priorBySlug: prior, metaBySlug: meta,
  });
  assert.equal(out.watchListName, "L1");
  assert.equal(out.operators.length, 1);          // only 'a' changed
  assert.equal(out.operators[0].pmSlug, "a");
  assert.ok(out.operators[0].changes.some((c) => c.type === "star"));
});

test("filterSubscribed removes unsubscribed users", () => {
  const out = filterSubscribed(
    [{ userId: "u1", email: "a@x.com" }, { userId: "u2", email: "b@x.com" }],
    new Set(["u2"]),
  );
  assert.deepEqual(out, [{ userId: "u1", email: "a@x.com" }]);
});

const LATEST = new Date("2026-07-31");
function due(over: Partial<Parameters<typeof isDigestDue>[0]> = {}) {
  return isDigestDue({
    unsubscribed: false, cadence: "monthly", latest: LATEST,
    lastNotifiedSnapshotDate: new Date("2026-06-30"),
    lastDigestAt: new Date("2026-06-30"), now: new Date("2026-07-31"), ...over,
  });
}

test("parseCadence accepts the three values, rejects others", () => {
  assert.equal(parseCadence("daily"), "daily");
  assert.equal(parseCadence("weekly"), "weekly");
  assert.equal(parseCadence("monthly"), "monthly");
  assert.equal(parseCadence("yearly"), null);
  assert.equal(parseCadence(3), null);
});

test("isDigestDue false when unsubscribed", () => {
  assert.equal(due({ unsubscribed: true }), false);
});

test("isDigestDue false when no new data (latest <= lastNotified)", () => {
  assert.equal(due({ lastNotifiedSnapshotDate: LATEST }), false);
  assert.equal(due({ lastNotifiedSnapshotDate: new Date("2026-08-31") }), false);
});

test("isDigestDue respects the throttle per cadence", () => {
  assert.equal(due({ cadence: "monthly", lastDigestAt: new Date("2026-07-11"), now: new Date("2026-07-31") }), false);
  assert.equal(due({ cadence: "monthly", lastDigestAt: new Date("2026-07-01"), now: new Date("2026-07-31") }), true);
  assert.equal(due({ cadence: "weekly", lastDigestAt: new Date("2026-07-26"), now: new Date("2026-07-31") }), false);
  assert.equal(due({ cadence: "weekly", lastDigestAt: new Date("2026-07-23"), now: new Date("2026-07-31") }), true);
});

test("isDigestDue: null watermarks => due (first-ever, subscribed, new data present)", () => {
  assert.equal(due({ lastNotifiedSnapshotDate: null, lastDigestAt: null }), true);
});

test("selectPriorForRecipient returns lastNotified when set", () => {
  const prior = selectPriorForRecipient(LATEST, new Date("2026-05-31"),
    [LATEST, new Date("2026-06-30"), new Date("2026-05-31")]);
  assert.deepEqual(prior, new Date("2026-05-31"));
});

test("selectPriorForRecipient falls back to 2nd-most-recent distinct date when lastNotified null", () => {
  const prior = selectPriorForRecipient(LATEST, null,
    [LATEST, new Date("2026-06-30"), new Date("2026-05-31")]);
  assert.deepEqual(prior, new Date("2026-06-30"));
});

test("selectPriorForRecipient returns null when only one distinct date and no lastNotified", () => {
  assert.equal(selectPriorForRecipient(LATEST, null, [LATEST]), null);
});
