"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection, Point, Polygon } from "geojson";
import type { Map as MapboxMap } from "mapbox-gl";

import type { MarketIqDailyCompetitiveSet } from "@/lib/market-iq/daily-watchlists";
import type { MarketIqLeaseUpAlert, MarketIqListingEvent } from "@/lib/market-iq/listing-events";

type Candidate = { id: string; label: string; latitude: number; longitude: number };
type Bounds = [[number, number], [number, number]];

function validCoordinates(latitude: number | null | undefined, longitude: number | null | undefined) {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function candidates(events: MarketIqListingEvent[], leaseUps: MarketIqLeaseUpAlert[]) {
  const unique = new Map<string, Candidate>();
  for (const item of [...events, ...leaseUps]) {
    if (!validCoordinates(item.latitude, item.longitude)) continue;
    const key = item.propertyId ?? `${item.latitude!.toFixed(5)}:${item.longitude!.toFixed(5)}`;
    const address = item.address?.trim();
    const label = item.propertyName?.trim() || (address ? `${address}, ${item.city}` : `${item.city} · ZIP ${item.zip}`);
    if (!unique.has(key)) unique.set(key, { id: key, label, latitude: item.latitude!, longitude: item.longitude! });
  }
  return [...unique.values()].sort((left, right) => left.label.localeCompare(right.label, "en-US"));
}

function pointFeatures(items: Candidate[]): FeatureCollection<Point, { id: string; label: string }> {
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [item.longitude, item.latitude] },
      properties: { id: item.id, label: item.label },
    })),
  };
}

function centerFeature(value: MarketIqDailyCompetitiveSet | null): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: value ? [{ type: "Feature", geometry: { type: "Point", coordinates: [value.longitude, value.latitude] }, properties: {} }] : [],
  };
}

export function marketIqCompetitiveSetCircle(value: MarketIqDailyCompetitiveSet | null): FeatureCollection<Polygon> {
  if (!value) return { type: "FeatureCollection", features: [] };
  const earthRadiusMiles = 3_958.7613;
  const angularDistance = value.radiusMiles / earthRadiusMiles;
  const latitude = value.latitude * Math.PI / 180;
  const longitude = value.longitude * Math.PI / 180;
  const coordinates = Array.from({ length: 65 }, (_, index) => {
    const bearing = index / 64 * Math.PI * 2;
    const targetLatitude = Math.asin(Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing));
    const targetLongitude = longitude + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(targetLatitude),
    );
    return [targetLongitude * 180 / Math.PI, targetLatitude * 180 / Math.PI];
  });
  return { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [coordinates] }, properties: {} }] };
}

function mapBounds(items: Candidate[], value: MarketIqDailyCompetitiveSet | null): Bounds | null {
  const points = [...items, ...(value ? [{ ...value, id: "selected" }] : [])];
  if (!points.length) return null;
  return [
    [Math.min(...points.map((point) => point.longitude)), Math.min(...points.map((point) => point.latitude))],
    [Math.max(...points.map((point) => point.longitude)), Math.max(...points.map((point) => point.latitude))],
  ];
}

