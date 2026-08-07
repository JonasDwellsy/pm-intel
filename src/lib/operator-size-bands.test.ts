import test from "node:test";
import { strict as assert } from "node:assert";
import {
  SIZE_BANDS,
  sizeBandFor,
  sizeBandLabel,
} from "./operator-size-bands";

test("bands are contiguous and non-overlapping", () => {
  // The whole point of these edges is unambiguous membership — an operator must
  // land in exactly one band, or sorting and watch-list filters break.
  for (let i = 0; i < SIZE_BANDS.length - 1; i++) {
    assert.equal(
      SIZE_BANDS[i].max,
      SIZE_BANDS[i + 1].min,
      `gap or overlap between ${SIZE_BANDS[i].label} and ${SIZE_BANDS[i + 1].label}`
    );
  }
  assert.equal(SIZE_BANDS[0].min, 0, "lowest band must start at 0");
  assert.equal(SIZE_BANDS[SIZE_BANDS.length - 1].max, null, "top band must be open-ended");
});

test("every non-negative size maps to exactly one band", () => {
  for (const n of [0, 1, 49, 50, 99, 100, 199, 200, 399, 400, 799, 800, 1599, 1600, 15376]) {
    const matches = SIZE_BANDS.filter(
      (b) => n >= b.min && (b.max === null || n < b.max)
    );
    assert.equal(matches.length, 1, `${n} matched ${matches.length} bands`);
    assert.equal(sizeBandFor(n)?.label, matches[0].label);
  }
});

test("boundaries land in the upper band, not the lower one", () => {
  assert.equal(sizeBandLabel(49), "<50");
  assert.equal(sizeBandLabel(50), "50–100");
  assert.equal(sizeBandLabel(199), "100–200");
  assert.equal(sizeBandLabel(200), "200–400");
  assert.equal(sizeBandLabel(1599), "800–1,600");
  assert.equal(sizeBandLabel(1600), "1,600+");
});

test("absent or nonsense input yields null, never a fabricated band", () => {
  assert.equal(sizeBandFor(null), null);
  assert.equal(sizeBandFor(undefined), null);
  assert.equal(sizeBandFor(Number.NaN), null);
  assert.equal(sizeBandFor(-1), null);
  assert.equal(sizeBandLabel(null), null);
});

test("real operators from the calibration study land where expected", () => {
  // Ground-truth cases that drove this design.
  assert.equal(sizeBandLabel(790), "400–800"); // Fischer, estimate
  assert.equal(sizeBandLabel(803), "800–1,600"); // IPS Bay Area, estimate
  assert.equal(sizeBandLabel(170), "100–200"); // book median
});
