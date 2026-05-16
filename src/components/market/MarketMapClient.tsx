"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  QUADRANT_COLORS,
  QUADRANT_ORDER,
  type QuadrantColorKey,
} from "@/lib/quadrant-colors";

type PmLayer = {
  slug: string;
  name: string;
  quadrant: string;
  colorKey: QuadrantColorKey;
  color: string;
  points: Array<{ lat: number; lon: number; n: number }>;
};

type Bounds = { north: number; south: number; east: number; west: number };

function StylizedFallback({ msaName }: { msaName: string }) {
  return (
    <svg
      viewBox="0 0 1320 520"
      className="block h-auto w-full"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="1320" height="520" fill="#F2F5F8" />
      <text
        x="660"
        y="260"
        textAnchor="middle"
        fill="#8A92A2"
        fontSize="12"
        fontWeight="600"
        letterSpacing="0.18em"
        style={{ textTransform: "uppercase" }}
      >
        {msaName}
      </text>
    </svg>
  );
}

// Build a single GeoJSON FeatureCollection from every PM's coverage points,
// tagged with the quadrant string so a Mapbox `match` expression can color
// them at the layer level (one layer, many colors — cheaper than per-PM
// sources).
function buildFeatureCollection(layers: PmLayer[]) {
  return {
    type: "FeatureCollection" as const,
    features: layers.flatMap((pm) =>
      pm.points.map((p) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [p.lon, p.lat] as [number, number],
        },
        properties: {
          quadrant: pm.quadrant,
          slug: pm.slug,
          n: p.n,
        },
      }))
    ),
  };
}

function backdropFeatureCollection(points: Array<{ lat: number; lon: number }>) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((p) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [p.lon, p.lat] as [number, number],
      },
      properties: {},
    })),
  };
}

export function MarketMapClient({
  pmLayers,
  backdropPoints,
  mapBounds,
  msaName,
  legendCounts,
}: {
  pmLayers: PmLayer[];
  backdropPoints: Array<{ lat: number; lon: number }>;
  mapBounds: Bounds | undefined;
  msaName: string;
  legendCounts: Partial<Record<QuadrantColorKey, number>>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const hasMapData = Boolean(mapBounds && pmLayers.length > 0);
  const initialUnavailable = !token || !hasMapData;
  const [unavailable, setUnavailable] = useState(initialUnavailable);

  useEffect(() => {
    if (unavailable || !mapBounds) {
      if (!token) {
        // eslint-disable-next-line no-console
        console.warn(
          "[MarketMap] NEXT_PUBLIC_MAPBOX_TOKEN missing — falling back to placeholder"
        );
      }
      return;
    }
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
    let ro: ResizeObserver | null = null;
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        m.addControl(new (mapboxgl as any).ScaleControl({ unit: "imperial" }), "bottom-right");

        m.on("load", () => {
          if (backdropPoints?.length) {
            m.addSource("msa-backdrop", {
              type: "geojson",
              data: backdropFeatureCollection(backdropPoints),
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

          if (pmLayers.length) {
            m.addSource("operator-coverage", {
              type: "geojson",
              data: buildFeatureCollection(pmLayers),
            });
            m.addLayer({
              id: "operator-coverage-circles",
              type: "circle",
              source: "operator-coverage",
              paint: {
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["get", "n"],
                  1,
                  4,
                  100,
                  9,
                ],
                "circle-color": [
                  "match",
                  ["get", "quadrant"],
                  "MF/BTR / Institutional",
                  QUADRANT_COLORS["mfbtr-inst"].fg,
                  "MF/BTR / Independent",
                  QUADRANT_COLORS["mfbtr-ind"].fg,
                  "Scattered Site / Institutional",
                  QUADRANT_COLORS["scattered-inst"].fg,
                  "Scattered Site / Independent",
                  QUADRANT_COLORS["scattered-ind"].fg,
                  QUADRANT_COLORS.hybrid.fg,
                ],
                "circle-opacity": 0.78,
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 0.6,
              },
            });
          }
        });

        ro = new ResizeObserver(() => m.resize());
        ro.observe(el);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[MarketMap] Mapbox init failed — falling back", err);
        if (!cancelled) setUnavailable(true);
      }
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      map?.remove();
    };
  }, [unavailable, token, mapBounds, pmLayers, backdropPoints]);

  if (unavailable) {
    return (
      <div className="overflow-hidden rounded-lg border border-grid bg-white">
        <StylizedFallback msaName={msaName} />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-grid bg-white">
      <div
        ref={containerRef}
        className="h-[480px] w-full"
        role="img"
        aria-label={`Coverage map · ${msaName}`}
      />
      {/* Legend — absolute bottom-left */}
      <div className="pointer-events-none absolute bottom-4 left-4 min-w-[240px] rounded-lg border border-grid bg-white/95 p-3.5 px-4 shadow-sm backdrop-blur">
        <p className="dq-eyebrow-muted mb-2.5">Quadrant</p>
        <ul className="space-y-1.5 text-[12px]">
          {QUADRANT_ORDER.map((key) => {
            const color = QUADRANT_COLORS[key];
            const count = legendCounts[key] ?? 0;
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-3 border-t border-grid-soft pt-1.5 first:border-t-0 first:pt-0"
              >
                <span className="flex items-center gap-2 text-navy">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color.fg }}
                  />
                  {color.label}
                </span>
                <span className="dq-mono text-muted-foreground">{count}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
