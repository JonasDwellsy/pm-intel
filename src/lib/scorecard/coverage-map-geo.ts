// Pure, isomorphic geometry + render-model helpers for the scorecard coverage
// map. No Node or network imports — usable from the server PDF fetch wrapper
// (pdf-coverage-map.ts), the react-pdf render (OperatorProfilePDF.tsx), and the
// client web map (CoverageMapClient.tsx). All Web-Mercator math uses tileSize
// 512 (Mapbox GL convention) so PDF framing matches the web map's zoom levels.

export type LatLon = { lat: number; lon: number };
export type Bounds = { west: number; south: number; east: number; north: number };
export type Pixel = { x: number; y: number };
export type PixelN = { x: number; y: number; n: number };

export type CoverageRenderModel =
  | { mode: "basemap"; imageSrc: string; coverage: PixelN[]; backdrop: Pixel[] }
  | { mode: "fallback"; coverage: PixelN[]; backdrop: Pixel[] }
  | { mode: "empty" };

// Minimal structural shape of ScorecardData["geographicCoverage"] this module
// needs — kept local so the module has no app-type dependency.
type GeoInput = {
  coverageMapPoints: Array<{ lat: number; lon: number; n: number; city?: string }>;
  msaBackdropPoints?: Array<{ lat: number; lon: number }>;
  mapBounds?: { north: number; south: number; east: number; west: number };
};

// --- Shared constants (single source for route + projection + render) ---
export const MAP_W = 1000; // logical projection width (px)
export const MAP_H = 500; // logical projection height (px) — 2:1
export const MAP_PADDING = 40; // logical px kept clear around the footprint
export const MAP_MAX_BACKDROP = 600; // cap on drawn backdrop dots
export const MAP_MAX_ZOOM = 13; // parity with the web map's fitBounds maxZoom
export const MAP_STYLE = "light-v11";
export const MAP_BOX_W = 516; // PDF display width (LETTER 612 − 2×48 margins)
export const MAP_BOX_H = 258; // PDF display height — 2:1

const TILE = 512;

// --- Web-Mercator (normalized [0,1]) ---
function mercX(lon: number): number {
  return (lon + 180) / 360;
}
function mercY(lat: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  const c = Math.min(Math.max(s, -0.9999), 0.9999);
  return 0.5 - Math.log((1 + c) / (1 - c)) / (4 * Math.PI);
}
function invMercY(y: number): number {
  return (2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2) * (180 / Math.PI);
}

export function footprintBounds(
  points: Array<{ lat: number; lon: number }>
): Bounds | null {
  if (!points.length) return null;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const p of points) {
    if (p.lon < west) west = p.lon;
    if (p.lon > east) east = p.lon;
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
  }
  // Pad a degenerate (single-point / single-line) box by ~0.01° (~1km) so
  // downstream fit math has a real rectangle to work with.
  const EPS = 0.01;
  if (east - west < EPS) {
    west -= EPS;
    east += EPS;
  }
  if (north - south < EPS) {
    south -= EPS;
    north += EPS;
  }
  return { west, south, east, north };
}

export function fitBoundsToCenterZoom(
  bounds: Bounds,
  opts: { width: number; height: number; padding: number; maxZoom: number }
): { center: LatLon; zoom: number } {
  const centerLon = (bounds.west + bounds.east) / 2;
  const centerLat = invMercY((mercY(bounds.north) + mercY(bounds.south)) / 2);
  const fracX = Math.abs(mercX(bounds.east) - mercX(bounds.west));
  const fracY = Math.abs(mercY(bounds.south) - mercY(bounds.north));
  const availW = Math.max(1, opts.width - 2 * opts.padding);
  const availH = Math.max(1, opts.height - 2 * opts.padding);
  const zoomX = fracX > 0 ? Math.log2(availW / (TILE * fracX)) : Infinity;
  const zoomY = fracY > 0 ? Math.log2(availH / (TILE * fracY)) : Infinity;
  let zoom = Math.min(zoomX, zoomY);
  if (!Number.isFinite(zoom)) zoom = opts.maxZoom;
  zoom = Math.min(zoom, opts.maxZoom);
  zoom = Math.max(zoom, 0);
  return { center: { lat: centerLat, lon: centerLon }, zoom };
}

