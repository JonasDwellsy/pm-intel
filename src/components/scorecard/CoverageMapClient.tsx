"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { ScorecardData } from "@/lib/types";

type CoveragePoint = ScorecardData["geographicCoverage"]["coverageMapPoints"][number];
type BackdropPoint = { lat: number; lon: number };
type MapBounds = NonNullable<ScorecardData["geographicCoverage"]["mapBounds"]>;

// Fallback SVG (matches the original stylized placeholder). Used when the
// Mapbox token is missing or map data is unavailable.
function MapSvgFallback({
  city,
  msaName,
  fill = false,
}: {
  city: string;
  msaName: string;
  /** When true, the SVG fills its parent's height (cover) instead of keeping
   *  its natural 880×380 aspect ratio. */
  fill?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 880 380"
      className={fill ? "block h-full w-full rounded" : "block h-auto w-full rounded"}
      preserveAspectRatio={fill ? "xMidYMid slice" : undefined}
      aria-hidden="true"
    >
      <rect x="0" y="0" width="880" height="380" fill="#F2F5F8" />
      <path
        d="M70,90 C110,40 250,30 360,55 C470,80 560,40 700,70 C820,95 830,200 800,260 C770,320 650,360 520,340 C400,322 300,360 200,330 C100,300 40,250 50,180 C56,140 50,120 70,90 Z"
        fill="#fff"
        stroke="#D5DBE3"
        strokeWidth="1.5"
      />
      <text
        x="780"
        y="100"
        fill="#8A92A2"
        textAnchor="end"
        fontSize="11"
        fontWeight="600"
        letterSpacing="0.18em"
        style={{ textTransform: "uppercase" }}
      >
        {msaName}
      </text>
      <g>
        <circle cx="430" cy="195" r="22" fill="#D97834" opacity="0.14" />
        <circle cx="430" cy="195" r="9" fill="#D97834" stroke="#fff" strokeWidth="2.5" />
        <text x="446" y="192" fill="#0F1F3F" fontSize="14" fontWeight="700">
          {city}
        </text>
      </g>
    </svg>
  );
}

// v0.21 — Frame the map to the OPERATOR'S footprint, not the whole MSA.
//
// Previously the map was initialized with the MSA-wide `mapBounds`, so
// every scorecard zoomed out to the entire metro region regardless of
// where the PM actually operates — a PM concentrated in one Baltimore
// neighborhood and one spread across five submarkets looked identically
// zoomed-out, and the user couldn't make out the streets/places needed
// to read which submarkets the operator serves.
//
// Compute a tight bounding box from the operator's coverage points and
// fit to that (with a maxZoom cap applied at fit time, see below). The
// MSA `mapBounds` stays as a fallback for the rare PM with no plotted
// points. A small degenerate-box guard keeps single-point operators
// from producing a zero-area box that fitBounds can't reason about.
function footprintBounds(
  points: CoveragePoint[]
): { west: number; south: number; east: number; north: number } | null {
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
  // Pad a degenerate (single-point or single-line) box by ~0.01° (~1km)
  // so fitBounds has a real rectangle to work with; the maxZoom cap then
  // governs the actual close-in level.
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

function pointsToGeoJSON(
  points: Array<CoveragePoint | BackdropPoint>,
  includeProps = false
) {
  // v0.6.4 Patch 5 — properties carry only `n` (used by the
  // circle-radius interpolate expression for sizing). Earlier we
  // also passed `city` and `type` through, but no downstream layer /
  // popup / hover consumed them; they were emit-and-forget.
  return {
    type: "FeatureCollection" as const,
    features: points.map((p) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [p.lon, p.lat] as [number, number],
      },
      properties: includeProps
        ? { n: "n" in p ? p.n : 1 }
        : {},
    })),
  };
}

