"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap } from "mapbox-gl";
import type { MarketIqMapPoint, MarketIqMarketCell, MarketIqPropertyType } from "@/lib/market-iq/report/report";

type Segment = { propertyType: MarketIqPropertyType; bedrooms: number; label: string };

const SEGMENTS: Segment[] = [
  { propertyType: "apartment", bedrooms: 999, label: "All apartments" },
  { propertyType: "house", bedrooms: 999, label: "All houses" },
  { propertyType: "apartment", bedrooms: 1, label: "1-bed apartments" },
  { propertyType: "apartment", bedrooms: 2, label: "2-bed apartments" },
  { propertyType: "house", bedrooms: 2, label: "2-bed houses" },
  { propertyType: "house", bedrooms: 3, label: "3-bed houses" },
];

const DIRECTION_COLORS = {
  rising: "#0f766e",
  stable: "#64748b",
  softening: "#c2410c",
} as const;

function money(value: number | null) {
  return value === null ? "Not published" : new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(value);
}

function percentage(value: number | null) {
  if (value === null) return "No YoY read";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function direction(value: number | null): keyof typeof DIRECTION_COLORS {
  if (value === null || Math.abs(value) < 1) return "stable";
  return value > 0 ? "rising" : "softening";
}

function featureCollection(points: MarketIqMapPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((point) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [point.longitude, point.latitude] },
      properties: {
        zip: point.zip,
        rent: point.rent,
        rentLabel: money(point.rent),
        yoy: point.yearOverYearPct,
        yoyLabel: percentage(point.yearOverYearPct),
        observations: point.observations,
        month: point.month,
        direction: direction(point.yearOverYearPct),
        valueBasis: point.valueBasis,
      },
    })),
  };
}

function MapFallback({ reason }: { reason: "token" | "segment" }) {
  const tokenMissing = reason === "token";
  return <div className="grid min-h-[520px] place-items-center rounded-2xl bg-[#edf1f2] p-8">
    <div className="max-w-md text-center"><p className="text-sm font-semibold text-slate-700">{tokenMissing ? "Map unavailable" : "No supported ZIP series for this segment"}</p><p className="mt-2 text-sm leading-6 text-slate-500">{tokenMissing ? "The ZIP ranking remains available. The map will appear after the public Mapbox token is available to this deployment." : "No broader city or MSA rent is substituted. Choose another segment to see supported ZIP-level Trends IQ observations."}</p></div>
  </div>;
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--report-primary)]">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}

