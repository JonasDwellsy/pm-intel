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
  // Values are pre-rounded here so the expectation matches what sizeBandFor
  // bands — it rounds for display first (see its doc comment).
  for (const n of [0, 5, 45, 50, 95, 100, 190, 200, 390, 400, 790, 800, 1590, 1600, 15380]) {
    const matches = SIZE_BANDS.filter(
      (b) => n >= b.min && (b.max === null || n < b.max)
    );
    assert.equal(matches.length, 1, `${n} matched ${matches.length} bands`);
    assert.equal(sizeBandFor(n)?.label, matches[0].label);
  }
});

test("boundaries land in the upper band, not the lower one", () => {
  assert.equal(sizeBandLabel(45), "<50");
  assert.equal(sizeBandLabel(50), "50–100");
  assert.equal(sizeBandLabel(190), "100–200");
  assert.equal(sizeBandLabel(200), "200–400");
  assert.equal(sizeBandLabel(1590), "800–1,600");
  assert.equal(sizeBandLabel(1600), "1,600+");
});

test("absent or nonsense input yields null, never a fabricated band", () => {
  assert.equal(sizeBandFor(null), null);
  assert.equal(sizeBandFor(undefined), null);
  assert.equal(sizeBandFor(Number.NaN), null);
  assert.equal(sizeBandFor(-1), null);
  assert.equal(sizeBandLabel(null), null);
});

test("an operator gets one band regardless of which code path supplies the size", () => {
  // Regression: the scorecard card bands the display-rounded estimate while the
  // peer table carries the raw figure. Foundation Property Management (Memphis)
  // is 1,599 raw / 1,600 rounded — printing "800–1,600" in the peer table and
  // "1,600+" on the card of the same page. Rounding inside sizeBandFor makes
  // the band a property of the operator, not of the caller.
  assert.equal(sizeBandLabel(1599), sizeBandLabel(1600));
  assert.equal(sizeBandLabel(1599), "1,600+");
  // Idempotent for callers that already rounded.
  assert.equal(sizeBandLabel(sizeBandFor(1599)!.min), "1,600+");
  // Same story at the sub-100 edge, where the rounding step is 5 not 10.
  assert.equal(sizeBandLabel(48), sizeBandLabel(50));
});

test("real operators from the calibration study land where expected", () => {
  // Ground-truth cases that drove this design.
  assert.equal(sizeBandLabel(790), "400–800"); // Fischer, estimate
  assert.equal(sizeBandLabel(803), "800–1,600"); // IPS Bay Area, estimate
  assert.equal(sizeBandLabel(170), "100–200"); // book median
});
