# Coverage Map in Scorecard PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the coverage map into the scorecard PDF — a real Mapbox `light-v11` basemap with the operator's coverage points drawn on top — enlarged in the "01 Scale & Fit" section, with a graceful SVG-only fallback so a PDF never fails to generate.

**Architecture:** The PDF route fetches a **basemap-only** PNG from the Mapbox Static Images API (center + zoom + size — no points in the URL), base64-embeds it via react-pdf `<Image>`, and draws the coverage + backdrop points as react-pdf `<Svg>` `<Circle>`s positioned by a pure Web-Mercator projection so they align to the basemap. All geometry (fit-bounds → center/zoom, point→pixel projection, radius, thinning, render-mode decision) lives in one pure, isomorphic, unit-tested module. When the basemap can't be fetched (no token, error, timeout, no bounds), the same overlay is drawn over a plain background via a linear projection.

**Tech Stack:** TypeScript, `@react-pdf/renderer` v4 (`Document/Page/View/Text/Image/Svg/Circle/Rect`), Next.js route handler (`runtime="nodejs"`), Mapbox Static Images API, `node:test` for pure/unit tests, Vitest for the existing component suite.

## Global Constraints

- **Never break PDF generation.** `fetchCoverageMapImage` returns `null` on ANY failure (missing token, fetch/HTTP/timeout error, no usable bounds) and NEVER throws. `null` → SVG-only fallback render. All failures log with the `[scorecard-pdf]` prefix.
- **Coverage points are never sent to Mapbox.** The Static request URL carries only the map center + zoom + size. Points are projected and drawn locally.
- **Styling + framing parity with the web map** (`src/components/scorecard/CoverageMapClient.tsx`): basemap style `light-v11`; frame to the operator footprint (`footprintBounds(coverageMapPoints)`, fall back to `mapBounds`) with `padding` and `maxZoom = 13`; grey backdrop circles `fill "#B8C2D1"`, opacity `0.4`, r≈2; teal coverage circles `fill COLOR_TEAL (#1b6e8c)`, fill-opacity `0.85`, white stroke width `1.5`, radius interpolating listing count `n: 1→6, 100→18` (clamped).
- **Logical vs display dimensions:** projection + SVG `viewBox` use LOGICAL dims `MAP_W=1000 × MAP_H=500`; the PDF box renders at `MAP_BOX_W=516 × MAP_BOX_H=258` pt (LETTER 612 − 2×48 margins, 2:1). The Static request uses `1000x500@2x` (`@2x` is resolution only — framing is the logical size). These three (request size, projection size, viewBox) MUST stay in the same 2:1 framing so the overlay aligns to the basemap.
- **Token:** reuse `process.env.NEXT_PUBLIC_MAPBOX_TOKEN` server-side for v1 (a dedicated URL-restricted server token is a deferred hardening follow-up).
- **No schema / migration / seed / view-model changes.** No changes to any other PDF section or to the web map's behavior (only a pure-function extraction from `CoverageMapClient.tsx`).
- **Tile size 512** for all Web-Mercator math (Mapbox GL convention), so PDF framing matches the web map's zoom levels.
- **CI gate** (the "Type check + tests" check): `npx prisma generate` → `npx tsc --noEmit` → `npm run test:watch-list` (node:test; picks up the new `*.test.ts`) → `npm run test:components` (Vitest; must stay green).
- **Testing note (spec reconciliation):** the design spec named a "Vitest component test" for the present-vs-fallback render. react-test-renderer is not installed and RTL/happy-dom cannot render `@react-pdf/renderer` host components. Instead, the render **decision** is extracted into a pure `coverageMapRenderModel(...)` (Task 1) and unit-tested there; `CoverageMapBlock` is a 1:1 mapper over that model. This is a deliberate, more-robust realization of the spec's testing intent — the branch logic is fully covered by pure tests, and Task 4 adds a live PDF spot-check.

---

## File Structure