export function CoverageMapClient({
  coveragePoints,
  backdropPoints,
  mapBounds,
  accentColor,
  fallbackCity,
  fallbackMsa,
  fill = false,
}: {
  coveragePoints: CoveragePoint[];
  backdropPoints: BackdropPoint[];
  mapBounds: MapBounds | undefined;
  accentColor: string;
  fallbackCity: string;
  fallbackMsa: string;
  /** When true, the map fills its parent's height (h-full) instead of using a
   *  fixed 2:1 aspect ratio. The parent must supply a bounded height. */
  fill?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Decide synchronously (token is NEXT_PUBLIC_ → inlined at build, identical
  // on server and client first render, no hydration mismatch).
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const hasMapData = Boolean(mapBounds && coveragePoints);
  const initialUnavailable = !token || !hasMapData;
  const [unavailable, setUnavailable] = useState(initialUnavailable);

  useEffect(() => {
    if (unavailable) {
      if (!token) {
        // One-time warning per render path.
        console.warn(
          "[CoverageMap] NEXT_PUBLIC_MAPBOX_TOKEN missing — falling back to SVG"
        );
      }
      return;
    }
    if (!mapBounds) return;
    const el = containerRef.current;
    if (!el) return;

    type MapInstance = {
      addControl: (control: unknown, position: string) => void;
      addSource: (id: string, source: unknown) => void;
      addLayer: (layer: unknown) => void;
      on: (event: string, handler: () => void) => void;
      resize: () => void;
      remove: () => void;
    };
    let map: MapInstance | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cancelled = false;

    // Frame to the operator footprint; fall back to MSA bounds if the PM
    // has no plotted coverage points.
    const fitTo = footprintBounds(coveragePoints) ?? mapBounds;

    (async () => {
      try {
        const mod = await import("mapbox-gl");
        const mapboxgl = mod.default;
        if (cancelled) return;
        mapboxgl.accessToken = token!;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = new (mapboxgl as any).Map({
          container: el,
          style: "mapbox://styles/mapbox/light-v11",
          bounds: [
            [fitTo.west, fitTo.south],
            [fitTo.east, fitTo.north],
          ],
          // maxZoom caps the initial fit so a tightly-clustered operator
          // lands at neighborhood level (streets + place labels legible —
          // enough to read which submarkets they serve) rather than
          // zooming to building level. Spread operators fit naturally
          // below this cap.
          fitBoundsOptions: { padding: 48, maxZoom: 13 },
          // v0.21 — interactive so users can zoom/pan to inspect the
          // footprint. cooperativeGestures means page-scroll over the map
          // doesn't hijack into zoom: it takes ⌘/Ctrl+scroll or a
          // two-finger trackpad gesture (or the +/- buttons below).
          interactive: true,
          cooperativeGestures: true,
          // Floor lets users pull back to full-MSA context (the grey
          // backdrop dots give geographic reference); ceiling lets them
          // reach street level without zooming into nothing.
          minZoom: 8,
          maxZoom: 16,
          attributionControl: { compact: false },
        }) as MapInstance;
        map = m;

        // Zoom +/- buttons (top-right). The discoverable, scroll-trap-free
        // way to zoom; pairs with cooperativeGestures. No compass/pitch —
        // this is a flat 2D reference map.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const NavCtl = (mapboxgl as any).NavigationControl;
        m.addControl(new NavCtl({ showCompass: false, visualizePitch: false }), "top-right");

        // Scale bar bottom-left
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        m.addControl(new (mapboxgl as any).ScaleControl({ unit: "imperial" }), "bottom-left");

        m.on("load", () => {
          // Backdrop: 5k+ grey reference dots
          if (backdropPoints?.length) {
            m.addSource("msa-backdrop", {
              type: "geojson",
              data: pointsToGeoJSON(backdropPoints, false),
            });
            m.addLayer({
              id: "msa-backdrop-circles",
              type: "circle",
              source: "msa-backdrop",
              paint: {
                "circle-radius": 2,
                "circle-color": "#B8C2D1",
                "circle-opacity": 0.4,
              },
            });
          }

          // Operator coverage on top
          if (coveragePoints?.length) {
            m.addSource("operator-coverage", {
              type: "geojson",
              data: pointsToGeoJSON(coveragePoints, true),
            });
            m.addLayer({
              id: "operator-coverage-circles",
              type: "circle",
              source: "operator-coverage",
              paint: {
                // Radius interpolates with listing count
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["get", "n"],
                  1,
                  6,
                  100,
                  18,
                ],
                "circle-color": accentColor,
                "circle-opacity": 0.85,
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1.5,
              },
            });
          }
        });

        // Keep map sized to its container
        resizeObserver = new ResizeObserver(() => m.resize());
        resizeObserver.observe(el);
      } catch (err) {
        console.warn("[CoverageMap] Mapbox init failed — falling back to SVG", err);
        if (!cancelled) setUnavailable(true);
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      map?.remove();
    };
  }, [
    unavailable,
    token,
    mapBounds,
    coveragePoints,
    backdropPoints,
    accentColor,
  ]);

  if (unavailable) {
    return (
      <div className={`rounded-lg border border-grid bg-white p-2${fill ? " h-full" : ""}`}>
        <MapSvgFallback city={fallbackCity} msaName={fallbackMsa} fill={fill} />
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-lg border border-grid bg-white${fill ? " h-full" : ""}`}>
      <div
        ref={containerRef}
        className={fill ? "h-full w-full" : "aspect-[2/1] w-full"}
        role="img"
        aria-label={`Coverage map · ${fallbackMsa}`}
      />
    </div>
  );
}
