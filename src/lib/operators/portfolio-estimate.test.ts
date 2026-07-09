import test from "node:test";
import { strict as assert } from "node:assert";
import { estimatePortfolioSize } from "@/lib/operators/portfolio-estimate";

const COV = { urusT12: 100, monthsOnPlatform: 24 };

test("estimated: house/apt turnover with default multipliers", () => {
  const e = estimatePortfolioSize(COV, { houseUrusT12: 100, aptUrusT12: 0 });
  assert.equal(e.status, "estimated");
  assert.equal(e.point, 330); // 100 × 3.3
});

test("apartment operator recovers MF via k_apt", () => {
  const e = estimatePortfolioSize(
    { urusT12: 3340, monthsOnPlatform: 40 },
    { houseUrusT12: 0, aptUrusT12: 3340 }
  );
  assert.equal(e.point, 8684); // 3340 × 2.6
});

test("mixed operator sums both parts", () => {
  const e = estimatePortfolioSize(COV, { houseUrusT12: 179, aptUrusT12: 151 });
  assert.equal(e.point, Math.round(179 * 3.3 + 151 * 2.6)); // 984
});

test("explicit multipliers are honored", () => {
  const e = estimatePortfolioSize(
    COV,
    { houseUrusT12: 100, aptUrusT12: 100 },
    { kHouse: 2, kApt: 4 }
  );
  assert.equal(e.point, 600);
});

test("no urusT12 → no_listings", () => {
  const e = estimatePortfolioSize({ urusT12: 0, monthsOnPlatform: 24 }, { houseUrusT12: 5, aptUrusT12: 0 });
  assert.equal(e.status, "no_listings");
});

test("< 3 months on platform → insufficient_history", () => {
  const e = estimatePortfolioSize({ urusT12: 40, monthsOnPlatform: 2 }, { houseUrusT12: 40, aptUrusT12: 0 });
  assert.equal(e.status, "insufficient_history");
});

test("has listings but no house/apt split → insufficient_data (no point)", () => {
  const e = estimatePortfolioSize(COV, { houseUrusT12: 0, aptUrusT12: 0 });
  assert.equal(e.status, "insufficient_data");
  assert.equal(e.point ?? null, null);
});
