import test from "node:test";
import { strict as assert } from "node:assert";
import {
  footprintBounds,
  fitBoundsToCenterZoom,
  projectToPixel,
  thinBackdrop,
  coverageRadius,
  buildStaticImageUrl,
  buildFallbackCircles,
  coverageMapRenderModel,
  MAP_W,
  MAP_H,
} from "./coverage-map-geo";

test("footprintBounds: multi-point bbox", () => {
  const b = footprintBounds([
    { lat: 40, lon: -75 },
    { lat: 41, lon: -74 },
  ]);
  assert.deepEqual(b, { west: -75, south: 40, east: -74, north: 41 });
});

test("footprintBounds: single point is padded to a real box", () => {
  const b = footprintBounds([{ lat: 40, lon: -75 }])!;
  assert.ok(b.east > b.west && b.north > b.south);
  assert.ok(Math.abs(b.east - b.west - 0.02) < 1e-9); // ±0.01 pad
});

test("footprintBounds: empty → null", () => {
  assert.equal(footprintBounds([]), null);
});

test("footprintBounds: undefined/null input → null (no throw)", () => {
  // Guards the never-break invariant: a scorecard blob may omit coverageMapPoints.
  assert.equal(footprintBounds(undefined as unknown as { lat: number; lon: number }[]), null);
  assert.equal(footprintBounds(null as unknown as { lat: number; lon: number }[]), null);
});

test("projectToPixel: center maps to image center", () => {
  const center = { lat: 40, lon: -75 };
  const { x, y } = projectToPixel(center, { center, zoom: 10, width: MAP_W, height: MAP_H });
  assert.ok(Math.abs(x - MAP_W / 2) < 1e-6);
  assert.ok(Math.abs(y - MAP_H / 2) < 1e-6);
});

test("projectToPixel: east is right, north is up", () => {
  const center = { lat: 40, lon: -75 };
  const view = { center, zoom: 10, width: MAP_W, height: MAP_H };
  const east = projectToPixel({ lat: 40, lon: -74.9 }, view);
  const north = projectToPixel({ lat: 40.1, lon: -75 }, view);
  assert.ok(east.x > MAP_W / 2);
  assert.ok(Math.abs(east.y - MAP_H / 2) < 1e-6);
  assert.ok(north.y < MAP_H / 2);
  assert.ok(Math.abs(north.x - MAP_W / 2) < 1e-6);
});

test("fitBoundsToCenterZoom: center is the bbox midpoint (lon) and clamps to maxZoom", () => {
  const bounds = { west: -75.05, east: -74.95, south: 39.98, north: 40.02 };
  const { center, zoom } = fitBoundsToCenterZoom(bounds, {
    width: MAP_W,
    height: MAP_H,
    padding: 40,
    maxZoom: 13,
  });
  assert.ok(Math.abs(center.lon - -75) < 1e-9);
  assert.ok(Math.abs(center.lat - 40) < 0.01);
  assert.ok(zoom <= 13);
});

test("fitBoundsToCenterZoom: a wider bbox yields a lower zoom", () => {
  const opts = { width: MAP_W, height: MAP_H, padding: 40, maxZoom: 22 };
  const narrow = fitBoundsToCenterZoom(
    { west: -75.02, east: -74.98, south: 39.99, north: 40.01 },
    opts
  ).zoom;
  const wide = fitBoundsToCenterZoom(
    { west: -75.5, east: -74.5, south: 39.5, north: 40.5 },
    opts
  ).zoom;
  assert.ok(wide < narrow);
});

test("fitBoundsToCenterZoom: degenerate zero-span bounds → maxZoom clamp, center preserved", () => {
  const { center, zoom } = fitBoundsToCenterZoom(
    { west: -75, east: -75, south: 40, north: 40 },
    { width: MAP_W, height: MAP_H, padding: 40, maxZoom: 13 }
  );
  assert.equal(zoom, 13);
  assert.ok(Math.abs(center.lon - -75) < 1e-9);
  assert.ok(Math.abs(center.lat - 40) < 0.01);
});

