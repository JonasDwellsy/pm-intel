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

export type MarketIqMapSegment = { propertyType: MarketIqPropertyType; bedrooms: number; label: string };
type Metric = "yoy" | "rent";
type DirectionBand = "rising" | "holding" | "softening" | "unavailable";
type MapBounds = [[number, number], [number, number]];

const DEFAULT_SEGMENTS: MarketIqMapSegment[] = [
  { propertyType: "apartment", bedrooms: 1, label: "1-bed apartments" },
  { propertyType: "house", bedrooms: 3, label: "3-bed houses" },
];

const METRICS: Array<{ value: Metric; label: string; description: string }> = [
  { value: "rent", label: "Asking rent", description: "Broadest published coverage" },
  { value: "yoy", label: "Annual direction", description: "Where a year-over-year read exists" },
];

const COLORS = { rising: "#147d75", stable: "#d7ab55", softening: "#cc5620", rentOnly: "#8b9bb5", missing: "#edf1f5" } as const;

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

function directionBand(value: number | null): DirectionBand {
  if (value === null) return "unavailable";
  if (Math.abs(value) < 3) return "holding";
  return value > 0 ? "rising" : "softening";
}

function directionLabel(value: number | null) {
  const band = directionBand(value);
  return band === "rising" ? "Rising" : band === "softening" ? "Softening" : band === "holding" ? "Holding steady" : "Direction unavailable";
}