- **Create** `src/lib/scorecard/coverage-map-geo.ts` — pure, isomorphic geometry + render-model helpers + shared constants. No Node/network imports. (Task 1)
- **Create** `src/lib/scorecard/coverage-map-geo.test.ts` — `node:test` unit tests for Task 1. (Task 1)
- **Modify** `src/components/scorecard/CoverageMapClient.tsx` — delete its local `footprintBounds`, import it from the new module (DRY; no behavior change). (Task 1)
- **Create** `src/lib/scorecard/pdf-coverage-map.ts` — server-only fetch wrapper: `fetchCoverageMapImage` + `CoverageMapImage` type. (Task 2)
- **Create** `src/lib/scorecard/pdf-coverage-map.test.ts` — `node:test` unit tests (injected `fetchImpl`) for Task 2. (Task 2)
- **Modify** `src/components/scorecard/OperatorProfilePDF.tsx` — add `Circle`/`Rect` imports + `COLOR_MUTED_2`; new `CoverageMapBlock`; thread `coverageMap` + `geo` through `OperatorProfilePDF` → `ScaleFitSection`. (Task 3)
- **Modify** `src/app/api/scorecard/[slug]/pdf/route.tsx` — fetch the basemap image, pass `coverageMap` prop. (Task 4)

---

## Task 1: Pure geometry, render-model, and constants module

**Files:**
- Create: `src/lib/scorecard/coverage-map-geo.ts`
- Test: `src/lib/scorecard/coverage-map-geo.test.ts`
- Modify: `src/components/scorecard/CoverageMapClient.tsx` (import `footprintBounds` from the new module; delete the local copy)

**Interfaces:**
- Produces (consumed by Tasks 2, 3, 4):
  - Types: `LatLon`, `Bounds` (`{west,south,east,north}`), `Pixel` (`{x,y}`), `PixelN` (`{x,y,n}`), `CoverageRenderModel`.
  - `footprintBounds(points: Array<{lat:number;lon:number}>): Bounds | null`
  - `fitBoundsToCenterZoom(bounds: Bounds, opts: {width:number;height:number;padding:number;maxZoom:number}): {center: LatLon; zoom: number}`
  - `projectToPixel(p: LatLon, view: {center: LatLon; zoom: number; width: number; height: number}): Pixel`
  - `thinBackdrop<T>(points: T[], max: number): T[]`
  - `coverageRadius(n: number): number`
  - `buildStaticImageUrl(opts: {center: LatLon; zoom: number; width: number; height: number; style: string; token: string}): string`
  - `buildFallbackCircles(geo, opts: {width:number;height:number;padding:number;maxBackdrop:number}): {coverage: PixelN[]; backdrop: Pixel[]} | null`
  - `coverageMapRenderModel(image: {dataUrl:string; coveragePx: PixelN[]; backdropPx: Pixel[]} | null, geo): CoverageRenderModel`
  - Constants: `MAP_W=1000`, `MAP_H=500`, `MAP_PADDING=40`, `MAP_MAX_BACKDROP=600`, `MAP_MAX_ZOOM=13`, `MAP_STYLE="light-v11"`, `MAP_BOX_W=516`, `MAP_BOX_H=258`.
- Consumes: nothing (leaf module).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scorecard/coverage-map-geo.test.ts`:

```ts
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

test("thinBackdrop: within cap is unchanged; over cap strides down to ≤ max", () => {
  const three = [1, 2, 3];
  assert.deepEqual(thinBackdrop(three, 5), three);
  const ten = Array.from({ length: 10 }, (_, i) => i);
  const thinned = thinBackdrop(ten, 5);
  assert.ok(thinned.length <= 5);
  assert.equal(thinned[0], 0); // deterministic stride, keeps index 0
});