test("thinBackdrop: within cap is unchanged; over cap strides down to ≤ max", () => {
  const three = [1, 2, 3];
  assert.deepEqual(thinBackdrop(three, 5), three);
  const ten = Array.from({ length: 10 }, (_, i) => i);
  const thinned = thinBackdrop(ten, 5);
  assert.ok(thinned.length <= 5);
  assert.equal(thinned[0], 0); // deterministic stride, keeps index 0
});

test("coverageRadius: clamps and interpolates 1→5, 100→14", () => {
  assert.equal(coverageRadius(1), 5);
  assert.equal(coverageRadius(100), 14);
  assert.equal(coverageRadius(0), 5); // clamp low
  assert.equal(coverageRadius(500), 14); // clamp high
  assert.ok(Math.abs(coverageRadius(50.5) - 9.5) < 0.1); // ~midpoint
});

test("buildStaticImageUrl: correct shape, @2x, no logo/attribution, token in query", () => {
  const url = buildStaticImageUrl({
    center: { lat: 40, lon: -75 },
    zoom: 11.5,
    width: MAP_W,
    height: MAP_H,
    style: "light-v11",
    token: "TESTTOKEN",
  });
  assert.ok(url.includes("/styles/v1/mapbox/light-v11/static/-75.00000,40.00000,11.50/1000x500@2x"));
  assert.ok(url.includes("access_token=TESTTOKEN"));
  assert.ok(url.includes("logo=false"));
  assert.ok(url.includes("attribution=false"));
});

test("buildFallbackCircles: projects into the box; north above south; no bounds → null", () => {
  const geo = {
    coverageMapPoints: [
      { lat: 40.02, lon: -75, n: 1 },
      { lat: 39.98, lon: -75, n: 50 },
    ],
    msaBackdropPoints: [{ lat: 40, lon: -75 }],
    mapBounds: undefined,
  };
  const fb = buildFallbackCircles(geo, { width: MAP_W, height: MAP_H, padding: 40, maxBackdrop: 600 })!;
  assert.equal(fb.coverage.length, 2);
  for (const c of fb.coverage) {
    assert.ok(c.x >= 0 && c.x <= MAP_W && c.y >= 0 && c.y <= MAP_H);
  }
  // northern point (40.02) has a smaller y than the southern (39.98)
  assert.ok(fb.coverage[0].y < fb.coverage[1].y);
  assert.equal(
    buildFallbackCircles(
      { coverageMapPoints: [], msaBackdropPoints: [], mapBounds: undefined },
      { width: MAP_W, height: MAP_H, padding: 40, maxBackdrop: 600 }
    ),
    null
  );
});

test("buildFallbackCircles: missing coverageMapPoints but mapBounds present → no throw", () => {
  const geo = {
    coverageMapPoints: undefined as unknown as { lat: number; lon: number; n: number }[],
    msaBackdropPoints: undefined,
    mapBounds: { north: 40.1, south: 39.9, east: -74.9, west: -75.1 },
  };
  const fb = buildFallbackCircles(geo, { width: MAP_W, height: MAP_H, padding: 40, maxBackdrop: 600 });
  assert.ok(fb);
  assert.deepEqual(fb!.coverage, []);
  assert.deepEqual(fb!.backdrop, []);
});

test("coverageMapRenderModel: basemap when image present, fallback when null, empty when null+no bounds", () => {
  const geo = {
    coverageMapPoints: [{ lat: 40, lon: -75, n: 3 }],
    msaBackdropPoints: [],
    mapBounds: undefined,
  };
  const withImage = coverageMapRenderModel(
    { dataUrl: "data:image/png;base64,AAAA", coveragePx: [{ x: 1, y: 2, n: 3 }], backdropPx: [] },
    geo
  );
  assert.equal(withImage.mode, "basemap");
  assert.equal(withImage.mode === "basemap" && withImage.imageSrc, "data:image/png;base64,AAAA");

  const fallback = coverageMapRenderModel(null, geo);
  assert.equal(fallback.mode, "fallback");

  const empty = coverageMapRenderModel(null, {
    coverageMapPoints: [],
    msaBackdropPoints: [],
    mapBounds: undefined,
  });
  assert.equal(empty.mode, "empty");
});
