// Server-side fetch of a Mapbox Static Images basemap (no points in the URL),
// base64-embedded for the scorecard PDF's <Image>, plus the coverage/backdrop
// points projected to pixels for the react-pdf <Svg> overlay. Never throws:
// returns null on any failure so the PDF always generates (SVG fallback).

import type { ScorecardData } from "@/lib/types";
import { readCoveragePoints } from "./coverage-points";
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

/** Why a basemap fetch returned null. Reported via the optional `onFailure`
 *  telemetry hook so the caller (the PDF route) can surface config problems —
 *  notably an `http` 401/403 from a URL-restricted/missing server token — to
 *  Sentry, rather than the basemap silently degrading to the SVG fallback. */
export type CoverageMapFailure =
  | { reason: "no_token" }
  | { reason: "no_bounds" }
  | { reason: "http"; status: number }
  | { reason: "aborted" }
  | { reason: "error"; message: string };

export async function fetchCoverageMapImage(
  geo: ScorecardData["geographicCoverage"],
  opts: {
    width: number;
    height: number;
    token: string | undefined;
    timeoutMs: number;
    maxBackdrop?: number;
    fetchImpl?: typeof fetch;
    /** Optional telemetry hook fired on every null-returning path. Must not
     *  throw (calls are guarded). Lets the route report failures to Sentry
     *  without this module depending on Sentry. */
    onFailure?: (failure: CoverageMapFailure) => void;
  }
): Promise<CoverageMapImage | null> {
  const { width, height, token, timeoutMs } = opts;
  const maxBackdrop = opts.maxBackdrop ?? MAP_MAX_BACKDROP;
  // Report a failure via the telemetry hook (never let it throw — the PDF must
  // still render the SVG fallback) and return null.
  const fail = (failure: CoverageMapFailure): null => {
    try {
      opts.onFailure?.(failure);
    } catch {
      /* telemetry must never break PDF generation */
    }
    return null;
  };
  if (!token) return fail({ reason: "no_token" });

  const pts = readCoveragePoints(geo.coverageMapPoints);
  const bounds: Bounds | null =
    footprintBounds(pts) ??
    (geo.mapBounds
      ? {
          west: geo.mapBounds.west,
          east: geo.mapBounds.east,
          north: geo.mapBounds.north,
          south: geo.mapBounds.south,
        }
      : null);
  if (!bounds) return fail({ reason: "no_bounds" });

  const { center, zoom } = fitBoundsToCenterZoom(bounds, {
    width,
    height,
    padding: MAP_PADDING,
    maxZoom: MAP_MAX_ZOOM,
  });
  const url = buildStaticImageUrl({ center, zoom, width, height, style: MAP_STYLE, token });

  const doFetch = opts.fetchImpl ?? fetch;
  // Retry once on a TRANSIENT failure (timeout / network error / 5xx) — a
  // single slow Mapbox response shouldn't drop the basemap for that render (and
  // cache a basemap-less PDF). Auth/client errors (401/403/4xx) are config
  // problems that won't fix on retry, so bail immediately and report them.
  const ATTEMPTS = 2;
  let lastFailure: CoverageMapFailure = { reason: "error", message: "no attempt made" };
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(url, { signal: controller.signal });
      if (!res.ok) {
        console.error(`[scorecard-pdf] coverage map fetch HTTP ${res.status} (attempt ${attempt}/${ATTEMPTS})`);
        if (res.status < 500) return fail({ reason: "http", status: res.status });
        lastFailure = { reason: "http", status: res.status };
        continue; // 5xx — server-side, worth one retry
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
      const view = { center, zoom, width, height };
      const inBox = (x: number, y: number) =>
        x >= 0 && x <= width && y >= 0 && y <= height;
      const coveragePx: PixelN[] = pts
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
      console.error(`[scorecard-pdf] coverage map fetch failed (attempt ${attempt}/${ATTEMPTS})`, err);
      const aborted = err instanceof Error && err.name === "AbortError";
      lastFailure = aborted
        ? { reason: "aborted" }
        : { reason: "error", message: err instanceof Error ? err.message : String(err) };
      // transient — fall through to the next attempt
    } finally {
      clearTimeout(timer);
    }
  }
  return fail(lastFailure);
}
