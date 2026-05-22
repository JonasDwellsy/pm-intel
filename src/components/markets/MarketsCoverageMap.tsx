"use client";

// v0.12 — Coverage map.
//
// Hand-rolled in pure SVG because react-simple-maps doesn't list
// React 19 as a supported peer (the project uses React 19.2.4
// under Next 16; install failed with ERESOLVE). The projection
// math lives in src/lib/markets-map-projection.ts so the marker
// dots and the US outline share a single transform; this file
// owns the visual treatment + interaction.
//
// Layout: 16:10-ish SVG (960×600 viewBox) with a soft tinted
// contiguous-48 outline behind dots for the 10 live markets +
// 19 top-20 available-on-request markets. Live dots route to
// the existing market scorecard; available dots open a mailto:
// to partnerships@dwellsy.com with the MSA name pre-filled in
// the subject line.
//
// Hidden below the md breakpoint — the dots are too tight to
// interact with at phone width, and the cards grid below the
// map carries the same information.

import * as React from "react";
import Link from "next/link";
import {
  buildCoverageRequestMailto,
  getCoverageMarkets,
  type MarketCoverageEntry,
} from "@/lib/markets-coverage";
import { project, MAP_VIEWBOX } from "@/lib/markets-map-projection";

const MARKER_RADIUS = 6;

// Hand-traced lat/lng polygon of the contiguous 48 states. ~60
// waypoints walking clockwise from the Pacific NW. Passed through
// project() at render time so the outline always matches the
// marker projection — no chance of drift between the two layers.
// The shape is intentionally schematic: enough fidelity to read
// as "the United States" without dragging in a 50KB TopoJSON.
const US_OUTLINE_LATLNG: ReadonlyArray<readonly [number, number]> = [
  // Pacific NW → south down the West Coast
  [48.4, -124.7],
  [46.2, -124.0],
  [42.0, -124.4],
  [39.3, -123.8],
  [37.0, -122.5],
  [34.5, -120.5],
  [32.6, -117.2],
  // Mexico border west → east
  [32.6, -114.7],
  [31.4, -111.1],
  [31.8, -108.2],
  [31.8, -106.5],
  [29.8, -103.0],
  [29.4, -101.0],
  [27.5, -99.5],
  [25.9, -97.2],
  // Gulf coast east
  [27.5, -97.3],
  [29.4, -94.7],
  [29.5, -91.5],
  [29.1, -90.2],
  [30.3, -88.0],
  [30.4, -86.5],
  [30.0, -84.0],
  [28.7, -82.7],
  // Florida tip + east coast north
  [26.5, -82.0],
  [25.2, -80.5],
  [25.9, -80.1],
  [27.8, -80.3],
  [30.7, -81.4],
  [32.0, -80.8],
  [33.5, -78.9],
  [34.6, -76.5],
  [36.9, -76.0],
  [37.9, -75.5],
  [39.3, -74.4],
  [40.5, -74.0],
  [41.0, -71.9],
  [41.7, -70.0],
  [42.7, -70.6],
  [43.7, -70.0],
  [44.5, -68.0],
  [44.8, -67.0],
  // Canada border east → west
  [45.4, -67.7],
  [45.4, -71.0],
  [45.0, -74.2],
  [44.0, -76.5],
  [43.3, -78.7],
  [42.2, -82.7],
  [45.5, -84.6],
  [46.7, -84.4],
  [46.8, -88.0],
  [47.5, -90.0],
  [47.4, -92.0],
  [48.0, -94.0],
  [49.0, -94.7],
  [49.0, -123.0],
  [48.4, -124.7],
];

// Pre-compute the projected path string. Runs once at module load.
const US_OUTLINE_PATH = (() => {
  const points = US_OUTLINE_LATLNG.map(([lat, lng]) => project(lat, lng));
  if (points.length === 0) return "";
  const [x0, y0] = points[0];
  const rest = points
    .slice(1)
    .map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  return `M${x0.toFixed(1)},${y0.toFixed(1)} ${rest} Z`;
})();

interface MarkerLayout {
  market: MarketCoverageEntry;
  x: number;
  y: number;
}

/** Pre-project the markers + apply small radial offsets to any
 *  pair of dots that would render closer than ~2 radii apart.
 *  Keeps Nashville / Memphis / Knoxville / Chattanooga visually
 *  separable instead of stacking on top of each other. */
function layoutMarkers(markets: MarketCoverageEntry[]): MarkerLayout[] {
  const initial: MarkerLayout[] = markets.map((m) => {
    const [x, y] = project(m.centroid.lat, m.centroid.lng);
    return { market: m, x, y };
  });

  const minSeparation = MARKER_RADIUS * 2.2; // 2.2× radius keeps dots visually distinct
  // Single relaxation pass — for each colliding pair, push them
  // apart along the line between them by half the deficit each.
  // A pass usually resolves all collisions for the dataset we
  // ship; a second pass would only matter for tight 3-way
  // clusters and the projection has none of those today.
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
          {/* US outline — soft fill, subtle border. Two-tone so the
              map reads at a glance without competing with the dots
              for attention. */}
          <path
            d={US_OUTLINE_PATH}
            fill="#F2F5F8"
            stroke="#D5DBE3"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Markers. Render available first so live dots sit on
              top in any rare overlap. */}
          {layout
            .filter((l) => l.market.status === "available")
            .map((l) => (
              <Marker
                key={l.market.slug}
                layout={l}
                onHover={setHovered}
              />
            ))}
          {layout
            .filter((l) => l.market.status === "live")
            .map((l) => (
              <Marker
                key={l.market.slug}
                layout={l}
                onHover={setHovered}
              />
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
