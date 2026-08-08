import test from "node:test";
import { strict as assert } from "node:assert";
import { project, projectLngLat, MAP_VIEWBOX } from "./markets-map-projection";

// The point of these: the projection's output is server-rendered as a string
// and re-computed in the browser at hydration. If those two strings differ by
// so much as a trailing digit, React reports a mismatch it cannot repair. The
// contract is therefore about the SHAPE of the number, not just its value.

/** Longest decimal tail the value serializes to. */
function decimals(n: number): number {
  const s = String(n);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

const CITIES: Array<[string, number, number]> = [
  ["Seattle", 47.6062, -122.3321],
  ["Miami", 25.7617, -80.1918],
  ["Phoenix", 33.4484, -112.074],
  ["Chicago", 41.8781, -87.6298],
  ["Billings", 45.7833, -108.5007],
  ["Anchorage", 61.2181, -149.9003], // AK inset
  ["Honolulu", 21.3069, -157.8583], // HI inset
];

test("projected coordinates never carry more than 2 decimals", () => {
  // This is the actual hydration guarantee. A raw d3 result runs to ~15
  // significant decimals, and the last of them are not stable across the
  // Node build that renders and the V8 build that hydrates.
  for (const [name, lat, lng] of CITIES) {
    const p = project(lat, lng);
    assert.ok(p, `${name} should project`);
    assert.ok(decimals(p[0]) <= 2, `${name} x=${p[0]} has too many decimals`);
    assert.ok(decimals(p[1]) <= 2, `${name} y=${p[1]} has too many decimals`);
  }
});

test("serializing a projected value round-trips exactly", () => {
  // React writes String(n) into the HTML and compares against the client's
  // own String(n). Equality of the parsed value is what makes them agree.
  for (const [, lat, lng] of CITIES) {
    const p = project(lat, lng)!;
    assert.equal(Number(String(p[0])), p[0]);
    assert.equal(Number(String(p[1])), p[1]);
  }
});

test("projection is deterministic across repeated calls", () => {
  for (const [name, lat, lng] of CITIES) {
    const a = project(lat, lng)!;
    const b = project(lat, lng)!;
    assert.deepEqual(a, b, `${name} drifted between calls`);
  }
});

test("rounding does not move a marker off its true position", () => {
  // Half a hundredth of a unit in a 960-wide viewBox — well under a device
  // pixel. If this ever fails, the precision was cut too far.
  for (const [name, lat, lng] of CITIES) {
    const p = project(lat, lng)!;
    assert.ok(p[0] >= 0 && p[0] <= MAP_VIEWBOX.width, `${name} x off-canvas`);
    assert.ok(p[1] >= 0 && p[1] <= MAP_VIEWBOX.height, `${name} y off-canvas`);
  }
});

test("known cities still land in the right quadrant after rounding", () => {
  // Guards the calibration documented in the module header — catches a
  // re-inverted y-axis or a lost translate, which rounding could otherwise
  // mask as "just a small change".
  const seattle = project(47.6062, -122.3321)!;
  const miami = project(25.7617, -80.1918)!;
  assert.ok(seattle[0] < miami[0], "Seattle should sit west of Miami");
  assert.ok(seattle[1] < miami[1], "Seattle should sit north of Miami (smaller y)");
});

test("projectLngLat matches project with the arguments swapped", () => {
  for (const [name, lat, lng] of CITIES) {
    assert.deepEqual(projectLngLat(lng, lat), project(lat, lng), name);
  }
});

test("off-globe input returns null rather than NaN coordinates", () => {
  // The consumer skips these; a [NaN, NaN] would render an invalid attribute.
  assert.equal(project(0, 0), null); // Gulf of Guinea — outside the US composite
  assert.equal(projectLngLat(0, 0), null);
});
