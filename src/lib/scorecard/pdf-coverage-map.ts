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