test("coverageRadius: clamps and interpolates 1→6, 100→18", () => {
  assert.equal(coverageRadius(1), 6);
  assert.equal(coverageRadius(100), 18);
  assert.equal(coverageRadius(0), 6); // clamp low
  assert.equal(coverageRadius(500), 18); // clamp high
  assert.ok(Math.abs(coverageRadius(50.5) - 12) < 0.1); // ~midpoint
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/lib/scorecard/coverage-map-geo.test.ts` (or the repo's node:test invocation used by `test:watch-list`).
Expected: FAIL — module `./coverage-map-geo` not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/scorecard/coverage-map-geo.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/lib/scorecard/coverage-map-geo.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Refactor `CoverageMapClient.tsx` to reuse `footprintBounds` (DRY)**

In `src/components/scorecard/CoverageMapClient.tsx`: delete the local `footprintBounds` function (currently ~lines 75-102) and add an import at the top:

```ts
import { footprintBounds } from "@/lib/scorecard/coverage-map-geo";
```

Leave every call site unchanged — the signature is identical. (The local function returned `{west,south,east,north}`; the imported `Bounds` has the same keys.)

- [ ] **Step 6: Verify types + web-map suite unaffected**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scorecard/coverage-map-geo.ts src/lib/scorecard/coverage-map-geo.test.ts src/components/scorecard/CoverageMapClient.tsx
git commit -m "feat(pdf-map): pure coverage-map geometry + render-model helpers"
```

---

## Task 2: Server-side basemap fetch wrapper

**Files:**
- Create: `src/lib/scorecard/pdf-coverage-map.ts`
- Test: `src/lib/scorecard/pdf-coverage-map.test.ts`

**Interfaces:**
- Consumes (from Task 1): `footprintBounds`, `fitBoundsToCenterZoom`, `projectToPixel`, `thinBackdrop`, `buildStaticImageUrl`, `MAP_PADDING`, `MAP_MAX_BACKDROP`, `MAP_MAX_ZOOM`, `MAP_STYLE`, types `PixelN`/`Pixel`.
- Produces (consumed by Tasks 3, 4):
  - `type CoverageMapImage = { dataUrl: string; width: number; height: number; coveragePx: PixelN[]; backdropPx: Pixel[] }`
  - `fetchCoverageMapImage(geo: ScorecardData["geographicCoverage"], opts: {width:number;height:number;token:string|undefined;timeoutMs:number;maxBackdrop?:number;fetchImpl?:typeof fetch}): Promise<CoverageMapImage | null>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scorecard/pdf-coverage-map.test.ts`:

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { fetchCoverageMapImage } from "./pdf-coverage-map";

const GEO = {
  citiesText: "Philadelphia",
  coverageMapPoints: [
    { lat: 40.0, lon: -75.0, n: 5 },
    { lat: 40.02, lon: -74.98, n: 40 },
  ],
  msaBackdropPoints: [
    { lat: 40.0, lon: -75.0 },
    { lat: 40.05, lon: -75.05 },
  ],
  mapBounds: { north: 40.1, south: 39.9, east: -74.9, west: -75.1 },
} as unknown as import("@/lib/types").ScorecardData["geographicCoverage"];

function pngResponse(): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer, // "\x89PNG"
  } as unknown as Response;
}

test("success: returns data URL + projected in-box pixels", async () => {
  let calledUrl = "";
  const fetchImpl = (async (url: string) => {
    calledUrl = url;
    return pngResponse();
  }) as unknown as typeof fetch;
  const res = await fetchCoverageMapImage(GEO, {
    width: 1000,
    height: 500,
    token: "TESTTOKEN",
    timeoutMs: 2500,
    fetchImpl,
  });
  assert.ok(res);
  assert.ok(res!.dataUrl.startsWith("data:image/png;base64,"));
  assert.equal(res!.width, 1000);
  assert.equal(res!.coveragePx.length, 2);
  for (const p of res!.coveragePx) {
    assert.ok(p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 500);
  }
  // URL must NOT contain any coordinate pairs from the points payload
  assert.ok(!calledUrl.includes("geojson"));
});

test("missing token → null (no fetch)", async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return pngResponse();
  }) as unknown as typeof fetch;
  const res = await fetchCoverageMapImage(GEO, {
    width: 1000,
    height: 500,
    token: undefined,
    timeoutMs: 2500,
    fetchImpl,
  });
  assert.equal(res, null);
  assert.equal(called, false);
});

test("no bounds → null (no fetch)", async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return pngResponse();
  }) as unknown as typeof fetch;
  const emptyGeo = {
    citiesText: "",
    coverageMapPoints: [],
    msaBackdropPoints: [],
    mapBounds: undefined,
  } as unknown as import("@/lib/types").ScorecardData["geographicCoverage"];
  const res = await fetchCoverageMapImage(emptyGeo, {
    width: 1000,
    height: 500,
    token: "TESTTOKEN",
    timeoutMs: 2500,
    fetchImpl,
  });
  assert.equal(res, null);
  assert.equal(called, false);
});

test("HTTP error → null", async () => {
  const fetchImpl = (async () =>
    ({ ok: false, status: 500 }) as unknown as Response) as unknown as typeof fetch;
  const res = await fetchCoverageMapImage(GEO, {
    width: 1000,
    height: 500,
    token: "TESTTOKEN",
    timeoutMs: 2500,
    fetchImpl,
  });
  assert.equal(res, null);
});

