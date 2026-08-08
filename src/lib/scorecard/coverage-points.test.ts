import test from "node:test";
import { strict as assert } from "node:assert";
import { readCoveragePoint, readCoveragePoints } from "./coverage-points";

test("decodes the compact tuple form", () => {
  assert.deepEqual(readCoveragePoint([34.9339, -85.2861, 1]), {
    lat: 34.9339,
    lon: -85.2861,
    n: 1,
  });
  // n carries a real count when points were coalesced.
  assert.deepEqual(readCoveragePoint([40.1, -75.2, 7]), { lat: 40.1, lon: -75.2, n: 7 });
});

test("still decodes the legacy object form", () => {
  // Load-bearing: seeded scorecardData blobs hold objects until the next
  // reseed. A tuple-only reader would blank every coverage map in the window
  // between deploy and reseed.
  assert.deepEqual(readCoveragePoint({ lat: 34.9339, lon: -85.2861, n: 1, city: "Rossville" }), {
    lat: 34.9339,
    lon: -85.2861,
    n: 1,
  });
});

test("a legacy point with no n counts as one unit", () => {
  assert.deepEqual(readCoveragePoint({ lat: 1, lon: 2 }), { lat: 1, lon: 2, n: 1 });
  assert.deepEqual(readCoveragePoint([1, 2] as unknown as [number, number, number]), {
    lat: 1,
    lon: 2,
    n: 1,
  });
});

test("malformed points decode to null rather than (0, 0)", () => {
  // (0, 0) is in the Gulf of Guinea. On a map auto-fitted to its own points,
  // one bad row there drags the viewport across the Atlantic and looks like
  // real data — far worse than a missing dot.
  assert.equal(readCoveragePoint(null), null);
  assert.equal(readCoveragePoint(undefined), null);
  assert.equal(readCoveragePoint([] as unknown as [number, number, number]), null);
  assert.equal(readCoveragePoint({ lat: 1 } as never), null);
  assert.equal(readCoveragePoint({ lon: 2 } as never), null);
  assert.equal(readCoveragePoint([Number.NaN, -85, 1]), null);
  assert.equal(readCoveragePoint({ lat: 34.9, lon: Number.NaN } as never), null);
});

test("readCoveragePoints drops bad rows and keeps the rest, in order", () => {
  const out = readCoveragePoints([
    [1, 2, 1],
    null as never,
    { lat: 3, lon: 4, n: 2 },
    { lat: 5 } as never,
    [6, 7, 3],
  ]);
  assert.deepEqual(out, [
    { lat: 1, lon: 2, n: 1 },
    { lat: 3, lon: 4, n: 2 },
    { lat: 6, lon: 7, n: 3 },
  ]);
});

test("absent input is an empty list, never a throw", () => {
  assert.deepEqual(readCoveragePoints(null), []);
  assert.deepEqual(readCoveragePoints(undefined), []);
  assert.deepEqual(readCoveragePoints([]), []);
});

test("both encodings of the same point decode identically", () => {
  // The invariant the seed re-encode relied on: switching wire format must not
  // move a single dot.
  const tuple = readCoveragePoint([34.9339, -85.2861, 1]);
  const object = readCoveragePoint({ lat: 34.9339, lon: -85.2861, n: 1, city: "Rossville" });
  assert.deepEqual(tuple, object);
});
