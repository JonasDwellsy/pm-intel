import test from "node:test";
import { strict as assert } from "node:assert";
import {
  estimatedManagedUnits,
  usesCommunityUnits,
  DEFAULT_SFR_TURNOVER_MULTIPLIER,
} from "@/lib/operator-size";

test("SFR uses the turnover multiplier on urusT12", () => {
  const n = estimatedManagedUnits(
    { quadrant7Cell: "SFR Independent", urusT12: 51, observedCommunityTotalUnits: 0 },
    3
  );
  assert.equal(n, 153); // 51 * 3
});

test("SFR default multiplier applies when none passed", () => {
  const n = estimatedManagedUnits({
    quadrant7Cell: "SFR Independent",
    urusT12: 100,
    observedCommunityTotalUnits: null,
  });
  assert.equal(n, Math.round(100 * DEFAULT_SFR_TURNOVER_MULTIPLIER));
});

test("MF uses declared community units, NOT the multiplier", () => {
  const n = estimatedManagedUnits(
    { quadrant7Cell: "Large MF/BTR Institutional", urusT12: 6010, observedCommunityTotalUnits: 15593 },
    3
  );
  assert.equal(n, 15593);
});

test("MF with no community data falls back to the turnover method", () => {
  const n = estimatedManagedUnits(
    { quadrant7Cell: "Small MF/BTR Independent", urusT12: 40, observedCommunityTotalUnits: 0 },
    3
  );
  assert.equal(n, 120); // 40 * 3
});

test("Hybrid is treated as a community cohort", () => {
  assert.equal(usesCommunityUnits("Hybrid"), true);
  const n = estimatedManagedUnits(
    { quadrant7Cell: "Hybrid", urusT12: 100, observedCommunityTotalUnits: 500 },
    3
  );
  assert.equal(n, 500);
});

test("no size signal returns null", () => {
  assert.equal(
    estimatedManagedUnits({ quadrant7Cell: "SFR Independent", urusT12: 0, observedCommunityTotalUnits: 0 }, 3),
    null
  );
  assert.equal(
    estimatedManagedUnits({ quadrant7Cell: null, urusT12: null, observedCommunityTotalUnits: null }, 3),
    null
  );
});

test("rounds to a whole unit count", () => {
  const n = estimatedManagedUnits(
    { quadrant7Cell: "SFR Independent", urusT12: 51, observedCommunityTotalUnits: null },
    3.3
  );
  assert.equal(n, 168); // round(51 * 3.3 = 168.3)
});
