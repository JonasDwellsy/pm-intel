"use client";

// v0.12 — Coverage map.
//
// Hand-rolled in pure SVG because react-simple-maps doesn't list
// React 19 as a supported peer (the project uses React 19.2.4
// under Next 16; install failed with ERESOLVE). The projection
// math lives in src/lib/markets-map-projection.ts — a thin
// wrapper around d3-geo's geoAlbersUsa() that does the AK / HI /
// PR inset composition for free. State borders + marker dots
// share the same transform, so they always land in the same
// frame; this file owns the visual treatment + interaction.
//
// State geometry comes from us-atlas/states-10m.json (the only
// resolution v3 of us-atlas ships). topojson-client converts the
// topology into a GeoJSON FeatureCollection at module load; we
// walk every Polygon / MultiPolygon ring and run each vertex
// through project() to get SVG-ready coordinates. Off-globe
// points (rare — only seen for sliver territories at the edge of
// the projection's recognized domain) return null and the ring
// is skipped.
//
// Hidden below the md breakpoint — the dots are too tight to
// interact with at phone width, and the cards grid below the
// map carries the same information.

import * as React from "react";
import Link from "next/link";
import { feature } from "topojson-client";
import type {
  Topology,
  GeometryCollection,
  Polygon as TopoPolygon,
  MultiPolygon as TopoMultiPolygon,
} from "topojson-specification";
import type {
  Feature,
  FeatureCollection,
  Polygon as GeoPolygon,
  MultiPolygon as GeoMultiPolygon,
} from "geojson";
import statesTopology from "us-atlas/states-10m.json";
import {
  buildCoverageRequestMailto,
  getCoverageMarkets,
  type MarketCoverageEntry,
} from "@/lib/markets-coverage";
import { project, MAP_VIEWBOX } from "@/lib/markets-map-projection";

const MARKER_RADIUS = 6;

// ─── State geometry → SVG paths ──────────────────────────────────

interface StatePath {
  id: string;
  name: string;
  d: string;
}

const STATE_PATHS: StatePath[] = (() => {
  const topology = statesTopology as unknown as Topology<{
    states: GeometryCollection<TopoPolygon | TopoMultiPolygon>;
    nation: GeometryCollection<TopoPolygon | TopoMultiPolygon>;
  }>;
  const collection = feature(
    topology,
    topology.objects.states
  ) as FeatureCollection<GeoPolygon | GeoMultiPolygon, { name?: string }>;

  // geoAlbersUsa composites Alaska, Hawaii, and Puerto Rico into
  // the lower-left inset, so we render every feature in the
  // collection. Filtering FIPS codes is no longer necessary — and
  // would silently drop AK / HI features we explicitly want on
  // the map now that real markers land there.
  return collection.features
    .map((f) => ({
      id: String(f.id ?? ""),
      name: f.properties?.name ?? String(f.id ?? ""),
      d: geometryToPath(f),
    }))
    .filter((s) => s.d.length > 0);
})();

function geometryToPath(
  f: Feature<GeoPolygon | GeoMultiPolygon, { name?: string }>
): string {
  const g = f.geometry;
  if (g.type === "Polygon") {
    return ringsToPath(g.coordinates);
  }
  if (g.type === "MultiPolygon") {
    return g.coordinates.map(ringsToPath).join(" ");
  }
  return "";
}

/** Convert one polygon (array of rings — first is exterior, the
 *  rest are holes) into a string of SVG subpaths. Even-odd fill
 *  rule on the wrapping <path> handles hole rendering correctly
 *  without us having to flip ring winding.
 *
 *  Points that fall outside d3-geo's recognized projection
 *  domain return null. We skip those vertices and emit the rest;
 *  in practice this only affects fringe territory polygons that
 *  cross the projection's clipping plane. The resulting ring
 *  may visually clip but the rest of the state still renders. */
function ringsToPath(polygon: number[][][]): string {
  return polygon
    .map((ring) => {
      if (ring.length < 3) return "";
      const projected = ring
        .map(([lng, lat]) => project(lat, lng))
        .filter((p): p is [number, number] => p !== null);
      if (projected.length < 3) return "";
      const [x0, y0] = projected[0];
      const rest = projected
        .slice(1)
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(" ");
      return `M${x0.toFixed(1)},${y0.toFixed(1)} L${rest} Z`;
    })
    .filter(Boolean)
    .join(" ");
}

// ─── Marker layout ───────────────────────────────────────────────

interface MarkerLayout {
  market: MarketCoverageEntry;
  x: number;
  y: number;
}

/** Pre-project the markers + apply small radial offsets to any
 *  pair of dots that would render closer than ~2 radii apart.
 *  Keeps Nashville / Memphis / Knoxville / Chattanooga visually
 *  separable instead of stacking on top of each other.
 *
 *  Skips any market whose centroid d3-geo can't project (off-globe).
 *  In practice none of the shipped markers hit that path — every
 *  centroid lands inside the geoAlbersUsa composition including
 *  the AK / HI insets — but the guard keeps the function honest
 *  if a future entry has bad coordinates. */
