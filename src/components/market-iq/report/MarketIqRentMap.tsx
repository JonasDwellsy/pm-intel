"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { ExpressionSpecification, Map as MapboxMap } from "mapbox-gl";
import type { MarketIqMapPoint, MarketIqMarketCell, MarketIqPropertyType } from "@/lib/market-iq/report/report";

type Segment = { propertyType: MarketIqPropertyType; bedrooms: number; label: string };
type Metric = "yoy" | "rent" | "benchmark" | "sample";

const SEGMENTS: Segment[] = [
  { propertyType: "apartment", bedrooms: 1, label: "1-bed apartments" },
  { propertyType: "house", bedrooms: 3, label: "3-bed houses" },
];

const METRICS: Array<{ value: Metric; label: string }> = [
  { value: "yoy", label: "Rent direction" },
  { value: "rent", label: "Asking rent" },
  { value: "benchmark", label: "Versus MSA" },
  { value: "sample", label: "Sample strength" },
];

const COLORS = { rising: "#147d75", stable: "#93a2b5", softening: "#cc5620", missing: "#e7eaed" } as const;

function money(value: number | null) {
  return value === null ? "Not published" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function percentage(value: number | null) {
  if (value === null) return "No YoY read";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function relative(point: MarketIqMapPoint, benchmark: MarketIqMarketCell | undefined) {
  if (!point.rent || !benchmark?.rent) return null;
  return ((point.rent / benchmark.rent) - 1) * 100;
}

function metricValue(point: MarketIqMapPoint, metric: Metric, benchmark: MarketIqMarketCell | undefined) {
  if (metric === "yoy") return point.yearOverYearPct;
  if (metric === "rent") return point.rent;
  if (metric === "benchmark") return relative(point, benchmark);
  return point.observations;
}

function metricLabel(point: MarketIqMapPoint, metric: Metric, benchmark: MarketIqMarketCell | undefined) {
  const value = metricValue(point, metric, benchmark);
  if (value === null) return "Not published";
  if (metric === "rent") return money(value);
  if (metric === "sample") return `N=${Math.round(value)}`;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function mapPaint(metric: Metric, min: number, max: number): ExpressionSpecification {
  if (metric === "yoy" || metric === "benchmark") return [
    "case", ["==", ["get", "supported"], false], COLORS.missing,
    ["interpolate", ["linear"], ["get", "metricValue"], -15, "#b84016", -5, "#e7956e", 0, "#e8e6df", 5, "#75bcb5", 15, "#08756e"],
  ] as ExpressionSpecification;
  const middle = min + (max - min) / 2;
  return [
    "case", ["==", ["get", "supported"], false], COLORS.missing,
    ["interpolate", ["linear"], ["get", "metricValue"], min, "#dbecef", middle, "#63a5ab", max, "#164d69"],
  ] as ExpressionSpecification;
}

function legend(metric: Metric, min: number, max: number) {
  if (metric === "yoy") return { left: "Softening", middle: "Stable", right: "Rising" };
  if (metric === "benchmark") return { left: "Below MSA", middle: "At MSA", right: "Above MSA" };
  if (metric === "rent") return { left: money(min), middle: money(min + (max - min) / 2), right: money(max) };
  return { left: `N=${Math.round(min)}`, middle: "Sample", right: `N=${Math.round(max)}` };
}

function MapFallback({ tokenMissing }: { tokenMissing: boolean }) {
  return <div className="grid min-h-[570px] place-items-center rounded-2xl bg-[#edf1f2] p-8"><div className="max-w-md text-center"><p className="text-sm font-semibold text-slate-700">{tokenMissing ? "Map unavailable" : "No supported ZIP series for this segment"}</p><p className="mt-2 text-sm leading-6 text-slate-500">{tokenMissing ? "The analytical summary remains available. The shaded ZIP map will appear after the public Mapbox token is available." : "No broader city or MSA rent is substituted. Choose another benchmark segment to see supported ZIP-level Trends IQ observations."}</p></div></div>;
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--report-primary)]">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}

export function MarketIqRentMap({ points, benchmarks }: { points: MarketIqMapPoint[]; benchmarks: MarketIqMarketCell[] }) {
  const [segment, setSegment] = useState<Segment>(SEGMENTS[0]);
  const [metric, setMetric] = useState<Metric>("yoy");
  const [selectedZip, setSelectedZip] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const filtered = useMemo(() => points.filter((point) => point.propertyType === segment.propertyType && point.bedrooms === segment.bedrooms && point.status === "reportable" && point.rent !== null), [points, segment]);
  const benchmark = benchmarks.find((cell) => cell.geographyType === "msa" && cell.propertyType === segment.propertyType && cell.bedrooms === segment.bedrooms && cell.status === "reportable");
  const ranked = useMemo(() => [...filtered].sort((a, b) => Math.abs(b.yearOverYearPct ?? 0) - Math.abs(a.yearOverYearPct ?? 0) || b.observations - a.observations), [filtered]);
  const values = filtered.map((point) => metricValue(point, metric, benchmark)).filter((value): value is number => value !== null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const selected = selectedZip ? filtered.find((point) => point.zip === selectedZip) ?? null : null;
  const rents = filtered.map((point) => point.rent).filter((value): value is number => value !== null);
  const rising = filtered.filter((point) => (point.yearOverYearPct ?? 0) >= 1).length;
  const softening = filtered.filter((point) => (point.yearOverYearPct ?? 0) <= -1).length;
  const legendLabels = legend(metric, min, max);
  const tokenMissing = !process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("market-iq-selected")) return;
    map.setFilter("market-iq-selected", selectedZip ? ["==", ["get", "zip"], selectedZip] : ["==", ["get", "zip"], ""]);
  }, [selectedZip]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const container = containerRef.current;
    if (!token || !container || filtered.length === 0) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const [mapboxModule, boundaryResponse] = await Promise.all([import("mapbox-gl"), fetch("/data/cleveland-zcta.geojson")]);
        if (!boundaryResponse.ok) throw new Error("ZIP geometry unavailable");
        const boundaries = await boundaryResponse.json() as FeatureCollection<Geometry, GeoJsonProperties>;
        if (cancelled) return;
        const pointByZip = new Map(filtered.map((point) => [point.zip, point]));
        const joined: FeatureCollection<Geometry, GeoJsonProperties> = {
          ...boundaries,
          features: boundaries.features.map((feature) => {
            const zip = String(feature.properties?.ZCTA5 ?? feature.properties?.GEOID ?? "");
            const point = pointByZip.get(zip);
            const value = point ? metricValue(point, metric, benchmark) : null;
            return { ...feature, properties: { ...feature.properties, zip, supported: value !== null, metricValue: value ?? 0, rent: point?.rent ?? null, rentLabel: money(point?.rent ?? null), yoy: point?.yearOverYearPct ?? null, yoyLabel: percentage(point?.yearOverYearPct ?? null), observations: point?.observations ?? 0, month: point?.month ?? null } };
          }),
        };
        const mapboxgl = mapboxModule.default;
        mapboxgl.accessToken = token;
        const map = new mapboxgl.Map({ container, style: "mapbox://styles/mapbox/light-v11", bounds: [[-82.26, 41.32], [-81.34, 41.78]], fitBoundsOptions: { padding: 38 }, attributionControl: false });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
        map.on("load", () => {
          map.addSource("market-iq-zips", { type: "geojson", data: joined });
          map.addLayer({ id: "market-iq-fill", type: "fill", source: "market-iq-zips", paint: { "fill-color": mapPaint(metric, min, max), "fill-opacity": ["case", ["==", ["get", "supported"], true], 0.84, 0.4] } });
          map.addLayer({ id: "market-iq-lines", type: "line", source: "market-iq-zips", paint: { "line-color": "#ffffff", "line-width": 1.5, "line-opacity": 0.95 } });
          map.addLayer({ id: "market-iq-selected", type: "line", source: "market-iq-zips", filter: ["==", ["get", "zip"], ""], paint: { "line-color": "#0f172a", "line-width": 4 } });
          map.addLayer({ id: "market-iq-labels", type: "symbol", source: "market-iq-zips", filter: ["==", ["get", "supported"], true], layout: { "text-field": ["format", ["get", "zip"], { "font-scale": 0.88 }, "\n", {}, metric === "rent" ? ["get", "rentLabel"] : metric === "sample" ? ["concat", "N=", ["to-string", ["get", "observations"]]] : metric === "yoy" ? ["get", "yoyLabel"] : ["concat", ["to-string", ["round", ["get", "metricValue"]]], "%"], { "font-scale": 1.02 }], "text-size": 12, "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"], "text-allow-overlap": false, "text-padding": 8 }, paint: { "text-color": "#17324a", "text-halo-color": "rgba(255,255,255,0.92)", "text-halo-width": 1.6 } });
          const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
          map.on("mousemove", "market-iq-fill", (event) => {
            map.getCanvas().style.cursor = "pointer";
            const properties = event.features?.[0]?.properties;
            if (!properties?.zip) return;
            const body = document.createElement("div");
            body.className = "px-1 py-0.5 text-sm";
            const title = document.createElement("strong");
            title.textContent = `ZIP ${properties.zip}`;
            const detail = document.createElement("div");
            detail.textContent = properties.supported ? `${properties.rentLabel} · ${properties.yoyLabel} · N=${properties.observations}` : "Below the reporting threshold";
            body.append(title, detail);
            popup.setLngLat(event.lngLat).setDOMContent(body).addTo(map);
          });
          map.on("mouseleave", "market-iq-fill", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
          map.on("click", "market-iq-fill", (event) => { const zip = event.features?.[0]?.properties?.zip; if (typeof zip === "string" && pointByZip.has(zip)) setSelectedZip(zip); });
        });
        cleanup = () => { mapRef.current = null; map.remove(); };
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    })();
    return () => { cancelled = true; cleanup?.(); };
  }, [benchmark, filtered, metric, min, max]);

  return <div>
    <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="flex flex-wrap gap-2" role="group" aria-label="Map segment">{SEGMENTS.map((option) => { const active = option.propertyType === segment.propertyType && option.bedrooms === segment.bedrooms; return <button key={`${option.propertyType}:${option.bedrooms}`} type="button" onClick={() => { setSegment(option); setSelectedZip(null); }} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? "border-transparent bg-[var(--report-primary)] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>{option.label}</button>; })}</div><div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Map measure">{METRICS.map((option) => <button key={option.value} type="button" onClick={() => setMetric(option.value)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${metric === option.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{option.label}</button>)}</div></div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Supported coverage" value={`${filtered.length} ZIPs`} detail={`${filtered.reduce((sum, point) => sum + point.observations, 0).toLocaleString("en-US")} Trends IQ observations`} /><Stat label="Asking-rent range" value={rents.length ? `${money(Math.min(...rents))} to ${money(Math.max(...rents))}` : "Not published"} detail={benchmark?.rent ? `${money(benchmark.rent)} MSA benchmark` : "MSA comparison unavailable"} /><Stat label="Local direction" value={`${rising} up · ${softening} down`} detail={`${filtered.length - rising - softening} within 1% or no YoY read`} /><Stat label="Benchmark month" value={benchmark?.month ? new Date(benchmark.month).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "Not published"} detail={`${segment.label} · MSA N=${benchmark?.observations ?? 0}`} /></div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div>{tokenMissing || mapFailed || filtered.length === 0 ? <MapFallback tokenMissing={tokenMissing || mapFailed} /> : <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-[0_20px_55px_rgba(15,23,42,0.08)]"><div ref={containerRef} className="h-[620px] w-full" role="img" aria-label={`Shaded ZIP-level map for ${segment.label}`} /><div className="pointer-events-none absolute bottom-4 left-4 w-[230px] rounded-xl border border-white/70 bg-white/95 px-4 py-3 text-xs text-slate-600 shadow-sm backdrop-blur"><div className="h-2.5 rounded-full" style={{ background: metric === "yoy" || metric === "benchmark" ? "linear-gradient(90deg,#b84016,#e8e6df,#08756e)" : "linear-gradient(90deg,#dbecef,#63a5ab,#164d69)" }} /><div className="mt-2 flex justify-between gap-2 text-[10px] font-semibold"><span>{legendLabels.left}</span><span>{legendLabels.middle}</span><span className="text-right">{legendLabels.right}</span></div><p className="mt-2 border-t border-slate-200 pt-2 text-[10px] leading-4 text-slate-400">Gray areas are below the Trends IQ reporting threshold. Boundaries are Census ZCTAs, an approximation of ZIP delivery areas.</p></div></div>}</div>

      <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="ZIP market spotlights"><div className="border-b border-slate-100 px-5 py-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--report-accent)]">ZIPs to discuss</p><h3 className="mt-1 text-lg font-semibold text-[var(--report-primary)]">Largest supported moves</h3><p className="mt-1 text-xs leading-5 text-slate-500">A short attention list replaces the full ZIP card grid. Select a row to highlight its area.</p></div><div className="p-2">{ranked.slice(0, 5).map((point, index) => { const active = selected?.zip === point.zip; return <button key={point.zip} type="button" onClick={() => setSelectedZip(point.zip)} className={`w-full rounded-xl px-3 py-3 text-left transition ${active ? "bg-slate-100 ring-1 ring-slate-300" : "hover:bg-slate-50"}`}><div className="flex items-start gap-3"><span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-2"><span className="font-semibold text-slate-800">ZIP {point.zip}</span><span className="text-base font-semibold text-[var(--report-primary)]">{money(point.rent)}</span></div><div className="mt-1 flex items-center justify-between gap-2 text-xs"><span className={`font-bold ${(point.yearOverYearPct ?? 0) >= 1 ? "text-teal-700" : (point.yearOverYearPct ?? 0) <= -1 ? "text-orange-700" : "text-slate-500"}`}>{percentage(point.yearOverYearPct)} YoY</span><span className="text-slate-400">N={point.observations}</span></div><p className="mt-1 text-[11px] text-slate-400">{metricLabel(point, metric, benchmark)} on selected map measure</p></div></div></button>; })}</div>{selected && <div className="border-t border-slate-100 bg-slate-50 px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Selected area</p><p className="mt-1 font-semibold text-slate-800">ZIP {selected.zip} · {money(selected.rent)}</p><p className="mt-1 text-xs text-slate-500">{percentage(selected.yearOverYearPct)} YoY · N={selected.observations}</p></div>}<div className="border-t border-slate-100 px-5 py-3 text-[11px] leading-5 text-slate-500">All displayed prices and changes are direct Trends IQ statistics for the selected product. Thin ZIP cells are withheld.</div></aside>
    </div>
  </div>;
}
