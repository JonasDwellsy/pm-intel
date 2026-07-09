import test from "node:test";
import { strict as assert } from "node:assert";
import {
  estimatedManagedUnits,
  estimatedManagedUnitsBand,
  DEFAULT_K_HOUSE,
  DEFAULT_K_APT,
} from "@/lib/operator-size";

test("house + apartment units each get their own turnover multiplier", () => {
  const n = estimatedManagedUnits(
    { houseUrusT12: 100, aptUrusT12: 50 },
    { kHouse: 3.3, kApt: 2.6 }
  );
  assert.equal(n, Math.round(100 * 3.3 + 50 * 2.6)); // 330 + 130 = 460
});

test("defaults apply when no multipliers passed", () => {
  const n = estimatedManagedUnits({ houseUrusT12: 100, aptUrusT12: 0 });
  assert.equal(n, Math.round(100 * DEFAULT_K_HOUSE));
  const a = estimatedManagedUnits({ houseUrusT12: 0, aptUrusT12: 100 });
  assert.equal(a, Math.round(100 * DEFAULT_K_APT));
});

test("pure apartment operator ≈ declared building count (recovers MF safely)", () => {
  // Equity Seattle: 3340 apt URUs × 2.6 ≈ 8684 (declared 8653).
  const n = estimatedManagedUnits(
    { houseUrusT12: 0, aptUrusT12: 3340 },
    { kHouse: 3.3, kApt: 2.6 }
  );
  assert.equal(n, 8684);
});

test("pure scattered-SFR operator uses the house multiplier", () => {
  const n = estimatedManagedUnits(
    { houseUrusT12: 1089, aptUrusT12: 0 },
    { kHouse: 3.3, kApt: 2.6 }
  );
  assert.equal(n, Math.round(1089 * 3.3)); // 3594
});

test("mixed operator sums both parts (Fox Boulder shape)", () => {
  const n = estimatedManagedUnits(
    { houseUrusT12: 179, aptUrusT12: 151 },
    { kHouse: 3.3, kApt: 2.6 }
  );
  assert.equal(n, Math.round(179 * 3.3 + 151 * 2.6)); // 591 + 393 = 984
});

test("no observed units returns null", () => {
  assert.equal(estimatedManagedUnits({ houseUrusT12: 0, aptUrusT12: 0 }), null);
  assert.equal(estimatedManagedUnits({ houseUrusT12: null, aptUrusT12: null }), null);
});

test("turnover band brackets the point, type-aware", () => {
  // Hawk-Eyed shape: 0 houses / 74 apt. point = 74×2.6 = 192.
  const band = estimatedManagedUnitsBand({ houseUrusT12: 0, aptUrusT12: 74 });
  assert.deepEqual(band, { low: Math.round(74 * 2.0), high: Math.round(74 * 3.3) }); // 148 / 244
  const point = estimatedManagedUnits({ houseUrusT12: 0, aptUrusT12: 74 })!;
  assert.ok(band!.low <= point && point <= band!.high); // 148 ≤ 192 ≤ 244
});

test("house-heavy operator's band uses house turnover range", () => {
  const band = estimatedManagedUnitsBand({ houseUrusT12: 100, aptUrusT12: 0 });
  assert.deepEqual(band, { low: 250, high: 420 }); // 100×2.5 / 100×4.2
});

test("band is null when there is no observed-unit signal", () => {
  assert.equal(estimatedManagedUnitsBand({ houseUrusT12: 0, aptUrusT12: 0 }), null);
  assert.equal(estimatedManagedUnitsBand({ houseUrusT12: null, aptUrusT12: null }), null);
});

test("tuning the multipliers scales the estimate", () => {
  const base = estimatedManagedUnits({ houseUrusT12: 100, aptUrusT12: 100 }, { kHouse: 3, kApt: 3 });
  assert.equal(base, 600);
  const tuned = estimatedManagedUnits({ houseUrusT12: 100, aptUrusT12: 100 }, { kHouse: 4, kApt: 2 });
  assert.equal(tuned, 600); // 400 + 200
  const up = estimatedManagedUnits({ houseUrusT12: 100, aptUrusT12: 0 }, { kHouse: 5, kApt: 2.6 });
  assert.equal(up, 500);
});
