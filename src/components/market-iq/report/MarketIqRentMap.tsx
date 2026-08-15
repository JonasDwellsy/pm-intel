"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { ExpressionSpecification, Map as MapboxMap } from "mapbox-gl";
import type {
  MarketIqListingEvent,
  MarketIqMapPoint,
  MarketIqMarketActivity,
  MarketIqMarketCell,
  MarketIqPropertyType,
  MarketIqTrendPoint,
} from "@/lib/market-iq/report/report";

type Segment = { propertyType: MarketIqPropertyType; bedrooms: number; label: string };
type Metric = "yoy" | "rent" | "benchmark";
type MapView = "published" | "msa";
type MapBounds = [[number, number], [number, number]];

const SEGMENTS: Segment[] = [
  { propertyType: "apartment", bedrooms: 1, label: "1-bed apartments" },
  { propertyType: "house", bedrooms: 3, label: "3-bed houses" },
];

const METRICS: Array<{ value: Metric; label: string }> = [
  { value: "yoy", label: "Rent direction" },
  { value: "rent", label: "Asking rent" },
  { value: "benchmark", label: "Versus MSA" },
];

const COLORS = { rising: "#147d75", stable: "#93a2b5", softening: "#cc5620", missing: "#e7eaed" } as const;
const CLEVELAND_MSA_BOUNDS: MapBounds = [[-82.50, 40.86], [-80.82, 41.88]];

function boundsForFeatures(features: FeatureCollection<Geometry, GeoJsonProperties>["features"]): MapBounds | null {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  const visit = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) return;
    if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
      west = Math.min(west, coordinates[0]);
      south = Math.min(south, coordinates[1]);
      east = Math.max(east, coordinates[0]);
      north = Math.max(north, coordinates[1]);
      return;
    }
    coordinates.forEach(visit);
  };
  features.forEach((feature) => {
    if (feature.geometry && "coordinates" in feature.geometry) visit(feature.geometry.coordinates);
  });
  return Number.isFinite(west) ? [[west, south], [east, north]] : null;
}