export function MarketIqRentMap({ points, benchmarks }: {
  points: MarketIqMapPoint[];
  benchmarks: MarketIqMarketCell[];
}) {
  const [segment, setSegment] = useState<Segment>(SEGMENTS[0]);
  const [selectedZip, setSelectedZip] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(!process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const filtered = useMemo(() => points.filter((point) =>
    point.propertyType === segment.propertyType &&
    point.bedrooms === segment.bedrooms &&
    point.status === "reportable" &&
    point.rent !== null
  ), [points, segment]);
  const ranked = useMemo(() => [...filtered].sort((a, b) =>
    Math.abs(b.yearOverYearPct ?? 0) - Math.abs(a.yearOverYearPct ?? 0) ||
    (b.observations - a.observations)
  ), [filtered]);
  const benchmark = benchmarks.find((cell) =>
    cell.geographyType === "msa" &&
    cell.propertyType === segment.propertyType &&
    cell.bedrooms === segment.bedrooms &&
    cell.status === "reportable"
  );
  const rents = filtered.map((point) => point.rent).filter((value): value is number => value !== null);
  const directional = filtered.filter((point) => point.yearOverYearPct !== null);
  const rising = directional.filter((point) => direction(point.yearOverYearPct) === "rising").length;
  const softening = directional.filter((point) => direction(point.yearOverYearPct) === "softening").length;
  const biggestMove = ranked.find((point) => point.yearOverYearPct !== null) ?? null;
  const selected = selectedZip ? filtered.find((point) => point.zip === selectedZip) ?? null : null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("market-iq-selected")) return;
    map.setFilter("market-iq-selected", selectedZip ? ["==", ["get", "zip"], selectedZip] : ["==", ["get", "zip"], ""]);
  }, [selectedZip]);

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
        const bounds = new mapboxgl.LngLatBounds();
        filtered.forEach((point) => bounds.extend([point.longitude, point.latitude]));
        const map = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/light-v11",
          bounds,
          fitBoundsOptions: { padding: 70, maxZoom: 10.4 },
          attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
        map.on("load", () => {
          map.addSource("market-iq-zips", { type: "geojson", data: featureCollection(filtered) });
          map.addLayer({
            id: "market-iq-bubbles", type: "circle", source: "market-iq-zips",
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["get", "observations"], 10, 22, 55, 38],
              "circle-color": ["match", ["get", "direction"], "rising", DIRECTION_COLORS.rising, "softening", DIRECTION_COLORS.softening, DIRECTION_COLORS.stable],
              "circle-opacity": 0.9,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 3,
            },
          });
          map.addLayer({
            id: "market-iq-selected", type: "circle", source: "market-iq-zips",
            filter: ["==", ["get", "zip"], ""],
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["get", "observations"], 10, 28, 55, 44],
              "circle-color": "rgba(255,255,255,0)",
              "circle-stroke-color": "#0f172a",
              "circle-stroke-width": 3,
            },
          });
          map.addLayer({
            id: "market-iq-labels", type: "symbol", source: "market-iq-zips",
            layout: {
              "text-field": ["format", ["get", "zip"], { "font-scale": 0.82 }, "\n", {}, ["get", "rentLabel"], { "font-scale": 1.05 }],
              "text-size": 12,
              "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
              "text-allow-overlap": true,
            },
            paint: { "text-color": "#ffffff", "text-halo-color": "rgba(15,23,42,0.22)", "text-halo-width": 0.5 },
          });
          const chooseZip = (event: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
            const zip = event.features?.[0]?.properties?.zip;
            if (typeof zip === "string") setSelectedZip(zip);
          };
          map.on("click", "market-iq-bubbles", chooseZip);
          map.on("click", "market-iq-labels", chooseZip);
          for (const layer of ["market-iq-bubbles", "market-iq-labels"]) {
            map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
            map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
          }
        });
        cleanup = () => { mapRef.current = null; map.remove(); };
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => { cancelled = true; cleanup?.(); };
  }, [filtered, unavailable]);

  function selectPoint(point: MarketIqMapPoint) {
    setSelectedZip(point.zip);
    mapRef.current?.easeTo({ center: [point.longitude, point.latitude], zoom: Math.max(mapRef.current.getZoom(), 10), duration: 500 });
  }

  return <div>
    <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Map segment">
      {SEGMENTS.map((option) => {
        const selectedOption = option.propertyType === segment.propertyType && option.bedrooms === segment.bedrooms;
        const available = points.some((point) => point.propertyType === option.propertyType && point.bedrooms === option.bedrooms && point.status === "reportable");
        return <button key={`${option.propertyType}:${option.bedrooms}`} type="button" onClick={() => { setSegment(option); setSelectedZip(null); }} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${selectedOption ? "border-transparent bg-[var(--report-primary)] text-white" : available ? "border-slate-200 bg-white text-slate-600 hover:border-slate-400" : "border-slate-100 bg-slate-50 text-slate-300"}`}>{option.label}</button>;
      })}
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Supported coverage" value={`${filtered.length} ZIPs`} detail={`${filtered.reduce((sum, point) => sum + point.observations, 0).toLocaleString("en-US")} Trends IQ observations`} />
      <Stat label="Asking-rent range" value={rents.length ? `${money(Math.min(...rents))}–${money(Math.max(...rents))}` : "Not published"} detail={benchmark?.rent ? `${money(benchmark.rent)} MSA median` : "MSA comparison unavailable"} />
      <Stat label="Local direction" value={`${rising} up · ${softening} down`} detail={`${directional.length} ZIPs with a YoY comparison`} />
      <Stat label="Biggest move" value={biggestMove ? percentage(biggestMove.yearOverYearPct) : "Not published"} detail={biggestMove ? `ZIP ${biggestMove.zip} · ${money(biggestMove.rent)}` : "No comparable prior-year sample"} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
      <div>{unavailable || filtered.length === 0 ? <MapFallback reason={unavailable ? "token" : "segment"} /> : <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-[0_20px_55px_rgba(15,23,42,0.08)]"><div ref={containerRef} className="h-[560px] w-full" role="img" aria-label={`ZIP-level asking rent map for ${segment.label}`} /><div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-white/70 bg-white/95 px-4 py-3 text-xs text-slate-600 shadow-sm backdrop-blur"><p><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#0f766e]" />Rising 1% or more</p><p className="mt-1.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#c2410c]" />Softening 1% or more</p><p className="mt-1.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-slate-500" />Within 1% or no YoY read</p><p className="mt-2 border-t border-slate-200 pt-2 text-[10px] text-slate-400">Bubble size reflects the latest Trends IQ sample.</p></div></div>}</div>

      <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="ZIP market ranking">
        <div className="border-b border-slate-100 px-5 py-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--report-accent)]">Watch first</p><h3 className="mt-1 text-lg font-semibold text-[var(--report-primary)]">Largest local moves</h3><p className="mt-1 text-xs leading-5 text-slate-500">Ranked by absolute year-over-year change. Select a row to locate it on the map.</p></div>
        <div className="max-h-[472px] overflow-y-auto p-2">
          {ranked.map((point, index) => {
            const relative = benchmark?.rent && point.rent ? ((point.rent / benchmark.rent) - 1) * 100 : null;
            const active = selected?.zip === point.zip;
            return <button key={point.zip} type="button" onClick={() => selectPoint(point)} className={`w-full rounded-xl px-3 py-3 text-left transition ${active ? "bg-slate-100 ring-1 ring-slate-300" : "hover:bg-slate-50"}`}>
              <div className="flex items-start gap-3"><span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-2"><span className="font-semibold text-slate-800">ZIP {point.zip}</span><span className="text-base font-semibold text-[var(--report-primary)]">{money(point.rent)}</span></div><div className="mt-1 flex items-center justify-between gap-2 text-xs"><span style={{ color: DIRECTION_COLORS[direction(point.yearOverYearPct)] }} className="font-bold">{point.yearOverYearPct === null ? "No YoY read" : `${percentage(point.yearOverYearPct)} YoY`}</span><span className="text-slate-400">N={point.observations}</span></div>{relative !== null && <p className="mt-1 text-[11px] text-slate-400">{Math.abs(relative) < 0.5 ? "In line with" : `${Math.abs(relative).toFixed(0)}% ${relative > 0 ? "above" : "below"}`} MSA median</p>}</div></div>
            </button>;
          })}
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] leading-5 text-slate-500">All prices and changes are Trends IQ statistics for the selected product. ZIPs below the sample threshold are withheld.</div>
      </aside>
    </div>
  </div>;
}
