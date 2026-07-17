# Coverage Map in Scorecard PDF — Design

**Date:** 2026-07-17
**Status:** Approved (approach + placement); pending user review of this spec
**Author:** Jonas + Claude
**Origin:** A client asked that the coverage map — today an interactive tool on
the web scorecard — be included in the scorecard **PDF**. Jonas: "enlarge it and
give it more texture so local city borderlines can be seen within the MSA."

## Problem

The web scorecard renders a real, interactive Mapbox GL map
(`CoverageMapClient.tsx`, `light-v11` basemap + point layers) inside **01 Scale &
Fit**. The **PDF** (`OperatorProfilePDF.tsx`, rendered server-side by
`@react-pdf/renderer` — no browser, no DOM, no WebGL) has **no map at all**: its
only geographic element in Scale & Fit is the `ConcentrationBar`. Clients who
work from the PDF (deal rooms, printouts) lose the single most legible signal of
*where* an operator actually operates.

**The "city borderlines / texture" ask can only be satisfied by a real
basemap.** Our scorecard data carries coverage **points** (`coverageMapPoints`,
`msaBackdropPoints`) and a **bounding box** (`mapBounds`) — but **no boundary
geometry** anywhere (no city/county polygons; the only outlines we ship are
US-state outlines for the national markets map). City lines, streets, and place
labels therefore have to come from map tiles, exactly as they do on the web map.

## Goals / approved decisions

- **Include the coverage map in the scorecard PDF**, enlarged, in **01 Scale &
  Fit** (full content width), with a caption — the PDF counterpart to the web
  map.
- **Real basemap** (Mapbox `light-v11`) so city borderlines / streets / place
  labels ("texture") are visible within the MSA — approved over a plain
  SVG dot-map, which cannot show borders.
- **Framing + styling parity with the web map:** frame to the operator's
  footprint (not the whole MSA), grey MSA backdrop dots, teal coverage dots sized
  by listing count.
- **A PDF must never fail to generate because of the map.** If the map can't be
  produced (no token, network error, timeout, no bounds), fall back gracefully to
  a plain SVG dot-map and still emit the PDF.

## Non-goals

- **No interactivity** in the PDF (zoom/pan/controls) — it's a static artifact.
- **No new boundary geometry** in our data — borders come from basemap tiles.
- **No response caching** in v1 (see Deferred).
- No change to the web map, the view model, or any other PDF section.

## Approach

**Chosen (approved): a real Mapbox basemap image, embedded in the PDF.**
The server fetches a static basemap PNG from the **Mapbox Static Images API**,
base64-embeds it via react-pdf `<Image>` (the exact mechanism already proven for
the wordmark, `getLogoDataUrl()` → `<Image src={dataUrl}>`), and the coverage +
backdrop points are drawn **on top** as react-pdf `<Svg>` circles.

### Refinement from the brainstorming sketch — read this

In the design chat I described letting the **Static API draw the points too**
(points encoded in the request URL as a GeoJSON overlay) and flagged the ~8 KB
GET-URL cap as the gotcha, requiring us to cap overlaid points. On writing it up,
a cleaner variant of the *same approved approach* is strictly better, so this
spec adopts it:

> **Fetch a basemap-only image** (center + zoom + size — no points in the URL)
> **and draw the points ourselves** as `<Svg>` circles positioned over the image
> in the PDF.

Why this variant wins:

1. **Web-parity point styling** — soft teal circles whose radius scales with
   listing count, plus the grey backdrop, drawn exactly like the web map's
   `circle` layers. The Static API's GeoJSON-overlay markers are coarse
   (pin-shaped, 3 fixed sizes) and can't reproduce that.
2. **No URL cap, no point capping** — points never go in the URL, so the ~8 KB
   limit is irrelevant and we plot every coverage point.
