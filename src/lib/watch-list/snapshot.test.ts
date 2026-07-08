import test from "node:test";
import { strict as assert } from "node:assert";
import { toSnapshotRow, type RawSnapshotRow } from "./snapshot";

function raw(overrides: Partial<RawSnapshotRow> = {}): RawSnapshotRow {
  return {
    pmSlug: "acme-chattanooga-tn",
    snapshotDate: new Date("2026-06-30"),
    methodologyVersion: "v0.6.4",
    starsPerMetric: JSON.stringify({ leaseUp: "gold", tenancy: "silver" }),
    starGoldCount: 1,
    starSilverCount: 1,
    estimatedPortfolioPoint: 120,
    estimatedPortfolioBand: "Medium",
    topMSAs: JSON.stringify(["chattanooga-tn"]),
    topSubmarkets: JSON.stringify(["downtown"]),
    concessionRate: 0.1,
    isEligibleForRanking: true,
    ...overrides,
  };
}

test("toSnapshotRow parses JSON columns and preserves scalars", () => {
  const r = toSnapshotRow(raw());
  assert.equal(r.pmSlug, "acme-chattanooga-tn");
  assert.deepEqual(r.starsPerMetric, {
    leaseUp: "gold", tenancy: "silver",
    rentPerformance: null, marketingDiscipline: null, inventoryTransparency: null,
  });
  assert.deepEqual(r.topMSAs, ["chattanooga-tn"]);
  assert.deepEqual(r.topSubmarkets, ["downtown"]);
  assert.equal(r.estimatedPortfolioPoint, 120);
  assert.equal(r.isEligibleForRanking, true);
});

test("toSnapshotRow tolerates malformed JSON columns", () => {
  const r = toSnapshotRow(raw({ starsPerMetric: "not json", topMSAs: "{", topSubmarkets: "" }));
  assert.deepEqual(r.starsPerMetric, {
    leaseUp: null, tenancy: null, rentPerformance: null,
    marketingDiscipline: null, inventoryTransparency: null,
  });
  assert.deepEqual(r.topMSAs, []);
  assert.deepEqual(r.topSubmarkets, []);
});