export function MarketIqCompetitiveSetMapPicker({ events, leaseUpAlerts, value, onChange }: {
  events: MarketIqListingEvent[];
  leaseUpAlerts: MarketIqLeaseUpAlert[];
  value: MarketIqDailyCompetitiveSet | null;
  onChange: (value: MarketIqDailyCompetitiveSet) => void;
}) {
  const options = useMemo(() => candidates(events, leaseUpAlerts), [events, leaseUpAlerts]);
  const [mapFailed, setMapFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const onChangeRef = useRef(onChange);
  const tokenMissing = !process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const selectedCandidate = options.find((candidate) => value && candidate.latitude === value.latitude && candidate.longitude === value.longitude)?.id ?? "";

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const container = containerRef.current;
    const bounds = mapBounds(options, value);
    if (!token || !container || !bounds) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const mapboxModule = await import("mapbox-gl");
        if (cancelled) return;
        const mapboxgl = mapboxModule.default;
        mapboxgl.accessToken = token;
        const singlePoint = bounds[0][0] === bounds[1][0] && bounds[0][1] === bounds[1][1];
        const map = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/light-v11",
          ...(value
            ? { center: [value.longitude, value.latitude], zoom: value.radiusMiles === 1 ? 12 : value.radiusMiles === 3 ? 10.75 : 10 }
            : singlePoint ? { center: bounds[0], zoom: 12 } : { bounds, fitBoundsOptions: { padding: 42, maxZoom: 12 } }),
          attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
        map.on("load", () => {
          map.addSource("competitive-radius", { type: "geojson", data: marketIqCompetitiveSetCircle(value) });
          map.addLayer({ id: "competitive-radius-fill", type: "fill", source: "competitive-radius", paint: { "fill-color": "#0f766e", "fill-opacity": 0.12 } });
          map.addLayer({ id: "competitive-radius-line", type: "line", source: "competitive-radius", paint: { "line-color": "#0f766e", "line-width": 2 } });
          map.addSource("competitive-candidates", { type: "geojson", data: pointFeatures(options) });
          map.addLayer({ id: "competitive-candidates", type: "circle", source: "competitive-candidates", paint: { "circle-color": "#64748b", "circle-radius": 5, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
          map.addSource("competitive-center", { type: "geojson", data: centerFeature(value) });
          map.addLayer({ id: "competitive-center", type: "circle", source: "competitive-center", paint: { "circle-color": "#0f766e", "circle-radius": 8, "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
          map.on("click", "competitive-candidates", (event) => {
            const properties = event.features?.[0]?.properties as { id?: string } | undefined;
            const candidate = options.find((option) => option.id === properties?.id);
            if (candidate) onChangeRef.current({ latitude: candidate.latitude, longitude: candidate.longitude, radiusMiles: value?.radiusMiles ?? 3, label: candidate.label });
          });
          map.on("click", (event) => {
            if (map.queryRenderedFeatures(event.point, { layers: ["competitive-candidates"] }).length) return;
            onChangeRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng, radiusMiles: value?.radiusMiles ?? 3, label: `Pinned map point ${event.lngLat.lat.toFixed(4)}, ${event.lngLat.lng.toFixed(4)}` });
          });
          map.on("mouseenter", "competitive-candidates", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "competitive-candidates", () => { map.getCanvas().style.cursor = ""; });
        });
        cleanup = () => { mapRef.current = null; map.remove(); };
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    })();
    return () => { cancelled = true; cleanup?.(); };
  }, [options, value]);

  function choose(candidateId: string) {
    const candidate = options.find((option) => option.id === candidateId);
    if (candidate) onChange({ latitude: candidate.latitude, longitude: candidate.longitude, radiusMiles: value?.radiusMiles ?? 3, label: candidate.label });
  }

  return <div className="overflow-hidden rounded-xl border border-teal-200 bg-white">
    <div className="grid gap-3 border-b border-teal-100 bg-teal-50/50 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
      <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Competitive-set center</span><select value={selectedCandidate} onChange={(event) => choose(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy"><option value="">Choose an observed property or pin the map</option>{options.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select></label>
      <p className="text-xs font-semibold text-slate-500">{options.length} source-located properties</p>
    </div>
    {tokenMissing || mapFailed || !options.length
      ? <div className="grid min-h-56 place-items-center p-6 text-center"><p className="max-w-md text-sm leading-6 text-slate-500">{!options.length ? "No retained events carry usable source coordinates in this edition." : "The property selector remains available. Map pinning will appear when the Mapbox token is available."}</p></div>
      : <div ref={containerRef} className="h-80 w-full bg-slate-100" role="application" aria-label="Choose a competitive-set center on the activity map" />}
    <p className="border-t border-slate-100 px-4 py-3 text-[11px] leading-5 text-slate-500">Click a source property marker or any map location. Only retained events carrying valid source coordinates can match the saved radius.</p>
  </div>;
}