3. **Better privacy** — the operator's coverage **points are never sent to
   Mapbox**; the request carries only the map center + zoom. This is the
   most privacy-preserving option and is a good fit for our address-level data
   posture. (The web map does send points to Mapbox GL client-side; the PDF
   path won't need to.)

The cost is a small, pure, well-understood piece of math — fit-bounds → center +
zoom, and a Web-Mercator point→pixel projection — so the SVG overlay aligns to
the basemap. Both are unit-testable in isolation.

### Alternative considered (rejected)

- **Plain SVG dot-map only** (no basemap): satisfies "enlarge" but **not**
  "texture / city borderlines" — we have no boundary geometry to draw. Kept only
  as the **fallback** when the basemap can't be fetched.

## Architecture

Two new files plus small edits to the PDF route and the PDF component.

### A. Pure geo helpers — `src/lib/scorecard/coverage-map-geo.ts` (new, isomorphic)

No Node or network imports, so it's usable from both the server fetch wrapper and
the client web map, and testable with `node:test`.

- `footprintBounds(points)` → `{west, south, east, north} | null` — **moved here
  from `CoverageMapClient.tsx`** (identical logic, incl. the ~0.01° degenerate-box
  pad). `CoverageMapClient` imports it from here afterward (DRY; one small
  refactor, no behavior change).
- `fitBoundsToCenterZoom(bounds, {width, height, padding, maxZoom})` →
  `{center: {lat, lon}, zoom}` — the standard Web-Mercator "fit a bbox into a
  pixel viewport" computation: world size `= 512 · 2^zoom`; pick the largest
  (fractional) zoom whose projected lon-span and lat-span both fit within
  `width/height` minus `padding`; clamp to `maxZoom`. Mirrors the web map's
  `fitBoundsOptions: { padding: 48, maxZoom: 13 }`.
- `projectToPixel({lat, lon}, {center, zoom, width, height})` → `{x, y}` —
  Web-Mercator projection of a point to a pixel in the `width×height` image, given
  the image's center + zoom. Same projection Mapbox uses, so overlay dots land on
  the right streets.
- `thinBackdrop(points, max)` → `points` — deterministic down-sample of
  `msaBackdropPoints` (they can be 5k+) to at most `max` (e.g. 600) evenly-strided
  points, keeping the PDF/SVG light. Deterministic (stride, not random).
- `buildStaticImageUrl({center, zoom, width, height, style, token})` → URL string
  — `https://api.mapbox.com/styles/v1/mapbox/{style}/static/{lon},{lat},{zoom}/{width}x{height}@2x?access_token=…&attribution=false&logo=false`.
  `@2x` is **resolution only** — framing/projection use the logical `width×height`.
  (Attribution is preserved as a small caption line in the PDF instead — see D.)

### B. Server fetch wrapper — `src/lib/scorecard/pdf-coverage-map.ts` (new, server-only)

- `fetchCoverageMapImage(geographicCoverage, { width, height, token, timeoutMs })`
  → `Promise<CoverageMapImage | null>` where
  `CoverageMapImage = { dataUrl: string; width: number; height: number; coveragePx: Array<{x,y,n}>; backdropPx: Array<{x,y}> }`.
- Steps: pick framing bounds = `footprintBounds(coverageMapPoints) ?? mapBounds`;
  if neither exists → return `null`. Compute `center/zoom` via
  `fitBoundsToCenterZoom`. Build the URL. `fetch` the PNG with an
  `AbortController` timeout (e.g. 2500 ms); on non-OK, throw. Read bytes →
  `data:image/png;base64,…`. Project every `coverageMapPoints` entry and every
  `thinBackdrop(msaBackdropPoints)` entry to pixels. Return the struct.
- **Returns `null` on any failure** (missing token, fetch/timeout/HTTP error, no
  bounds) — logged via `console.error("[scorecard-pdf] …")`, never thrown. The
  caller treats `null` as "use the fallback."

### C. Route wiring — `src/app/api/scorecard/[slug]/pdf/route.tsx`

- After `buildScorecardView(...)`, `await fetchCoverageMapImage(scorecard.geographicCoverage, { width: MAP_W, height: MAP_H, token: process.env.NEXT_PUBLIC_MAPBOX_TOKEN, timeoutMs: 2500 })`.
- Pass the result as a new prop: `<OperatorProfilePDF view={view} scorecard={scorecard} coverageMap={coverageMap} />`.
- `MAP_W`/`MAP_H` are the logical image dims — content width ≈ 516pt (LETTER 612 −
  2×48 margins) at a 2:1 aspect → e.g. **`MAP_W = 1000`, `MAP_H = 500`** (both
  ≤ the Static API's 1280/side limit; `@2x` supplies retina raster). These live
  next to the component so the projection and the render use identical numbers.

### D. PDF render — `src/components/scorecard/OperatorProfilePDF.tsx`

- Add `Circle` (and `Rect` for the fallback background) to the `@react-pdf/renderer`
  import (already imports `Svg`, `Polyline`, `Image`).
- New `CoverageMapBlock({ coverageMap, accent })` rendered inside **01 Scale &
  Fit** (near `ConcentrationBar`, `OperatorProfilePDF.tsx:1257`+), enlarged to the
  full content width:
  - **When `coverageMap` is present:** a relatively-positioned `<View>` at the
    content width and 2:1 height, containing the basemap `<Image src={coverageMap.dataUrl}>`
    (absolute, filling the box) with an absolute `<Svg viewBox="0 0 {W} {H}">`
    overlay on top (react-pdf honors `position:"absolute"` + document-order
    z-stacking — both used throughout this file). The overlay draws:
    - backdrop: `<Circle>` per `backdropPx`, r≈2, fill `#B8C2D1`, opacity 0.4;
    - coverage: `<Circle>` per `coveragePx`, `r = lerp(n: 1→6, 100→18)`
      (clamped outside the stops, as the web map's `interpolate` does), fill
      `accent` (teal), opacity 0.85, white stroke 1.5 — **matching the web map's
      `circle` paint** (`CoverageMapClient.tsx:243-276`).
  - **When `coverageMap` is `null` (fallback):** an `<Svg>` at the same box with a
    rounded `<Rect>` background (`#F2F5F8`) and the **same coverage/backdrop
    circles**, positioned by a simple **linear** lat/lon→box mapping over
    `footprintBounds` (no basemap to align to, so linear is fine). No basemap
    image, no borders — but the operator's footprint still reads.
  - A small caption line beneath in both cases (e.g. "Coverage — {MSA}"). When the
    basemap is present, include the required Mapbox/OSM attribution in faint small
    text (basemap `logo`/`attribution` are turned off in the request).

## Data / privacy / ops

- **Token:** reuse the existing `NEXT_PUBLIC_MAPBOX_TOKEN` **server-side** for v1
  (already available in the Node PDF runtime; `NEXT_PUBLIC_` vars are readable on
  the server too). A **dedicated, URL-restricted server token** is a hardening
  follow-up (deferred) — not a v1 blocker.
- **Privacy:** the Static request sends Mapbox only the map **center + zoom** —
  **never the coverage points** (we draw those locally). No new exposure of
  address-level data; strictly less than the web map already sends.
- **Billing / volume:** one Static Images API call per PDF render (low volume —
  PDFs are generated on demand for paying clients). No caching in v1, so a
  re-download re-fetches; acceptable at current volume (see Deferred).
- **Backdrop weight:** `msaBackdropPoints` can be 5k+; `thinBackdrop` caps what
  we draw (≈600) so the SVG overlay stays light and the PDF small.

## Failure handling

`fetchCoverageMapImage` returns `null` (never throws) on: missing token, fetch
error, timeout, non-OK HTTP, or no usable bounds. The route passes `null`
through; `CoverageMapBlock` renders the SVG fallback. **The PDF always
generates.** All failures log with the `[scorecard-pdf]` prefix for observability.

## Testing

- **Pure helpers (`coverage-map-geo.test.ts`, `node:test`) — highest value:**
  - `footprintBounds`: multi-point bbox; single-point degenerate pad; empty → null.
  - `fitBoundsToCenterZoom`: a known bbox+viewport yields the expected zoom; wide
    vs tall bbox picks the constraining axis; `maxZoom` clamp holds.
  - `projectToPixel`: center point maps to `(W/2, H/2)`; a point east/north of
    center moves right/up; round-trip sanity against `fitBoundsToCenterZoom`.
  - `thinBackdrop`: ≤ max preserved as-is; > max strided down to ≤ max,
    deterministically.
  - `buildStaticImageUrl`: correct path shape, `@2x`, `logo/attribution=false`,
    token in query.
- **Fetch wrapper (`pdf-coverage-map.test.ts`):** mock `fetch` — OK → struct with
  `dataUrl` + projected pixels; HTTP error → `null`; abort/timeout → `null`;
  missing token → `null`; missing bounds → `null`.
- **PDF component (Vitest, `test:components`):** render `OperatorProfilePDF` with a
  stub `coverageMap` → asserts an `<Image>` for the basemap **and** overlay
  circles are present; render with `coverageMap={null}` → asserts the SVG fallback
  (no `<Image>` for the map, dot circles present). Reuse the existing PDF
  component-test harness.
- **CI gate:** `tsc --noEmit` + `test:watch-list` + `test:components` (the "Type
  check + tests" check).

## Rollout

Additive: two new lib files, one new PDF sub-component + import, one new route
prop, and the `footprintBounds` extraction (with `CoverageMapClient` re-import).
No schema, migration, or seed changes. Ships on deploy. Requires
`NEXT_PUBLIC_MAPBOX_TOKEN` present in the PDF runtime (already set — it powers the
web map today); without it, PDFs still generate with the SVG fallback.

## Open / deferred

- **Dedicated URL-restricted server Mapbox token** (hardening) — v1 reuses
  `NEXT_PUBLIC_MAPBOX_TOKEN`.
- **Response caching** of the fetched basemap PNG (per operator/bounds/zoom) to
  cut Static API calls on repeat downloads — deferred; per-render fetch in v1.
- **Richer city labeling** beyond what the basemap renders (e.g. explicit
  submarket labels) — out of scope; the basemap's own place labels are the
  "texture."
