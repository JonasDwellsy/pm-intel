// Albers Equal Area Conic projection of the contiguous US.
//
// PR #48 hand-rolled the coverage map after react-simple-maps
// turned out to be incompatible with React 19. This module owns
// the projection math so the JSON data file can stay
// projection-agnostic (lat/lng only) and the SVG outline + marker
// dots both render through the same transform.
//
// The Albers USA conic projection uses two standard parallels at
// 29.5°N and 45.5°N — the same configuration d3-geo's
// geoAlbersUsa() ships with. Output is a unit-radius pair that
// we then scale + translate into the chart's viewBox.
//
// Reference: Snyder, "Map Projections — A Working Manual" (USGS
// Professional Paper 1395), Section 14 (Albers Equal-Area Conic).

/** Output viewBox is 960×600 (a 16:10 frame that maps cleanly to
 *  the page layout). Coordinates returned by project() are in
 *  this coordinate space. */
export const MAP_VIEWBOX = { width: 960, height: 600 } as const;

// ─── Projection parameters ───────────────────────────────────────

const REF_LAT_DEG = 37.5; // origin latitude — geographic center of the lower 48
const REF_LNG_DEG = -96; // central meridian
const STD_PARALLEL_1_DEG = 29.5;
const STD_PARALLEL_2_DEG = 45.5;

const deg2rad = (d: number) => (d * Math.PI) / 180;

const phi0 = deg2rad(REF_LAT_DEG);
const phi1 = deg2rad(STD_PARALLEL_1_DEG);
const phi2 = deg2rad(STD_PARALLEL_2_DEG);

// Cone constant n + auxiliary C term. Both derive from the two
// standard parallels and stay fixed for the projection.
const n = 0.5 * (Math.sin(phi1) + Math.sin(phi2));
const C = Math.cos(phi1) ** 2 + 2 * n * Math.sin(phi1);
const rho0 = Math.sqrt(C - 2 * n * Math.sin(phi0)) / n;

/** Scale + translate so the contiguous US fills the viewBox with
 *  sensible margins. Picked by visually fitting the corner cities
 *  (Seattle / Boston / Miami / San Diego) into the frame. */
const SCALE = 1300;
const TRANSLATE_X = MAP_VIEWBOX.width / 2;
const TRANSLATE_Y = MAP_VIEWBOX.height / 2 + 30; // bias slightly down so AK/HI omission doesn't leave dead space

/** Project a lat/lng pair into the chart's SVG coordinate space. */
export function project(lat: number, lng: number): [number, number] {
  const phi = deg2rad(lat);
  const theta = n * deg2rad(lng - REF_LNG_DEG);
  const rho = Math.sqrt(C - 2 * n * Math.sin(phi)) / n;
  const xUnit = rho * Math.sin(theta);
  const yUnit = rho0 - rho * Math.cos(theta);
  return [TRANSLATE_X + xUnit * SCALE, TRANSLATE_Y + yUnit * SCALE];
}
