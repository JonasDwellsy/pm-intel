import test from "node:test";
import { strict as assert } from "node:assert";
import { momentumDirection } from "./momentum";

test("insufficient when fewer than minPoints non-null values", () => {
  assert.equal(momentumDirection({ values: [null, 10] }), "insufficient"); // 1 real point
});

test("growing when net change exceeds the flat band", () => {
  assert.equal(momentumDirection({ values: [100, 110, 120, 135] }), "growing");
});

test("declining on a clear downtrend", () => {
  assert.equal(momentumDirection({ values: [135, 120, 110, 100] }), "declining");
});

test("stable when net change is within the flat band and low volatility", () => {
  assert.equal(momentumDirection({ values: [100, 101, 99, 100] }), "stable");
});

test("volatile when swings are large even if net change is small", () => {
  assert.equal(momentumDirection({ values: [100, 180, 60, 105] }), "volatile");
});

test("large swings with a strong net direction are growing/declining, not volatile", () => {
  // maxSwing (1.0) exceeds volatilityPct (0.4), but |netChange| (3.0) is >=
  // maxSwing/2, so the volatility guard must NOT win — net direction governs.
  assert.equal(momentumDirection({ values: [100, 200, 300, 400] }), "growing");
  assert.equal(momentumDirection({ values: [400, 300, 200, 100] }), "declining");
});