function monthLabel(value: string | null) {
  if (!value) return "No supported month";
  return new Date(`${value.slice(0, 7)}-15T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function metricValue(point: MarketIqMapPoint, metric: Metric) {
  if (metric === "yoy") return point.yearOverYearPct;
  if (metric === "rent") return point.rent;
  return null;
}

function mapPaint(metric: Metric, min: number, max: number): ExpressionSpecification {
  if (metric === "yoy") return [
    "case",
    ["==", ["get", "rentAvailable"], false], COLORS.missing,
    ["==", ["get", "directionAvailable"], false], COLORS.rentOnly,
    ["<=", ["get", "metricValue"], -3], COLORS.softening,
    [">=", ["get", "metricValue"], 3], COLORS.rising,
    COLORS.stable,
  ] as ExpressionSpecification;
  const middle = min + (max - min) / 2;
  return [
    "case",
    ["==", ["get", "rentAvailable"], false], COLORS.missing,
    ["interpolate", ["linear"], ["get", "metricValue"], min, "#dbecef", middle, "#63a5ab", max, "#164d69"],
  ] as ExpressionSpecification;
}

function legend(metric: Metric, min: number, max: number) {
  if (metric === "yoy") return { left: "Softening", middle: "Holding steady", right: "Rising" };
  if (metric === "rent") return { left: money(min), middle: money(min + (max - min) / 2), right: money(max) };
  return { left: money(min), middle: money(min + (max - min) / 2), right: money(max) };
}

function MapFallback({ tokenMissing }: { tokenMissing: boolean }) {
  return <div className="grid min-h-[570px] place-items-center rounded-2xl bg-[#edf1f2] p-8">
    <div className="max-w-md text-center">
      <p className="text-sm font-semibold text-slate-700">{tokenMissing ? "Map unavailable" : "No published ZIP asking-rent values for this segment"}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{tokenMissing
        ? "The analytical summary remains available. The shaded ZIP map will appear after the public Mapbox token is available."
        : "No broader city or MSA rent is substituted. Choose another benchmark segment to see ZIP-level asking-rent values."}</p>
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

function smoothPath(coords: Array<{ x: number; y: number }>) {
  if (coords.length < 2) return "";
  return coords.slice(1).reduce((path, point, index) => {
    const previous = coords[index];
    const midpoint = (previous.x + point.x) / 2;
    return `${path} C ${midpoint},${previous.y} ${midpoint},${point.y} ${point.x},${point.y}`;
  }, `M ${coords[0].x},${coords[0].y}`);
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
  const mid = min + range / 2;
  return <div className="rounded-2xl bg-slate-50 px-3 pb-3 pt-4">
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label="Three-year asking-rent trajectory with dollar scale">
      {[{ y: 22, value: max }, { y: 22 + (height - 54) / 2, value: mid }, { y: height - 32, value: min }].map((line) => <g key={line.y}><line x1="28" y1={line.y} x2={width - 28} y2={line.y} stroke="#dbe4eb" strokeWidth="1" /><text x={width - 30} y={line.y - 4} textAnchor="end" fontSize="11" fill="#8190a3">{money(line.value)}</text></g>)}
      <path d={smoothPath(coords)} fill="none" stroke="var(--report-accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map(({ x, y, point }, index) => <g key={point.month}>
        <circle cx={x} cy={y} r={index === coords.length - 1 ? 6 : 4} fill="var(--report-primary)" stroke="#fff" strokeWidth="2" />
        {(index === 0 || index === coords.length - 1) && <text x={x} y={Math.max(14, y - 12)} textAnchor={index === 0 ? "start" : "end"} fontSize="18" fontWeight="700" fill="#17324a">{money(point.rent)}</text>}
      </g>)}
    </svg>
    <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.11em] text-slate-400">
      <span>{monthLabel(points[0]?.month ?? null)}</span>
      <span>{points.length} monthly observations · smoothed display</span>
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
    {supported ? <><div className="mt-2 flex items-baseline justify-between gap-3"><p className="text-2xl font-semibold text-[var(--report-primary)]">{money(rent)}</p><p className={`text-sm font-bold ${directionBand(yoy) === "rising" ? "text-teal-700" : directionBand(yoy) === "softening" ? "text-orange-700" : "text-slate-500"}`}>{directionLabel(yoy)}</p></div><p className="mt-2 text-xs text-slate-500">Asking-rent data · {monthLabel(date)}</p></> : <p className="mt-3 text-sm leading-5 text-slate-500">No published asking rent is available</p>}
  </div>;
}

function eventLabel(event: MarketIqListingEvent) {
  const segment = `${event.bedrooms === 0 ? "Studio" : `${event.bedrooms}-bed`} ${event.propertyType}`;
  if (event.eventType === "price_change" && event.previousRent) return `${segment} changed from ${money(event.previousRent)} to ${money(event.askingRent)}`;
  if (event.eventType === "delisting") return `${segment} went off market at a last asking rent of ${money(event.askingRent)}`;
  if (event.eventType === "aging_threshold") return `${segment} reached ${event.listingAgeDays} days live at ${money(event.askingRent)} asking rent`;
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
  const direction = directionBand(selected.yearOverYearPct) === "rising"
    ? "has a rising annual direction"
    : directionBand(selected.yearOverYearPct) === "softening"
      ? "has a softening annual direction"
      : directionBand(selected.yearOverYearPct) === "holding"
        ? "is holding broadly steady"
        : "has a published asking rent, but no annual direction is available";
  const versusMsa = selected.rent && msa?.rent
    ? selected.rent > msa.rent * 1.05
      ? "above"
      : selected.rent < msa.rent * 0.95
        ? "below"
        : "near"
    : null;
  const cityContext = city?.status === "reportable" && city.yearOverYearPct !== null
    ? ` Its primary municipality is also ${directionLabel(city.yearOverYearPct).toLowerCase()} for the same product.`
    : "";
  return `ZIP ${selected.zip} ${direction}${versusMsa ? ` and sits ${versusMsa} the current MSA asking-rent benchmark` : ""}.${cityContext} Property pricing should also account for condition, amenities, unit mix, and current availability.`;
}

function ZipDrilldown({
  selected,
  benchmark,
  cityCell,
  activity,
  nearby,
  onSelect,
  marketName,
  timeZone,
}: {
  selected: MarketIqMapPoint;
  benchmark?: MarketIqMarketCell;
  cityCell?: MarketIqMarketCell;
  activity?: MarketIqMarketActivity;
  nearby: MarketIqMapPoint[];
  onSelect: (zip: string) => void;
  marketName: string;
  timeZone: string;
}) {
  const events = activity?.events.filter((event) => event.zip === selected.zip).slice(0, 5) ?? [];
  return <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.07)]" aria-label={`ZIP ${selected.zip} market detail`}>
    <div className="grid gap-6 border-b border-slate-200 bg-[var(--report-primary)] px-6 py-7 text-white lg:grid-cols-[1fr_auto] lg:items-end">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Local example with complete context</p><h3 className="mt-2 text-3xl font-semibold">ZIP {selected.zip}</h3><p className="mt-2 text-sm text-white/70">{selected.primaryCity} · {selected.label}</p></div>
      <div className="flex gap-8"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">Asking rent</p><p className="mt-1 text-3xl font-semibold">{money(selected.rent)}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">Annual direction</p><p className="mt-1 text-2xl font-semibold">{directionLabel(selected.yearOverYearPct)}</p></div></div>
    </div>
    <div className="p-6 lg:p-8">
      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div><div className="mb-3 flex items-end justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--report-accent)]">Longer view</p><h4 className="mt-1 text-xl font-semibold text-[var(--report-primary)]">Three-year asking-rent path</h4></div><p className="text-right text-xs text-slate-500">{selected.series?.length ?? 0} published months<br />through {monthLabel(selected.month)}</p></div><TrendChart points={selected.series ?? []} /></div>
        <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--report-accent)]">Geographic context</p><h4 className="mt-1 text-xl font-semibold text-[var(--report-primary)]">Same product, three levels</h4><div className="mt-3 grid gap-3"><ComparisonCard label={`ZIP ${selected.zip}`} selected={selected} /><ComparisonCard label={selected.primaryCity ?? "Primary municipality"} cell={cityCell} /><ComparisonCard label={marketName} cell={benchmark} /></div></div>
      </div>
      <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_0.85fr_1fr]">
        <article className="rounded-2xl bg-[#eef5f5] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800">Local context</p><p className="mt-3 text-sm leading-6 text-slate-700">{interpretation(selected, cityCell, benchmark)}</p></article>
        <article className="rounded-2xl border border-slate-200 p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Nearby ZIPs with complete context</p><div className="mt-3 space-y-2">{nearby.length ? nearby.map((point) => <button type="button" key={point.zip} onClick={() => onSelect(point.zip)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-slate-50"><span><strong className="text-sm text-slate-700">{point.zip}</strong><span className="ml-2 text-xs text-slate-400">{distanceMiles(selected, point).toFixed(1)} mi</span></span><span className="text-right text-xs font-semibold text-slate-600">{money(point.rent)}<br />{directionLabel(point.yearOverYearPct)}</span></button>) : <p className="text-sm text-slate-500">No nearby ZIP has a complete local comparison for this product.</p>}</div></article>
        <article className="rounded-2xl border border-slate-200 p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Recent observed activity</p><div className="mt-3 space-y-3">{events.length ? events.map((event) => <div key={event.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0"><p className="text-sm font-semibold text-slate-700">{eventLabel(event)}</p><p className="mt-1 text-xs text-slate-400">{new Date(event.observedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" })}</p></div>) : <p className="text-sm leading-6 text-slate-500">No recent listing, asking-rent-change, or delisting events appeared in the current source window for this ZIP.</p>}</div></article>
      </div>
    </div>
  </section>;
}

export function MarketIqRentMap({
  points,
  benchmarks,
  cityCells,
  activity,
  segments = DEFAULT_SEGMENTS,
  marketName,
  timeZone,
  boundaryUrl,
}: {
  points: MarketIqMapPoint[];
  benchmarks: MarketIqMarketCell[];
  cityCells: MarketIqMarketCell[];
  activity?: MarketIqMarketActivity;
  segments?: MarketIqMapSegment[];
  marketName: string;
  timeZone: string;
  boundaryUrl: string;
}) {
  const [segment, setSegment] = useState<MarketIqMapSegment>(segments[0] ?? DEFAULT_SEGMENTS[0]);
  const [metric, setMetric] = useState<Metric>("rent");
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
  const completePoints = useMemo(() => filtered.filter((point) => {
    if (!point.primaryCity || !benchmark?.rent) return false;
    const matchingCity = cityCells.find((cell) =>
      cell.geographyLabel === point.primaryCity &&
      cell.propertyType === segment.propertyType &&
      cell.bedrooms === segment.bedrooms &&
      cell.status === "reportable" &&
      cell.rent !== null
    );
    return Boolean(matchingCity && (point.series?.length ?? 0) >= 2);
  }), [benchmark?.rent, cityCells, filtered, segment]);
  const ranked = useMemo(() => {
    const ordered = [...completePoints].sort((a, b) => (a.rent ?? 0) - (b.rent ?? 0));
    if (ordered.length <= 5) return ordered;
    return [0.1, 0.3, 0.5, 0.7, 0.9].map((quantile) => ordered[Math.round((ordered.length - 1) * quantile)]);
  }, [completePoints]);
  const values = filtered.map((point) => metricValue(point, metric)).filter((value): value is number => value !== null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const selected = selectedZip ? completePoints.find((point) => point.zip === selectedZip) ?? null : ranked[Math.floor(ranked.length / 2)] ?? null;
  const cityCell = selected?.primaryCity ? cityCells.find((cell) =>
    cell.geographyLabel === selected.primaryCity &&
    cell.propertyType === segment.propertyType &&
    cell.bedrooms === segment.bedrooms
  ) : undefined;
  const nearby = selected ? completePoints.filter((point) => point.zip !== selected.zip)
    .sort((a, b) => distanceMiles(selected, a) - distanceMiles(selected, b))
    .slice(0, 3) : [];
  const rents = filtered.map((point) => point.rent).filter((value): value is number => value !== null);
  const directionPoints = filtered.filter((point) => point.yearOverYearPct !== null);
  const rising = directionPoints.filter((point) => directionBand(point.yearOverYearPct) === "rising").length;
  const softening = directionPoints.filter((point) => directionBand(point.yearOverYearPct) === "softening").length;
  const holding = directionPoints.length - rising - softening;
  const directionMissing = filtered.length - directionPoints.length;
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
        const [mapboxModule, boundaryResponse] = await Promise.all([import("mapbox-gl"), fetch(boundaryUrl)]);
        if (!boundaryResponse.ok) throw new Error("ZIP geometry unavailable");
        const boundaries = await boundaryResponse.json() as FeatureCollection<Geometry, GeoJsonProperties>;
        if (cancelled) return;
        const pointByZip = new Map(filtered.map((point) => [point.zip, point]));
        const completePointByZip = new Map(completePoints.map((point) => [point.zip, point]));
        const segmentPointByZip = new Map(segmentPoints.map((point) => [point.zip, point]));
        const joined: FeatureCollection<Geometry, GeoJsonProperties> = {
          ...boundaries,
          features: boundaries.features.map((feature) => {
            const zip = String(feature.properties?.ZCTA5 ?? feature.properties?.GEOID ?? "");
            const point = segmentPointByZip.get(zip);
            const reportablePoint = pointByZip.get(zip);
            const value = reportablePoint ? metricValue(reportablePoint, metric) : null;
            const rentAvailable = reportablePoint?.rent !== null && reportablePoint?.rent !== undefined;
            const directionAvailable = rentAvailable && reportablePoint?.yearOverYearPct !== null && reportablePoint?.yearOverYearPct !== undefined;
            return { ...feature, properties: {
              ...feature.properties,
              zip,
              supported: metric === "rent" ? rentAvailable : directionAvailable,
              rentAvailable,
              directionAvailable,
              metricValue: value ?? 0,
              rent: reportablePoint?.rent ?? null,
              rentLabel: money(reportablePoint?.rent ?? null),
              yoy: reportablePoint?.yearOverYearPct ?? null,
              yoyLabel: percentage(reportablePoint?.yearOverYearPct ?? null),
              directionLabel: directionLabel(reportablePoint?.yearOverYearPct ?? null),
              spotlightEligible: completePointByZip.has(zip),
              observations: point?.observations ?? 0,
            } };
          }),
        };
        const marketBounds = boundsForFeatures(joined.features);
        if (!marketBounds) throw new Error("ZIP geometry has no usable bounds");
        const mapboxgl = mapboxModule.default;
        mapboxgl.accessToken = token;
        const map = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/light-v11",
          bounds: marketBounds,
          fitBoundsOptions: { padding: 62, maxZoom: 10.25 },
          attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
        map.on("load", () => {
          map.addSource("market-iq-zips", { type: "geojson", data: joined });
          map.addLayer({ id: "market-iq-fill", type: "fill", source: "market-iq-zips", paint: { "fill-color": mapPaint(metric, min, max), "fill-opacity": ["case", ["==", ["get", "rentAvailable"], true], 0.88, 0.34] } });
          map.addLayer({ id: "market-iq-lines", type: "line", source: "market-iq-zips", paint: { "line-color": ["case", ["==", ["get", "rentAvailable"], true], "#ffffff", "#cbd3db"], "line-width": ["case", ["==", ["get", "rentAvailable"], true], 1.7, 0.8], "line-opacity": 0.95 } });
          map.addLayer({ id: "market-iq-selected", type: "line", source: "market-iq-zips", filter: ["==", ["get", "zip"], selectedZipRef.current ?? ""], paint: { "line-color": "#0f172a", "line-width": 4 } });
          map.addLayer({ id: "market-iq-labels", type: "symbol", source: "market-iq-zips", filter: ["==", ["get", "rentAvailable"], true], layout: { "text-field": ["format", ["get", "zip"], { "font-scale": 0.88 }, "\n", {}, metric === "rent" ? ["get", "rentLabel"] : ["case", ["==", ["get", "directionAvailable"], true], ["get", "directionLabel"], "Rent published"], { "font-scale": 0.92 }], "text-size": 11, "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"], "text-allow-overlap": false, "text-padding": 8 }, paint: { "text-color": "#17324a", "text-halo-color": "rgba(255,255,255,0.92)", "text-halo-width": 1.6 } });
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
            detail.textContent = !properties.rentAvailable
              ? "No published asking rent for this product"
              : metric === "yoy" && !properties.directionAvailable
                ? `${properties.rentLabel} asking rent · annual direction unavailable`
                : `${properties.rentLabel} · ${properties.directionLabel}`;
            body.append(title, detail);
            popup.setLngLat(event.lngLat).setDOMContent(body).addTo(map);
          });
          map.on("mouseleave", "market-iq-fill", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
          map.on("click", "market-iq-fill", (event) => {
            const zip = event.features?.[0]?.properties?.zip;
            if (typeof zip === "string" && completePointByZip.has(zip)) setSelectedZip(zip);
          });
        });
        cleanup = () => { mapRef.current = null; map.remove(); };
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    })();
    return () => { cancelled = true; cleanup?.(); };
  }, [boundaryUrl, completePoints, filtered, metric, min, max, segmentPoints]);

  return <div>
    <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Map segment">{segments.map((option) => {
        const active = option.propertyType === segment.propertyType && option.bedrooms === segment.bedrooms;
        return <button key={`${option.propertyType}:${option.bedrooms}`} type="button" onClick={() => { setSegment(option); setSelectedZip(null); }} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? "border-transparent bg-[var(--report-primary)] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>{option.label}</button>;
      })}</div>
      <div className="w-full rounded-2xl bg-slate-100 p-1.5 sm:w-[430px]" role="group" aria-label="Map color">
        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Map color</p>
        <div className="grid grid-cols-2 gap-1">{METRICS.map((option) => <button key={option.value} type="button" aria-pressed={metric === option.value} onClick={() => setMetric(option.value)} className={`rounded-xl px-3 py-2 text-left transition ${metric === option.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60 hover:text-slate-800"}`}><span className="block text-xs font-semibold">{option.label}</span><span className="mt-0.5 block text-[10px] leading-4">{option.description}</span></button>)}</div>
      </div>
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Market pattern" value={`${rising} rising · ${softening} softening`} detail={`${holding} holding steady${directionMissing ? ` · ${directionMissing} rent-only ZIPs` : ""}`} />
      <Stat label="Asking-rent range" value={rents.length ? `${money(Math.min(...rents))} to ${money(Math.max(...rents))}` : "Not published"} detail={benchmark?.rent ? `${money(benchmark.rent)} MSA benchmark` : "MSA comparison unavailable"} />
      <Stat label="MSA asking rent" value={money(benchmark?.rent ?? null)} detail={`${directionLabel(benchmark?.yearOverYearPct ?? null)} for the selected product`} />
      <Stat label="Benchmark month" value={monthLabel(benchmark?.month ?? null)} detail={`${segment.label} · ${marketName}`} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div>{tokenMissing || mapFailed || filtered.length === 0
        ? <MapFallback tokenMissing={tokenMissing || mapFailed} />
        : <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-[0_20px_55px_rgba(15,23,42,0.08)]">
          <div ref={containerRef} className="h-[620px] w-full" role="img" aria-label={`Shaded ZIP-level map for ${segment.label}`} />
          <div className="pointer-events-none absolute bottom-4 left-4 w-[230px] rounded-xl border border-white/70 bg-white/95 px-4 py-3 text-xs text-slate-600 shadow-sm backdrop-blur">
            <div className="h-2.5 rounded-full" style={{ background: metric === "yoy" ? `linear-gradient(90deg,${COLORS.softening},${COLORS.stable},${COLORS.rising})` : "linear-gradient(90deg,#dbecef,#63a5ab,#164d69)" }} />
            <div className="mt-2 flex justify-between gap-2 text-[10px] font-semibold"><span>{legendLabels.left}</span><span>{legendLabels.middle}</span><span className="text-right">{legendLabels.right}</span></div>
            <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-[10px] text-slate-500">{metric === "yoy" && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#8b9bb5]" />Asking rent published, annual direction unavailable</span>}<span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#edf1f5]" />No published asking rent</span></div>
            <p className="mt-2 text-[10px] leading-4 text-slate-400">Asking rent opens with the broadest published ZIP coverage. Annual direction is shown only where a year-over-year read exists.</p>
          </div>
        </div>}</div>

      <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="ZIP market spotlights">
        <div className="border-b border-slate-100 px-5 py-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--report-accent)]">Representative local patterns</p><h3 className="mt-1 text-lg font-semibold text-[var(--report-primary)]">Across the rent range</h3><p className="mt-1 text-xs leading-5 text-slate-500">Examples span lower-, middle-, and higher-rent ZIPs. Extreme one-month composition shifts are not promoted as headlines.</p></div>
        <div className="p-2">{ranked.slice(0, 5).map((point, index) => {
          const active = selected?.zip === point.zip;
          return <button key={point.zip} type="button" onClick={() => setSelectedZip(point.zip)} className={`w-full rounded-xl px-3 py-3 text-left transition ${active ? "bg-slate-100 ring-1 ring-slate-300" : "hover:bg-slate-50"}`}>
            <div className="flex items-start gap-3"><span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-2"><span className="font-semibold text-slate-800">ZIP {point.zip}</span><span className="text-base font-semibold text-[var(--report-primary)]">{money(point.rent)}</span></div><div className="mt-1 text-xs"><span className={`font-bold ${directionBand(point.yearOverYearPct) === "rising" ? "text-teal-700" : directionBand(point.yearOverYearPct) === "softening" ? "text-orange-700" : "text-slate-500"}`}>{directionLabel(point.yearOverYearPct)}</span></div><p className="mt-1 text-[11px] text-slate-400">Complete ZIP, city, and MSA context</p></div></div>
          </button>;
        })}</div>
        {!ranked.length && <div className="p-5 text-sm leading-6 text-slate-500">No ZIP currently has a complete city comparison and a consistent multi-month path for this product. The map still shows every published ZIP value.</div>}
        {selected && <div className="border-t border-slate-100 bg-slate-50 px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Selected area</p><p className="mt-1 font-semibold text-slate-800">ZIP {selected.zip} · {money(selected.rent)}</p><p className="mt-1 text-xs text-slate-500">{directionLabel(selected.yearOverYearPct)} · {monthLabel(selected.month)}</p></div>}
        <div className="border-t border-slate-100 px-5 py-3 text-[11px] leading-5 text-slate-500">Every published ZIP value appears on the map. Uncolored areas do not have a published value for this exact product.</div>
      </aside>
    </div>

    <aside className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-slate-700"><strong className="text-navy">Understanding local moves.</strong> A ZIP trend describes the asking-rent mix visible in that local market. A new lease-up, the arrival or disappearance of a property, or a change in bedroom mix can move the market statistic sharply even when rents for an individual apartment have not changed by the same amount.</aside>

    {selected && <ZipDrilldown selected={selected} benchmark={benchmark} cityCell={cityCell} activity={activity} nearby={nearby} onSelect={setSelectedZip} marketName={marketName} timeZone={timeZone} />}
  </div>;
}