function layoutMarkers(markets: MarketCoverageEntry[]): MarkerLayout[] {
  const initial: MarkerLayout[] = [];
  for (const market of markets) {
    const projected = project(market.centroid.lat, market.centroid.lng);
    if (!projected) continue;
    const [x, y] = projected;
    initial.push({ market, x, y });
  }

  const minSeparation = MARKER_RADIUS * 2.2; // 2.2× radius keeps dots visually distinct
  for (let i = 0; i < initial.length; i++) {
    for (let j = i + 1; j < initial.length; j++) {
      const a = initial[i];
      const b = initial[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= minSeparation || dist === 0) continue;
      const push = (minSeparation - dist) / 2;
      const ux = dx / dist;
      const uy = dy / dist;
      a.x -= ux * push;
      a.y -= uy * push;
      b.x += ux * push;
      b.y += uy * push;
    }
  }
  return initial;
}

// ─── Component ───────────────────────────────────────────────────

export function MarketsCoverageMap() {
  const markets = React.useMemo(() => getCoverageMarkets(), []);
  const layout = React.useMemo(() => layoutMarkers(markets), [markets]);
  const [hovered, setHovered] = React.useState<MarkerLayout | null>(null);

  return (
    <section
      aria-label="US markets coverage map"
      className="hidden md:block"
    >
      <div className="relative mx-auto max-w-[1100px]">
        <svg
          viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
          role="img"
          aria-label="Map of the contiguous United States showing live Dwellsy IQ markets and additional markets available upon request."
          className="block h-auto w-full"
        >
          {/* State geometry — context only, no interactivity.
              Subtle near-background fill + thin border for state
              lines so the marker dots stay visually dominant. */}
          <g aria-hidden>
            {STATE_PATHS.map((s) => (
              <path
                key={s.id}
                d={s.d}
                fill="#F2F5F8"
                stroke="#D5DBE3"
                strokeWidth={0.6}
                strokeLinejoin="round"
                fillRule="evenodd"
              />
            ))}
          </g>

          {/* Markers — available first so live dots sit on top
              in any rare overlap. Rendered after the state group
              so the markers are visually dominant. */}
          {layout
            .filter((l) => l.market.status === "available")
            .map((l) => (
              <Marker key={l.market.slug} layout={l} onHover={setHovered} />
            ))}
          {layout
            .filter((l) => l.market.status === "live")
            .map((l) => (
              <Marker key={l.market.slug} layout={l} onHover={setHovered} />
            ))}
        </svg>

        {hovered && <Tooltip layout={hovered} />}
      </div>

      <Legend />
    </section>
  );
}

// ─── marker ───────────────────────────────────────────────────────

interface MarkerProps {
  layout: MarkerLayout;
  onHover: (l: MarkerLayout | null) => void;
}

function Marker({ layout, onHover }: MarkerProps) {
  const { market, x, y } = layout;
  const isLive = market.status === "live";
  const ariaLabel = isLive
    ? `${market.shortName} — live market. Open scorecard.`
    : `${market.shortName} — available on request. Open mail client.`;

  if (isLive && market.marketPageHref) {
    return (
      <Link
        href={market.marketPageHref}
        aria-label={ariaLabel}
        onMouseEnter={() => onHover(layout)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(layout)}
        onBlur={() => onHover(null)}
        className="focus-visible:outline-none"
      >
        <circle
          cx={x}
          cy={y}
          r={MARKER_RADIUS}
          fill="#0F1F3F"
          stroke="#FFFFFF"
          strokeWidth={2}
          className="transition-transform duration-150 ease-out hover:scale-125"
          style={{ transformOrigin: `${x}px ${y}px`, cursor: "pointer" }}
        />
      </Link>
    );
  }

  // Available — mailto click target.
  return (
    <a
      href={buildCoverageRequestMailto(market)}
      aria-label={ariaLabel}
      onMouseEnter={() => onHover(layout)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(layout)}
      onBlur={() => onHover(null)}
      className="focus-visible:outline-none"
    >
      <circle
        cx={x}
        cy={y}
        r={MARKER_RADIUS}
        fill="#FFFFFF"
        stroke="#1B6E8C"
        strokeWidth={2}
        className="transition-transform duration-150 ease-out hover:scale-125"
        style={{ transformOrigin: `${x}px ${y}px`, cursor: "pointer" }}
      />
    </a>
  );
}

// ─── tooltip ──────────────────────────────────────────────────────

function Tooltip({ layout }: { layout: MarkerLayout }) {
  // Position tooltip via percentage of viewBox so it tracks the
  // marker through responsive scaling without measuring the SVG.
  const xPct = (layout.x / MAP_VIEWBOX.width) * 100;
  const yPct = (layout.y / MAP_VIEWBOX.height) * 100;
  const isAvailable = layout.market.status === "available";
  return (
    <div
      role="tooltip"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: "translate(-50%, calc(-100% - 14px))",
      }}
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-grid bg-white px-3 py-2 text-[12.5px] font-medium text-navy shadow-lg"
    >
      <p className="font-semibold">{layout.market.shortName}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {isAvailable ? "Click to request coverage" : "Click to view market"}
      </p>
    </div>
  );
}

// ─── legend ───────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
      <div className="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <circle cx="7" cy="7" r={MARKER_RADIUS} fill="#0F1F3F" stroke="#FFFFFF" strokeWidth={2} />
        </svg>
        <span className="text-navy font-semibold">Live</span>
        <span className="text-muted-foreground">— scorecards published</span>
      </div>
      <div className="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <circle cx="7" cy="7" r={MARKER_RADIUS} fill="#FFFFFF" stroke="#1B6E8C" strokeWidth={2} />
        </svg>
        <span className="text-navy font-semibold">Available upon request</span>
        <span className="text-muted-foreground">— prioritized by demand</span>
      </div>
    </div>
  );
}
