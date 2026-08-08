// Albers USA projection of the contiguous US + AK / HI composite
// insets. Thin wrapper around d3-geo's geoAlbersUsa() so we get
// the canonical inset placement for Alaska and Hawaii (and Puerto
// Rico, via the projection's built-in composition) without
// hand-rolling the rotation / scale / offset math.
//
// d3-geo's projection returns SVG-ready coordinates (origin
// top-left, +y pointing down) — no y-axis inversion needed at the
// call site. The earlier hand-rolled version of this module was a
// plain Albers Conic that only handled the CONUS; switching to
// geoAlbersUsa lets the map render every state + DC + PR without
// us filtering off-globe features in the consumer.

import { geoAlbersUsa } from "d3-geo";

import type { GeoProjection } from "d3-geo";

/** Output viewBox is 960×600 (a 16:10 frame that maps cleanly to
 *  the page layout). Coordinates returned by project() are in
 *  this coordinate space. */
export const MAP_VIEWBOX = { width: 960, height: 600 } as const;

// d3-geo's geoAlbersUsa defaults are calibrated for a 960×500
// frame at scale 1070 + translate [480, 250]. We target 960×600,
// so the scale is bumped about 10% (1180) and the translate
// shifts down to give Miami / Tampa room without crowding the
// 600px bottom edge. The AK + HI insets stay safely inside the
// viewBox at y ≈ 500–530.
//
// Spot checks at this calibration:
//   Phoenix   → roughly ( 215, 370 )  ← SW quadrant
//   Seattle   → roughly ( 130,  60 )  ← NW
//   Miami     → roughly ( 785, 525 )  ← SE
//   Anchorage → roughly ( 140, 500 )  ← lower-left inset
//   Honolulu  → roughly ( 280, 505 )  ← lower-left inset, right of AK
// If Phoenix lands in the NW (low y instead of high y), the
// y-axis has been re-inverted somewhere downstream.
const PROJECTION: GeoProjection = geoAlbersUsa()
  .scale(1180)
  .translate([MAP_VIEWBOX.width / 2, 285]);

// SVG-space precision, and it is load-bearing for correctness, not tidiness.
//
// geoAlbersUsa runs trigonometry, and V8's Math results are not guaranteed
// bit-identical between the Node build that server-renders and the browser
// build that hydrates. In practice they diverged around the 13th decimal —
// e.g. cy 126.47276197905114 on the server vs 126.4727619790516 on the client —
// which React reports as a hydration mismatch it "won't patch up", on every
// marker of the homepage map.
//
// Rounding here makes both sides emit the same string. Two decimals is 1/100th
// of a unit in a 960x600 viewBox: far below one device pixel at any size this
// map is rendered, so nothing moves visually.
//
// Rounding at the projection rather than at each call site is deliberate —
// markers, state geometry, and both consuming pages all flow through these two
// functions, so there is one place to be right and no way for a new caller to
// reintroduce the mismatch.
const SVG_DP = 2;
const SVG_FACTOR = 10 ** SVG_DP;

/** Round one SVG-space scalar to the shared precision. Exported because
 *  anything that DERIVES new coordinates after projection — the marker
 *  de-overlap pass, for one — has to land on the same grid, or it puts
 *  full-precision floats back into the markup that project() just removed. */
export function snapToSvgPrecision(n: number): number {
  return Math.round(n * SVG_FACTOR) / SVG_FACTOR;
}

function snap(point: [number, number] | null): [number, number] | null {
  if (!point) return null;
  return [snapToSvgPrecision(point[0]), snapToSvgPrecision(point[1])];
}

/** Project a lat/lng pair into the chart's SVG coordinate space.
 *  Returns null when the input falls outside d3's recognized
 *  globe — the consumer should skip rendering that point.
 *  Output is rounded so server and client agree exactly (see SVG_DP). */
export function project(lat: number, lng: number): [number, number] | null {
  // GeoJSON convention: coordinates are [longitude, latitude].
  return snap(PROJECTION([lng, lat]));
}

/** Same projection as project() but in the GeoJSON-native
 *  [lng, lat] order so the geometry walker in MarketsCoverageMap
 *  can pass coordinates straight from the feature collection
 *  without reordering. Identical math; separate name keeps the
 *  call sites self-documenting. */
export function projectLngLat(lng: number, lat: number): [number, number] | null {
  return snap(PROJECTION([lng, lat]));
}
