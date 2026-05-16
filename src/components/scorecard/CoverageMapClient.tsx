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
}: {
  city: string;
  msaName: string;
}) {
  return (
    <svg
      viewBox="0 0 880 380"
      className="block h-auto w-full rounded"
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

function pointsToGeoJSON(
  points: Array<CoveragePoint | BackdropPoint>,
  includeProps = false
) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((p) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [p.lon, p.lat] as [number, number],
      },
      properties: includeProps
        ? {
            n: "n" in p ? p.n : 1,
            city: "city" in p ? p.city : undefined,
            type: "type" in p ? p.type : undefined,
          }
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
}: {
  coveragePoints: CoveragePoint[];
  backdropPoints: BackdropPoint[];
  mapBounds: MapBounds | undefined;
  accentColor: string;
  fallbackCity: string;
  fallbackMsa: string;
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
        // eslint-disable-next-line no-console
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
            [mapBounds.west, mapBounds.south],
            [mapBounds.east, mapBounds.north],
          ],
          fitBoundsOptions: { padding: 40 },
          interactive: false,
          attributionControl: { compact: false },
        }) as MapInstance;
        map = m;

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
        // eslint-disable-next-line no-console
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
      <div className="rounded-lg border border-grid bg-white p-2">
        <MapSvgFallback city={fallbackCity} msaName={fallbackMsa} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-grid bg-white">
      <div
        ref={containerRef}
        className="aspect-[2/1] w-full"
        role="img"
        aria-label={`Coverage map · ${fallbackMsa}`}
      />
    </div>
  );
}
