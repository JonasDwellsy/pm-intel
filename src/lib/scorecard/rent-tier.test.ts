import test from "node:test";
import { strict as assert } from "node:assert";
import { rentTierPosition, latestRent } from "./rent-tier";

const R = (slug: string, rent: number | null) => ({
  pm: { slug },
  rentTrajectory: rent == null ? [] : [{ quarter: "2025Q4", mixAdjMedian: rent, n: 10 }],
});

test("latestRent picks the most recent positive quarter, else null", () => {
  assert.equal(
    latestRent({ pm: { slug: "x" }, rentTrajectory: [
      { quarter: "2025Q1", mixAdjMedian: 1000, n: 1 },
      { quarter: "2025Q3", mixAdjMedian: 1200, n: 1 },
    ] }),
    1200
  );
  assert.equal(latestRent({ pm: { slug: "x" }, rentTrajectory: [] }), null);
});

test("focal at the top of the cohort → 1", () => {
  assert.equal(rentTierPosition(R("f", 3000), [R("a", 1000), R("b", 2000)]), 1);
});

test("focal at the bottom → 0", () => {
  assert.equal(rentTierPosition(R("f", 500), [R("a", 1000), R("b", 2000)]), 0);
});

test("focal in the middle → ~0.5", () => {
  const pos = rentTierPosition(R("f", 1500), [R("a", 1000), R("b", 2000)]);
  assert.ok(pos != null && pos > 0.3 && pos < 0.7);
});

test("no cohort or no focal rent → null", () => {
  assert.equal(rentTierPosition(R("f", 1500), []), null);
  assert.equal(rentTierPosition(R("f", null), [R("a", 1000)]), null);
});

test("focal tied with a cohort rent lands at the tie midpoint, not the lower bound", () => {
  // focal 2000, cohort [1000, 2000, 3000] → below=1, equal=1, n=4 → 1.5/3 = 0.5
  assert.equal(rentTierPosition(R("f", 2000), [R("a", 1000), R("b", 2000), R("c", 3000)]), 0.5);
});

test("latestRent returns null when every quarter is non-positive", () => {
  assert.equal(
    latestRent({ pm: { slug: "x" }, rentTrajectory: [
      { quarter: "2025Q1", mixAdjMedian: 0, n: 1 },
      { quarter: "2025Q2", mixAdjMedian: -5, n: 1 },
    ] }),
    null
  );
});