function money(value: number | null) {
  return value === null ? "Not published" : new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function percentage(value: number | null) {
  if (value === null) return "No YoY read";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function monthLabel(value: string | null) {
  if (!value) return "No supported month";
  return new Date(`${value.slice(0, 7)}-15T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function relative(point: MarketIqMapPoint, benchmark: MarketIqMarketCell | undefined) {
  if (!point.rent || !benchmark?.rent) return null;
  return ((point.rent / benchmark.rent) - 1) * 100;
}

function metricValue(point: MarketIqMapPoint, metric: Metric, benchmark: MarketIqMarketCell | undefined) {
  if (metric === "yoy") return point.yearOverYearPct;
  if (metric === "rent") return point.rent;
  if (metric === "benchmark") return relative(point, benchmark);
  return null;
}

function metricLabel(point: MarketIqMapPoint, metric: Metric, benchmark: MarketIqMarketCell | undefined) {
  const value = metricValue(point, metric, benchmark);
  if (value === null) return "Not published";
  if (metric === "rent") return money(value);
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function mapPaint(metric: Metric, min: number, max: number): ExpressionSpecification {
  if (metric === "yoy" || metric === "benchmark") return [
    "case",
    ["==", ["get", "coverageStatus"], "unavailable"], COLORS.missing,
    ["==", ["get", "supported"], false], "#d9dee4",
    ["interpolate", ["linear"], ["get", "metricValue"], -15, "#b84016", -5, "#e7956e", 0, "#e8e6df", 5, "#75bcb5", 15, "#08756e"],
  ] as ExpressionSpecification;
  const middle = min + (max - min) / 2;
  return [
    "case",
    ["==", ["get", "coverageStatus"], "unavailable"], COLORS.missing,
    ["==", ["get", "supported"], false], "#d9dee4",
    ["interpolate", ["linear"], ["get", "metricValue"], min, "#dbecef", middle, "#63a5ab", max, "#164d69"],
  ] as ExpressionSpecification;
}

function legend(metric: Metric, min: number, max: number) {
  if (metric === "yoy") return { left: "Softening", middle: "Stable", right: "Rising" };
  if (metric === "benchmark") return { left: "Below MSA", middle: "At MSA", right: "Above MSA" };
  if (metric === "rent") return { left: money(min), middle: money(min + (max - min) / 2), right: money(max) };
  return { left: money(min), middle: money(min + (max - min) / 2), right: money(max) };
}

function MapFallback({ tokenMissing }: { tokenMissing: boolean }) {
  return <div className="grid min-h-[570px] place-items-center rounded-2xl bg-[#edf1f2] p-8">
    <div className="max-w-md text-center">
      <p className="text-sm font-semibold text-slate-700">{tokenMissing ? "Map unavailable" : "No supported ZIP series for this segment"}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{tokenMissing
        ? "The analytical summary remains available. The shaded ZIP map will appear after the public Mapbox token is available."
        : "No broader city or MSA rent is substituted. Choose another benchmark segment to see supported ZIP-level Trends IQ observations."}</p>
    </div>
  </div>;
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--report-primary)]">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{detail}</p>
  </div>;
}

function TrendChart({ points }: { points: MarketIqTrendPoint[] }) {
  if (points.length < 2) return <div className="grid h-44 place-items-center rounded-2xl bg-slate-50 text-sm text-slate-400">Only the latest supported observation is available.</div>;
  const values = points.map((point) => point.rent);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const width = 620;
  const height = 190;
  const coords = points.map((point, index) => ({
    x: 28 + (index * (width - 56)) / Math.max(1, points.length - 1),
    y: 22 + ((max - point.rent) / range) * (height - 54),
    point,
  }));
  const path = coords.map((point) => `${point.x},${point.y}`).join(" ");
  return <div className="rounded-2xl bg-slate-50 px-3 pb-3 pt-4">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label="Twelve-month Trends IQ asking-rent trajectory">
      <line x1="28" y1={height - 22} x2={width - 28} y2={height - 22} stroke="#cbd5e1" strokeWidth="1" />
      <polyline points={path} fill="none" stroke="var(--report-accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map(({ x, y, point }, index) => <g key={point.month}>
        <circle cx={x} cy={y} r={index === coords.length - 1 ? 6 : 4} fill="var(--report-primary)" stroke="#fff" strokeWidth="2" />
        {(index === 0 || index === coords.length - 1) && <text x={x} y={Math.max(14, y - 12)} textAnchor={index === 0 ? "start" : "end"} fontSize="18" fontWeight="700" fill="#17324a">{money(point.rent)}</text>}
      </g>)}
    </svg>
    <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.11em] text-slate-400">
      <span>{monthLabel(points[0]?.month ?? null)}</span>
      <span>{points.length} monthly observations</span>
      <span>{monthLabel(points.at(-1)?.month ?? null)}</span>
    </div>
  </div>;
}

function ComparisonCard({ label, cell, selected }: { label: string; cell?: MarketIqMarketCell; selected?: MarketIqMapPoint }) {
  const rent = selected ? selected.rent : cell?.rent ?? null;
  const yoy = selected ? selected.yearOverYearPct : cell?.yearOverYearPct ?? null;
  const date = selected ? selected.month : cell?.month ?? null;
  const supported = selected ? selected.status === "reportable" : cell?.status === "reportable";
  return <div className={`rounded-2xl border p-4 ${supported ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50"}`}>
    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
    {supported ? <><div className="mt-2 flex items-baseline justify-between gap-3"><p className="text-2xl font-semibold text-[var(--report-primary)]">{money(rent)}</p><p className={`text-sm font-bold ${(yoy ?? 0) >= 1 ? "text-teal-700" : (yoy ?? 0) <= -1 ? "text-orange-700" : "text-slate-500"}`}>{percentage(yoy)}</p></div><p className="mt-2 text-xs text-slate-500">Trends IQ · {monthLabel(date)}</p></> : <p className="mt-3 text-sm leading-5 text-slate-500">No Trends IQ value is available</p>}
  </div>;
}

function eventLabel(event: MarketIqListingEvent) {
  const segment = `${event.bedrooms === 0 ? "Studio" : `${event.bedrooms}-bed`} ${event.propertyType}`;
  if (event.eventType === "price_change" && event.previousRent) return `${segment} changed from ${money(event.previousRent)} to ${money(event.askingRent)}`;
  return `New ${segment} listed at ${money(event.askingRent)}`;
}

function distanceMiles(a: MarketIqMapPoint, b: MarketIqMapPoint) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function interpretation(selected: MarketIqMapPoint, city: MarketIqMarketCell | undefined, msa: MarketIqMarketCell | undefined) {
  const direction = selected.yearOverYearPct === null
    ? "does not yet have a published year-over-year direction"
    : selected.yearOverYearPct >= 1
      ? "is moving higher"
      : selected.yearOverYearPct <= -1
        ? "is softening"
        : "is broadly stable";
  const versusMsa = selected.rent && msa?.rent
    ? selected.rent > msa.rent * 1.05
      ? "above"
      : selected.rent < msa.rent * 0.95
        ? "below"
        : "near"
    : null;
  const cityContext = city?.status === "reportable" && city.yearOverYearPct !== null
    ? ` Its primary municipality is at ${percentage(city.yearOverYearPct)} year over year for the same product.`
    : " The matching city Trends IQ value is unavailable, so the MSA is the broader comparison.";
  return `ZIP ${selected.zip} ${direction}${versusMsa ? ` and sits ${versusMsa} the current MSA asking-rent benchmark` : ""}.${cityContext} This is a market conversation prompt, not a property pricing recommendation.`;
}

function ZipDrilldown({
  selected,
  benchmark,
  cityCell,
  activity,
  nearby,
  onSelect,
}: {
  selected: MarketIqMapPoint;
  benchmark?: MarketIqMarketCell;
  cityCell?: MarketIqMarketCell;
  activity?: MarketIqMarketActivity;
  nearby: MarketIqMapPoint[];
  onSelect: (zip: string) => void;
}) {
  const events = activity?.events.filter((event) => event.zip === selected.zip).slice(0, 5) ?? [];
  return <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.07)]" aria-label={`ZIP ${selected.zip} market detail`}>
    <div className="grid gap-6 border-b border-slate-200 bg-[var(--report-primary)] px-6 py-7 text-white lg:grid-cols-[1fr_auto] lg:items-end">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Selected local market</p><h3 className="mt-2 text-3xl font-semibold">ZIP {selected.zip}</h3><p className="mt-2 text-sm text-white/70">{selected.primaryCity ? `Primary listing municipality: ${selected.primaryCity}` : "Municipality comparison unavailable"} · {selected.label}</p></div>
      <div className="flex gap-8"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">Asking rent</p><p className="mt-1 text-3xl font-semibold">{money(selected.rent)}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">YoY direction</p><p className="mt-1 text-3xl font-semibold">{percentage(selected.yearOverYearPct)}</p></div></div>
    </div>
    <div className="p-6 lg:p-8">
      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div><div className="mb-3 flex items-end justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--report-accent)]">Trajectory</p><h4 className="mt-1 text-xl font-semibold text-[var(--report-primary)]">Twelve-month asking-rent path</h4></div><p className="text-right text-xs text-slate-500">Trends IQ<br />{monthLabel(selected.month)}</p></div><TrendChart points={selected.series ?? []} /></div>
        <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--report-accent)]">Geographic context</p><h4 className="mt-1 text-xl font-semibold text-[var(--report-primary)]">Same product, three levels</h4><div className="mt-3 grid gap-3"><ComparisonCard label={`ZIP ${selected.zip}`} selected={selected} /><ComparisonCard label={selected.primaryCity ?? "Primary municipality"} cell={cityCell} /><ComparisonCard label="Cleveland-Elyria MSA" cell={benchmark} /></div></div>
      </div>
      <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_0.85fr_1fr]">
        <article className="rounded-2xl bg-[#eef5f5] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800">Owner conversation</p><p className="mt-3 text-sm leading-6 text-slate-700">{interpretation(selected, cityCell, benchmark)}</p></article>
        <article className="rounded-2xl border border-slate-200 p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Nearby supported ZIPs</p><div className="mt-3 space-y-2">{nearby.length ? nearby.map((point) => <button type="button" key={point.zip} onClick={() => onSelect(point.zip)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-slate-50"><span><strong className="text-sm text-slate-700">{point.zip}</strong><span className="ml-2 text-xs text-slate-400">{distanceMiles(selected, point).toFixed(1)} mi</span></span><span className="text-right text-xs font-semibold text-slate-600">{money(point.rent)}<br />{percentage(point.yearOverYearPct)}</span></button>) : <p className="text-sm text-slate-500">No nearby supported ZIPs for this product.</p>}</div></article>
        <article className="rounded-2xl border border-slate-200 p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Recent observed activity</p><div className="mt-3 space-y-3">{events.length ? events.map((event) => <div key={event.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0"><p className="text-sm font-semibold text-slate-700">{eventLabel(event)}</p><p className="mt-1 text-xs text-slate-400">{new Date(event.observedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" })}</p></div>) : <p className="text-sm leading-6 text-slate-500">No recent listing or confirmed price-change events appeared in the current source window for this ZIP.</p>}</div></article>
      </div>
    </div>
  </section>;
}

export function MarketIqRentMap({
  points,
  benchmarks,
  cityCells,
  activity,
}: {
  points: MarketIqMapPoint[];
  benchmarks: MarketIqMarketCell[];
  cityCells: MarketIqMarketCell[];
  activity?: MarketIqMarketActivity;
}) {
  const [segment, setSegment] = useState<Segment>(SEGMENTS[0]);
  const [metric, setMetric] = useState<Metric>("yoy");
  const [mapView, setMapView] = useState<MapView>("published");
  const [selectedZip, setSelectedZip] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const selectedZipRef = useRef<string | null>(null);
  const segmentPoints = useMemo(() => points.filter((point) =>
    point.propertyType === segment.propertyType &&
    point.bedrooms === segment.bedrooms
  ), [points, segment]);
  const filtered = useMemo(() => segmentPoints.filter((point) =>
    point.status === "reportable" &&
    point.rent !== null
  ), [segmentPoints]);
  const benchmark = benchmarks.find((cell) =>
    cell.geographyType === "msa" &&
    cell.propertyType === segment.propertyType &&
    cell.bedrooms === segment.bedrooms &&
    cell.status === "reportable"
  );
  const ranked = useMemo(() => [...filtered].sort((a, b) =>
    Math.abs(b.yearOverYearPct ?? 0) - Math.abs(a.yearOverYearPct ?? 0) ||
    b.observations - a.observations
  ), [filtered]);
  const values = filtered.map((point) => metricValue(point, metric, benchmark)).filter((value): value is number => value !== null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const selected = selectedZip ? filtered.find((point) => point.zip === selectedZip) ?? null : ranked[0] ?? null;
  const cityCell = selected?.primaryCity ? cityCells.find((cell) =>
    cell.geographyLabel === selected.primaryCity &&
    cell.propertyType === segment.propertyType &&
    cell.bedrooms === segment.bedrooms
  ) : undefined;
  const nearby = selected ? filtered.filter((point) => point.zip !== selected.zip)
    .sort((a, b) => distanceMiles(selected, a) - distanceMiles(selected, b))
    .slice(0, 3) : [];
  const rents = filtered.map((point) => point.rent).filter((value): value is number => value !== null);
  const rising = filtered.filter((point) => (point.yearOverYearPct ?? 0) >= 1).length;
  const softening = filtered.filter((point) => (point.yearOverYearPct ?? 0) <= -1).length;
  const legendLabels = legend(metric, min, max);
  const tokenMissing = !process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    selectedZipRef.current = selected?.zip ?? null;
    const map = mapRef.current;
    if (!map || !map.getLayer("market-iq-selected")) return;
    map.setFilter("market-iq-selected", selected ? ["==", ["get", "zip"], selected.zip] : ["==", ["get", "zip"], ""]);
  }, [selected]);

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
        const segmentPointByZip = new Map(segmentPoints.map((point) => [point.zip, point]));
        const joined: FeatureCollection<Geometry, GeoJsonProperties> = {
          ...boundaries,
          features: boundaries.features.map((feature) => {
            const zip = String(feature.properties?.ZCTA5 ?? feature.properties?.GEOID ?? "");
            const point = segmentPointByZip.get(zip);
            const reportablePoint = pointByZip.get(zip);
            const value = reportablePoint ? metricValue(reportablePoint, metric, benchmark) : null;
            const coverageStatus = reportablePoint ? "reportable" : "unavailable";
            return { ...feature, properties: {
              ...feature.properties,
              zip,
              supported: value !== null,
              coverageStatus,
              metricValue: value ?? 0,
              rent: reportablePoint?.rent ?? null,
              rentLabel: money(reportablePoint?.rent ?? null),
              yoy: reportablePoint?.yearOverYearPct ?? null,
              yoyLabel: percentage(reportablePoint?.yearOverYearPct ?? null),
              observations: point?.observations ?? 0,
            } };
          }),
        };
        const publishedBounds = boundsForFeatures(joined.features.filter((feature) => feature.properties?.supported === true));
        const initialBounds = mapView === "published" && publishedBounds ? publishedBounds : CLEVELAND_MSA_BOUNDS;
        const mapboxgl = mapboxModule.default;
        mapboxgl.accessToken = token;
        const map = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/light-v11",
          bounds: initialBounds,
          fitBoundsOptions: { padding: 62, maxZoom: 10.25 },
          attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
        map.on("load", () => {
          map.addSource("market-iq-zips", { type: "geojson", data: joined });
          map.addLayer({ id: "market-iq-fill", type: "fill", source: "market-iq-zips", paint: { "fill-color": mapPaint(metric, min, max), "fill-opacity": ["case", ["==", ["get", "supported"], true], 0.88, 0.3] } });
          map.addLayer({ id: "market-iq-lines", type: "line", source: "market-iq-zips", paint: { "line-color": ["case", ["==", ["get", "supported"], true], "#ffffff", "#cbd3db"], "line-width": ["case", ["==", ["get", "supported"], true], 1.7, 0.8], "line-opacity": 0.95 } });
          map.addLayer({ id: "market-iq-selected", type: "line", source: "market-iq-zips", filter: ["==", ["get", "zip"], selectedZipRef.current ?? ""], paint: { "line-color": "#0f172a", "line-width": 4 } });
          map.addLayer({ id: "market-iq-labels", type: "symbol", source: "market-iq-zips", filter: ["==", ["get", "supported"], true], layout: { "text-field": ["format", ["get", "zip"], { "font-scale": 0.88 }, "\n", {}, metric === "rent" ? ["get", "rentLabel"] : metric === "yoy" ? ["get", "yoyLabel"] : ["concat", ["to-string", ["round", ["get", "metricValue"]]], "%"], { "font-scale": 1.02 }], "text-size": 12, "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"], "text-allow-overlap": false, "text-padding": 8 }, paint: { "text-color": "#17324a", "text-halo-color": "rgba(255,255,255,0.92)", "text-halo-width": 1.6 } });
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
            detail.textContent = properties.supported
              ? `${properties.rentLabel} · ${properties.yoyLabel}`
              : "No Trends IQ value for this product";
            body.append(title, detail);
            popup.setLngLat(event.lngLat).setDOMContent(body).addTo(map);
          });
          map.on("mouseleave", "market-iq-fill", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
          map.on("click", "market-iq-fill", (event) => {
            const zip = event.features?.[0]?.properties?.zip;
            if (typeof zip === "string" && pointByZip.has(zip)) setSelectedZip(zip);
          });
        });
        cleanup = () => { mapRef.current = null; map.remove(); };
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    })();
    return () => { cancelled = true; cleanup?.(); };
  }, [benchmark, filtered, mapView, metric, min, max, segmentPoints]);

  return <div>
    <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Map segment">{SEGMENTS.map((option) => {
        const active = option.propertyType === segment.propertyType && option.bedrooms === segment.bedrooms;
        return <button key={`${option.propertyType}:${option.bedrooms}`} type="button" onClick={() => { setSegment(option); setSelectedZip(null); }} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? "border-transparent bg-[var(--report-primary)] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>{option.label}</button>;
      })}</div>
      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Map measure">{METRICS.map((option) => <button key={option.value} type="button" onClick={() => setMetric(option.value)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${metric === option.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{option.label}</button>)}</div>
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Published coverage" value={`${filtered.length} ZIPs`} detail="of 102 active Cleveland-Elyria postal ZIPs" />
      <Stat label="Asking-rent range" value={rents.length ? `${money(Math.min(...rents))} to ${money(Math.max(...rents))}` : "Not published"} detail={benchmark?.rent ? `${money(benchmark.rent)} MSA benchmark` : "MSA comparison unavailable"} />
      <Stat label="Local direction" value={`${rising} up · ${softening} down`} detail={`${filtered.length - rising - softening} within 1% or no YoY read`} />
      <Stat label="Benchmark month" value={monthLabel(benchmark?.month ?? null)} detail={`${segment.label} · Cleveland-Elyria MSA`} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div>{tokenMissing || mapFailed || filtered.length === 0
        ? <MapFallback tokenMissing={tokenMissing || mapFailed} />
        : <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-[0_20px_55px_rgba(15,23,42,0.08)]">
          <div ref={containerRef} className="h-[620px] w-full" role="img" aria-label={`Shaded ZIP-level map for ${segment.label}`} />
          <div className="absolute left-4 top-4 flex rounded-xl border border-white/80 bg-white/95 p-1 text-[11px] font-semibold text-slate-500 shadow-sm backdrop-blur" role="group" aria-label="Map extent">
            <button type="button" onClick={() => setMapView("published")} className={`rounded-lg px-3 py-2 transition ${mapView === "published" ? "bg-[var(--report-primary)] text-white" : "hover:bg-slate-100 hover:text-slate-800"}`}>Published ZIPs</button>
            <button type="button" onClick={() => setMapView("msa")} className={`rounded-lg px-3 py-2 transition ${mapView === "msa" ? "bg-[var(--report-primary)] text-white" : "hover:bg-slate-100 hover:text-slate-800"}`}>Full MSA</button>
          </div>
          <div className="pointer-events-none absolute bottom-4 left-4 w-[230px] rounded-xl border border-white/70 bg-white/95 px-4 py-3 text-xs text-slate-600 shadow-sm backdrop-blur">
            <div className="h-2.5 rounded-full" style={{ background: metric === "yoy" || metric === "benchmark" ? "linear-gradient(90deg,#b84016,#e8e6df,#08756e)" : "linear-gradient(90deg,#dbecef,#63a5ab,#164d69)" }} />
            <div className="mt-2 flex justify-between gap-2 text-[10px] font-semibold"><span>{legendLabels.left}</span><span>{legendLabels.middle}</span><span className="text-right">{legendLabels.right}</span></div>
            <div className="mt-2 border-t border-slate-200 pt-2 text-[10px] text-slate-500"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#e7eaed]" />No Trends IQ value</span></div>
            <p className="mt-2 text-[10px] leading-4 text-slate-400">Every available Trends IQ value is colored. Use Full MSA to see all 101 Census ZCTAs in the 102-ZIP market definition.</p>
          </div>
        </div>}</div>

      <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="ZIP market spotlights">
        <div className="border-b border-slate-100 px-5 py-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--report-accent)]">ZIPs to discuss</p><h3 className="mt-1 text-lg font-semibold text-[var(--report-primary)]">Largest supported moves</h3><p className="mt-1 text-xs leading-5 text-slate-500">Select a row or shaded area to open its full local read.</p></div>
        <div className="p-2">{ranked.slice(0, 5).map((point, index) => {
          const active = selected?.zip === point.zip;
          return <button key={point.zip} type="button" onClick={() => setSelectedZip(point.zip)} className={`w-full rounded-xl px-3 py-3 text-left transition ${active ? "bg-slate-100 ring-1 ring-slate-300" : "hover:bg-slate-50"}`}>
            <div className="flex items-start gap-3"><span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-2"><span className="font-semibold text-slate-800">ZIP {point.zip}</span><span className="text-base font-semibold text-[var(--report-primary)]">{money(point.rent)}</span></div><div className="mt-1 text-xs"><span className={`font-bold ${(point.yearOverYearPct ?? 0) >= 1 ? "text-teal-700" : (point.yearOverYearPct ?? 0) <= -1 ? "text-orange-700" : "text-slate-500"}`}>{percentage(point.yearOverYearPct)} YoY</span></div><p className="mt-1 text-[11px] text-slate-400">{metricLabel(point, metric, benchmark)} on selected map measure</p></div></div>
          </button>;
        })}</div>
        {selected && <div className="border-t border-slate-100 bg-slate-50 px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Selected area</p><p className="mt-1 font-semibold text-slate-800">ZIP {selected.zip} · {money(selected.rent)}</p><p className="mt-1 text-xs text-slate-500">{percentage(selected.yearOverYearPct)} YoY · {monthLabel(selected.month)}</p></div>}
        <div className="border-t border-slate-100 px-5 py-3 text-[11px] leading-5 text-slate-500">All displayed prices and changes are direct Trends IQ statistics for the selected product. If Trends IQ publishes a value, the map displays it.</div>
      </aside>
    </div>

    {selected && <ZipDrilldown selected={selected} benchmark={benchmark} cityCell={cityCell} activity={activity} nearby={nearby} onSelect={setSelectedZip} />}
  </div>;
}