export function projectToPixel(
  p: LatLon,
  view: { center: LatLon; zoom: number; width: number; height: number }
): Pixel {
  const worldPx = TILE * Math.pow(2, view.zoom);
  const x = (mercX(p.lon) - mercX(view.center.lon)) * worldPx + view.width / 2;
  const y = (mercY(p.lat) - mercY(view.center.lat)) * worldPx + view.height / 2;
  return { x, y };
}

export function thinBackdrop<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const stride = Math.ceil(points.length / max);
  return points.filter((_, i) => i % stride === 0);
}

export function coverageRadius(n: number): number {
  const c = Math.min(Math.max(n, 1), 100);
  return 6 + ((c - 1) / 99) * 12; // 6..18
}

export function buildStaticImageUrl(opts: {
  center: LatLon;
  zoom: number;
  width: number;
  height: number;
  style: string;
  token: string;
}): string {
  const lon = opts.center.lon.toFixed(5);
  const lat = opts.center.lat.toFixed(5);
  const z = opts.zoom.toFixed(2);
  return (
    `https://api.mapbox.com/styles/v1/mapbox/${opts.style}/static/` +
    `${lon},${lat},${z}/${opts.width}x${opts.height}@2x` +
    `?access_token=${encodeURIComponent(opts.token)}&attribution=false&logo=false`
  );
}

export function buildFallbackCircles(
  geo: GeoInput,
  opts: { width: number; height: number; padding: number; maxBackdrop: number }
): { coverage: PixelN[]; backdrop: Pixel[] } | null {
  const bounds =
    footprintBounds(geo.coverageMapPoints) ??
    (geo.mapBounds
      ? {
          west: geo.mapBounds.west,
          east: geo.mapBounds.east,
          north: geo.mapBounds.north,
          south: geo.mapBounds.south,
        }
      : null);
  if (!bounds) return null;
  const { width, height, padding } = opts;
  const spanLon = bounds.east - bounds.west || 1;
  const spanLat = bounds.north - bounds.south || 1;
  const lonToX = (lon: number) =>
    padding + ((lon - bounds.west) / spanLon) * (width - 2 * padding);
  const latToY = (lat: number) =>
    padding + ((bounds.north - lat) / spanLat) * (height - 2 * padding);
  const inBox = (x: number, y: number) =>
    x >= 0 && x <= width && y >= 0 && y <= height;
  const coverage: PixelN[] = geo.coverageMapPoints
    .map((p) => ({ x: lonToX(p.lon), y: latToY(p.lat), n: p.n }))
    .filter((p) => inBox(p.x, p.y));
  const backdrop: Pixel[] = thinBackdrop(geo.msaBackdropPoints ?? [], opts.maxBackdrop)
    .map((p) => ({ x: lonToX(p.lon), y: latToY(p.lat) }))
    .filter((p) => inBox(p.x, p.y));
  return { coverage, backdrop };
}

export function coverageMapRenderModel(
  image: { dataUrl: string; coveragePx: PixelN[]; backdropPx: Pixel[] } | null,
  geo: GeoInput
): CoverageRenderModel {
  if (image) {
    return {
      mode: "basemap",
      imageSrc: image.dataUrl,
      coverage: image.coveragePx,
      backdrop: image.backdropPx,
    };
  }
  const fb = buildFallbackCircles(geo, {
    width: MAP_W,
    height: MAP_H,
    padding: MAP_PADDING,
    maxBackdrop: MAP_MAX_BACKDROP,
  });
  if (!fb) return { mode: "empty" };
  return { mode: "fallback", coverage: fb.coverage, backdrop: fb.backdrop };
}