test("fetch rejection / abort → null", async () => {
  const fetchImpl = (async () => {
    throw new DOMException("aborted", "AbortError");
  }) as unknown as typeof fetch;
  const res = await fetchCoverageMapImage(GEO, {
    width: 1000,
    height: 500,
    token: "TESTTOKEN",
    timeoutMs: 2500,
    fetchImpl,
  });
  assert.equal(res, null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/lib/scorecard/pdf-coverage-map.test.ts`
Expected: FAIL — module `./pdf-coverage-map` not found.

- [ ] **Step 3: Implement the fetch wrapper**

Create `src/lib/scorecard/pdf-coverage-map.ts`:

```ts
// Server-side fetch of a Mapbox Static Images basemap (no points in the URL),
// base64-embedded for the scorecard PDF's <Image>, plus the coverage/backdrop
// points projected to pixels for the react-pdf <Svg> overlay. Never throws:
// returns null on any failure so the PDF always generates (SVG fallback).

import type { ScorecardData } from "@/lib/types";
import {
  footprintBounds,
  fitBoundsToCenterZoom,
  projectToPixel,
  thinBackdrop,
  buildStaticImageUrl,
  MAP_PADDING,
  MAP_MAX_BACKDROP,
  MAP_MAX_ZOOM,
  MAP_STYLE,
  type Pixel,
  type PixelN,
  type Bounds,
} from "./coverage-map-geo";

export type CoverageMapImage = {
  dataUrl: string;
  width: number;
  height: number;
  coveragePx: PixelN[];
  backdropPx: Pixel[];
};

export async function fetchCoverageMapImage(
  geo: ScorecardData["geographicCoverage"],
  opts: {
    width: number;
    height: number;
    token: string | undefined;
    timeoutMs: number;
    maxBackdrop?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<CoverageMapImage | null> {
  const { width, height, token, timeoutMs } = opts;
  const maxBackdrop = opts.maxBackdrop ?? MAP_MAX_BACKDROP;
  if (!token) return null;

  const bounds: Bounds | null =
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

  const { center, zoom } = fitBoundsToCenterZoom(bounds, {
    width,
    height,
    padding: MAP_PADDING,
    maxZoom: MAP_MAX_ZOOM,
  });
  const url = buildStaticImageUrl({ center, zoom, width, height, style: MAP_STYLE, token });

  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.error(`[scorecard-pdf] coverage map fetch HTTP ${res.status}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    const view = { center, zoom, width, height };
    const inBox = (x: number, y: number) =>
      x >= 0 && x <= width && y >= 0 && y <= height;
    const coveragePx: PixelN[] = geo.coverageMapPoints
      .map((p) => {
        const { x, y } = projectToPixel({ lat: p.lat, lon: p.lon }, view);
        return { x, y, n: p.n };
      })
      .filter((p) => inBox(p.x, p.y));
    const backdropPx: Pixel[] = thinBackdrop(geo.msaBackdropPoints ?? [], maxBackdrop)
      .map((p) => projectToPixel({ lat: p.lat, lon: p.lon }, view))
      .filter((p) => inBox(p.x, p.y));
    return { dataUrl, width, height, coveragePx, backdropPx };
  } catch (err) {
    console.error("[scorecard-pdf] coverage map fetch failed", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test src/lib/scorecard/pdf-coverage-map.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scorecard/pdf-coverage-map.ts src/lib/scorecard/pdf-coverage-map.test.ts
git commit -m "feat(pdf-map): server-side Mapbox static basemap fetch wrapper"
```

---

## Task 3: Render the map in the PDF (CoverageMapBlock)

**Files:**
- Modify: `src/components/scorecard/OperatorProfilePDF.tsx`

**Interfaces:**
- Consumes (from Tasks 1, 2): `coverageMapRenderModel`, `coverageRadius`, `MAP_W`, `MAP_H`, `MAP_BOX_W`, `MAP_BOX_H` (Task 1); `type CoverageMapImage` (Task 2).
- Produces (consumed by Task 4): `OperatorProfilePDF` now requires a `coverageMap: CoverageMapImage | null` prop.

- [ ] **Step 1: Add imports**

In `src/components/scorecard/OperatorProfilePDF.tsx`:

Add `Circle` and `Rect` to the `@react-pdf/renderer` import block (currently `Document, Page, Text, View, Image, Link, Svg, Polyline, Font`):

```ts
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  Svg,
  Polyline,
  Circle,
  Rect,
  Font,
} from "@react-pdf/renderer";
```

Add `COLOR_MUTED_2` to the theme import (currently `import { styles, COLOR_TEAL, COLOR_GRID } from "./OperatorProfilePDF.theme";`):

```ts
import { styles, COLOR_TEAL, COLOR_GRID, COLOR_MUTED_2 } from "./OperatorProfilePDF.theme";
```

Add the geo/render-model imports near the other `@/lib` imports:

```ts
import type { CoverageMapImage } from "@/lib/scorecard/pdf-coverage-map";
import {
  coverageMapRenderModel,
  coverageRadius,
  MAP_W,
  MAP_H,
  MAP_BOX_W,
  MAP_BOX_H,
} from "@/lib/scorecard/coverage-map-geo";
```

- [ ] **Step 2: Add the `CoverageMapBlock` component**

Add near `ConcentrationBar` (before `ScaleFitSection`, around line 1232). `geo` is typed off `ScorecardData` (already imported in this file):

```tsx
function CoverageMapBlock({
  coverageMap,
  geo,
}: {
  coverageMap: CoverageMapImage | null;
  geo: ScorecardData["geographicCoverage"];
}) {
  const model = coverageMapRenderModel(coverageMap, geo);
  if (model.mode === "empty") return null;

  return (
    <View wrap={false} style={{ marginBottom: 10 }}>
      <Eyebrow style={{ marginBottom: 6 }}>Coverage</Eyebrow>
      <View
        style={{
          position: "relative",
          width: MAP_BOX_W,
          height: MAP_BOX_H,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: COLOR_GRID,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {model.mode === "basemap" ? (
          <Image
            src={model.imageSrc}
            style={{ position: "absolute", top: 0, left: 0, width: MAP_BOX_W, height: MAP_BOX_H }}
          />
        ) : null}
        <Svg
          style={{ position: "absolute", top: 0, left: 0 }}
          width={MAP_BOX_W}
          height={MAP_BOX_H}
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        >
          {model.mode === "fallback" ? (
            <Rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#F2F5F8" />
          ) : null}
          {model.backdrop.map((p, i) => (
            <Circle key={`b${i}`} cx={p.x} cy={p.y} r={2} fill="#B8C2D1" opacity={0.4} />
          ))}
          {model.coverage.map((p, i) => (
            <Circle
              key={`c${i}`}
              cx={p.x}
              cy={p.y}
              r={coverageRadius(p.n)}
              fill={COLOR_TEAL}
              fillOpacity={0.85}
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          ))}
        </Svg>
      </View>
      <Text style={{ fontSize: 7.5, color: COLOR_MUTED_2, marginTop: 4 }}>
        {model.mode === "basemap"
          ? "Basemap © Mapbox © OpenStreetMap"
          : "Coverage footprint (basemap unavailable)"}
      </Text>
    </View>
  );
}
```

- [ ] **Step 3: Thread the props through `ScaleFitSection`**

Update the `ScaleFitSection` signature (line ~1232) to accept the new props:

```tsx
function ScaleFitSection({
  scaleFit,
  peers,
  coverageMap,
  geo,
}: {
  scaleFit: ScaleFitView;
  peers: SelectedPeer[];
  coverageMap: CoverageMapImage | null;
  geo: ScorecardData["geographicCoverage"];
}) {
```

Render `<CoverageMapBlock>` immediately after the "Geographic concentration" card (the `<View style={cardBox}>` that wraps `ConcentrationBar`, ends ~line 1281):

```tsx
      {/* Geographic concentration */}
      <View style={cardBox} wrap={false}>
        <Eyebrow style={{ marginBottom: 4 }}>Geographic concentration</Eyebrow>
        <ConcentrationBar
          topCities={scaleFit.topCities}
          top3Share={scaleFit.top3Share}
          cohortTop3={scaleFit.cohortTop3}
        />
      </View>

      {/* Coverage map */}
      <CoverageMapBlock coverageMap={coverageMap} geo={geo} />
```

- [ ] **Step 4: Add the `coverageMap` prop to `OperatorProfilePDF` and pass it down**

Update the `OperatorProfilePDF` signature (line ~2060):

```tsx
export function OperatorProfilePDF({
  view,
  scorecard,
  coverageMap,
}: {
  view: ScorecardView;
  scorecard: ScorecardData;
  coverageMap: CoverageMapImage | null;
}) {
```

Update the `ScaleFitSection` call site (line ~2098):

```tsx
        <View style={{ marginTop: 12 }}>
          <ScaleFitSection
            scaleFit={view.scaleFit}
            peers={view.peers}
            coverageMap={coverageMap}
            geo={scorecard.geographicCoverage}
          />
        </View>
```

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: 0 errors. (The only caller of `OperatorProfilePDF` — the PDF route — will now report a missing `coverageMap` prop; that is wired in Task 4. If run standalone before Task 4, expect exactly that one error at the route call site; it is resolved in Task 4 Step 1. To keep this task independently green, Task 4 immediately follows.)

- [ ] **Step 6: Verify the component suite is unaffected**

Run: `npm run test:components`
Expected: existing Vitest tests still pass (no new component test added — the render decision is covered by `coverageMapRenderModel` tests in Task 1; see Global Constraints "Testing note").

- [ ] **Step 7: Commit**

```bash
git add src/components/scorecard/OperatorProfilePDF.tsx
git commit -m "feat(pdf-map): render coverage basemap + point overlay in Scale & Fit"
```

---

## Task 4: Wire the fetch into the PDF route + verify end to end

**Files:**
- Modify: `src/app/api/scorecard/[slug]/pdf/route.tsx`

**Interfaces:**
- Consumes (from Tasks 1, 2): `fetchCoverageMapImage` (Task 2); `MAP_W`, `MAP_H` (Task 1).

- [ ] **Step 1: Fetch the basemap and pass the prop**

In `src/app/api/scorecard/[slug]/pdf/route.tsx`, add imports near the top:

```ts
import { fetchCoverageMapImage } from "@/lib/scorecard/pdf-coverage-map";
import { MAP_W, MAP_H } from "@/lib/scorecard/coverage-map-geo";
```

After `const view = buildScorecardView({ ... });` and before `renderToBuffer(...)`, add:

```ts
    // Fetch a static basemap for the coverage map (basemap-only — points are
    // drawn locally in the PDF, never sent to Mapbox). Returns null on any
    // failure; the PDF then renders the SVG-only fallback.
    const coverageMap = await fetchCoverageMapImage(scorecard.geographicCoverage, {
      width: MAP_W,
      height: MAP_H,
      token: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      timeoutMs: 2500,
    });
```

Update the render call:

```ts
    const buffer = await renderToBuffer(
      <OperatorProfilePDF view={view} scorecard={scorecard} coverageMap={coverageMap} />
    );
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: 0 errors (the Task 3 route-call-site error is now resolved).

- [ ] **Step 3: Run the full CI gate**

Run:
```bash
npx prisma generate && npx tsc --noEmit && npm run test:watch-list && npm run test:components
```
Expected: tsc 0 errors; `test:watch-list` includes the new `coverage-map-geo` + `pdf-coverage-map` suites, all green; `test:components` green. (If stale generated route types error, clear them: `rm -f .next/types/validator.ts .next/dev/types/validator.ts` and re-run tsc.)

- [ ] **Step 4: Live PDF spot-check (browser preview)**

Start the dev server via the preview tool (`.claude/launch.json`), then request a scorecard PDF for a known operator (e.g. open the scorecard, use its "Download PDF" affordance, or hit `/api/scorecard/<slug>/pdf`). Confirm:
- the PDF downloads/renders without error;
- the "01 Scale & Fit" section shows the enlarged coverage map with the light basemap (streets/city labels visible) and teal coverage dots sized by count over the grey backdrop.

If `NEXT_PUBLIC_MAPBOX_TOKEN` is not set locally, confirm the SVG-only fallback renders (grey background + teal/grey dots) and the PDF still generates. Capture a screenshot as proof.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/scorecard/[slug]/pdf/route.tsx
git commit -m "feat(pdf-map): fetch static basemap in the scorecard PDF route"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** basemap image ✓ (Tasks 2, 3); point overlay with web-parity styling ✓ (Task 3, Global Constraints); footprint framing + maxZoom 13 ✓ (Tasks 1, 2); enlarged full-width in Scale & Fit ✓ (Task 3); points never sent to Mapbox ✓ (Task 2 + test); graceful fallback / never fail ✓ (Global Constraints, Tasks 2–4); token reuse ✓ (Task 4); per-render fetch / no cache ✓ (Task 4); backdrop thinning ✓ (Task 1); pure-helper + fetch tests ✓ (Tasks 1, 2). Deferred items (dedicated server token, response caching, richer labels) intentionally out of scope.
- **Testing-method deviation** from the spec (Vitest component test → pure `coverageMapRenderModel` test) is documented in Global Constraints with rationale.
- **Type consistency:** `Bounds`/`LatLon`/`Pixel`/`PixelN`/`CoverageRenderModel`/`CoverageMapImage` names are used identically across tasks; `fetchCoverageMapImage` signature and `OperatorProfilePDF` `coverageMap` prop match between producer and consumer tasks.
- **Placeholders:** none — every code step contains complete code.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-17-map-in-scorecard-pdf.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
