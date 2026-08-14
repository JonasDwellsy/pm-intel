"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { MarketIqMapPoint, MarketIqPropertyType } from "@/lib/market-iq/report/report";

type Segment = { propertyType: MarketIqPropertyType; bedrooms: number; label: string };

const SEGMENTS: Segment[] = [
  { propertyType: "apartment", bedrooms: 999, label: "All apartments" },
  { propertyType: "house", bedrooms: 999, label: "All houses" },
  { propertyType: "apartment", bedrooms: 1, label: "1-bed apartments" },
  { propertyType: "apartment", bedrooms: 2, label: "2-bed apartments" },
  { propertyType: "house", bedrooms: 2, label: "2-bed houses" },
  { propertyType: "house", bedrooms: 3, label: "3-bed houses" },
];

function money(value: number | null) {
  return value === null ? "Not published" : new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(value);
}

function featureCollection(points: MarketIqMapPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((point) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [point.longitude, point.latitude] },
      properties: {
        zip: point.zip,
        label: point.label,
        rent: point.rent,
        yoy: point.yearOverYearPct,
        observations: point.observations,
        month: point.month,
        status: point.status,
        valueBasis: point.valueBasis,
      },
    })),
  };
}

function MapFallback({ points, reason }: { points: MarketIqMapPoint[]; reason: "token" | "segment" }) {
  const tokenMissing = reason === "token";
  return <div className="grid min-h-[420px] place-items-center rounded-2xl bg-[#edf1f2] p-8">
    <div className="max-w-md text-center"><p className="text-sm font-semibold text-slate-700">{tokenMissing ? "Map unavailable" : "No ZIP series for this segment"}</p><p className="mt-2 text-sm leading-6 text-slate-500">{tokenMissing ? "The ZIP analysis remains available below. The map will appear after the public Mapbox token is available to this deployment." : "No city or MSA rent is substituted here. This view will populate when ZIP-level Trends IQ observations for the selected segment are available."}</p><p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{new Set(points.map((point) => point.zip)).size} ZIPs selected</p></div>
  </div>;
}

export function MarketIqRentMap({ points, primaryColor, accentColor }: {
  points: MarketIqMapPoint[];
  primaryColor: string;
  accentColor: string;
}) {
  const [segment, setSegment] = useState<Segment>(SEGMENTS[0]);
  const [unavailable, setUnavailable] = useState(!process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const filtered = useMemo(() => points.filter((point) =>
    point.propertyType === segment.propertyType && point.bedrooms === segment.bedrooms
  ), [points, segment]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const container = containerRef.current;
    if (!token || !container || unavailable || filtered.length === 0) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const mapboxModule = await import("mapbox-gl");
        const mapboxgl = mapboxModule.default;
        if (cancelled) return;
        mapboxgl.accessToken = token;
        const map = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/light-v11",
          bounds: [[-81.87, 41.38], [-81.43, 41.68]],
          fitBoundsOptions: { padding: 42 },
          attributionControl: false,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
        map.on("load", () => {
          map.addSource("market-iq-zips", { type: "geojson", data: featureCollection(filtered) });
          map.addLayer({
            id: "market-iq-zip-halos", type: "circle", source: "market-iq-zips",
            paint: { "circle-radius": 21, "circle-color": "#ffffff", "circle-opacity": 0.86 },
          });
          map.addLayer({
            id: "market-iq-zip-points", type: "circle", source: "market-iq-zips",
            paint: {
              "circle-radius": ["case", ["==", ["get", "status"], "reportable"], 16, 12],
              "circle-color": ["case",
                ["!=", ["get", "status"], "reportable"], "#94a3b8",
                [">=", ["coalesce", ["get", "yoy"], 0], 0], accentColor,
                primaryColor,
              ],
              "circle-opacity": 0.92,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });
          map.addLayer({
            id: "market-iq-zip-labels", type: "symbol", source: "market-iq-zips",
            layout: { "text-field": ["get", "zip"], "text-size": 10, "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"] },
            paint: { "text-color": "#ffffff" },
          });
          map.on("click", "market-iq-zip-points", (event) => {
            const feature = event.features?.[0];
            if (!feature || feature.geometry.type !== "Point") return;
            const properties = feature.properties ?? {};
            const yoy = typeof properties.yoy === "number" ? `${properties.yoy >= 0 ? "+" : ""}${properties.yoy.toFixed(1)}% YoY` : "YoY not published";
            const basis = properties.valueBasis === "median_999_proxy" ? " · temporary median basis" : "";
            const sample = properties.status === "reportable" ? `N=${Number(properties.observations).toLocaleString("en-US")} · ${properties.month}${basis}` : "Trends IQ sample not yet reportable";
            new mapboxgl.Popup({ offset: 18, closeButton: false })
              .setLngLat(feature.geometry.coordinates as [number, number])
              .setHTML(`<div style="font-family:system-ui;padding:2px 3px"><strong>ZIP ${properties.zip}</strong><div style="font-size:18px;margin-top:5px">${money(properties.rent === null ? null : Number(properties.rent))}</div><div style="color:#64748b;margin-top:3px">${yoy}</div><div style="color:#94a3b8;font-size:11px;margin-top:6px">${sample}</div></div>`)
              .addTo(map);
          });
          map.on("mouseenter", "market-iq-zip-points", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "market-iq-zip-points", () => { map.getCanvas().style.cursor = ""; });
        });
        cleanup = () => map.remove();
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => { cancelled = true; cleanup?.(); };
  }, [filtered, unavailable, primaryColor, accentColor]);

  return <div>
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Map segment">
      {SEGMENTS.map((option) => {
        const selected = option.propertyType === segment.propertyType && option.bedrooms === segment.bedrooms;
        return <button key={`${option.propertyType}:${option.bedrooms}`} type="button" onClick={() => setSegment(option)} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${selected ? "border-transparent bg-[var(--report-primary)] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>{option.label}</button>;
      })}
    </div>
    {unavailable || filtered.length === 0 ? <MapFallback points={points} reason={unavailable ? "token" : "segment"} /> : <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-[0_20px_55px_rgba(15,23,42,0.08)]"><div ref={containerRef} className="h-[470px] w-full" role="img" aria-label={`ZIP-level asking rent map for ${segment.label}`} /><div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-white/70 bg-white/95 px-4 py-3 text-xs text-slate-600 shadow-sm backdrop-blur"><p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[var(--report-accent)]" />Rising year over year</p><p className="mt-1.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[var(--report-primary)]" />Softening year over year</p><p className="mt-1.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />Not yet reportable</p>{segment.bedrooms === 999 && <p className="mt-2 border-t border-slate-200 pt-2 text-[10px] text-slate-400">Overall product view uses the temporary Trends median basis.</p>}</div></div>}
  </div>;
}
