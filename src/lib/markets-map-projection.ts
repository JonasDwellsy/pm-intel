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

/** Project a lat/lng pair into the chart's SVG coordinate space.
 *  Returns null when the input falls outside d3's recognized
 *  globe — the consumer should skip rendering that point. */
export function project(lat: number, lng: number): [number, number] | null {
  // GeoJSON convention: coordinates are [longitude, latitude].
  return PROJECTION([lng, lat]);
}

/** Same projection as project() but in the GeoJSON-native
 *  [lng, lat] order so the geometry walker in MarketsCoverageMap
 *  can pass coordinates straight from the feature collection
 *  without reordering. Identical math; separate name keeps the
 *  call sites self-documenting. */
export function projectLngLat(lng: number, lat: number): [number, number] | null {
  return PROJECTION([lng, lat]);
}
