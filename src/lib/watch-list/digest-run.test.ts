import test from "node:test";
import { strict as assert } from "node:assert";
import { selectSnapshotPair, buildListChanges, filterSubscribed } from "./digest-run";
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
