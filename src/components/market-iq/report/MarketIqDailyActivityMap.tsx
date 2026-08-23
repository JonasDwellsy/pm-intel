"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection, Point } from "geojson";
import type { Map as MapboxMap } from "mapbox-gl";
import type { MarketIqLeaseUpAlert, MarketIqListingEvent } from "@/lib/market-iq/listing-events";
import { marketIqPropertyActivityPath } from "@/lib/market-iq/property-activity";

type ActivityCategory = "new_listing" | "price_change" | "delisting" | "concession" | "aging_threshold" | "lease_up";
type ActivityFeatureProperties = {
  id: string;
  category: ActivityCategory;
  label: string;
  detail: string;
  manager: string;
  observedAt: string;
  listingUrl: string;
  propertyUrl: string;
};
type ActivityPoint = {
  id: string;
  category: ActivityCategory;
  latitude: number;
  longitude: number;
  label: string;
  detail: string;
  manager: string;
  observedAt: string;
  listingUrl: string;
  propertyUrl: string;
};
type MapBounds = [[number, number], [number, number]];

const CATEGORIES: Array<{ value: ActivityCategory; label: string; color: string }> = [
  { value: "new_listing", label: "New listings", color: "#14b8a6" },
  { value: "price_change", label: "Rent moves", color: "#0ea5e9" },
  { value: "delisting", label: "Off market", color: "#f97316" },
  { value: "concession", label: "Concessions", color: "#eab308" },
  { value: "aging_threshold", label: "Aging watch", color: "#64748b" },
  { value: "lease_up", label: "Lease-up alerts", color: "#7c3aed" },
];

function validCoordinates(latitude: number | null | undefined, longitude: number | null | undefined): latitude is number {
  return typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function eventPoint(event: MarketIqListingEvent, marketId?: string): ActivityPoint | null {
  if (!validCoordinates(event.latitude, event.longitude)) return null;
  const category = event.eventType;
  const address = event.address?.trim() || `ZIP ${event.zip}`;
  const move = event.eventType === "price_change" && event.previousRent !== null
    ? `Asking rent changed from $${event.previousRent.toLocaleString("en-US")} to $${event.askingRent.toLocaleString("en-US")}`
    : event.eventType === "delisting"
      ? `Last asking $${event.askingRent.toLocaleString("en-US")} · ${event.listingAgeDays} days listed`
      : event.eventType === "aging_threshold"
        ? `${event.listingAgeDays} days live · $${event.askingRent.toLocaleString("en-US")} asking`
        : event.eventType === "concession"
          ? `${event.concession.label} · advertised, not verified`
          : `$${event.askingRent.toLocaleString("en-US")} asking`;
  return {
    id: event.id,
    category,
    latitude: event.latitude,
    longitude: event.longitude!,
    label: event.propertyName || `${event.city} · ${address}`,
    detail: `${address} · ${move}`,
    manager: event.propertyManagerName || "",
    observedAt: event.observedAt,
    listingUrl: event.listingUrl || "",
    propertyUrl: marketId && event.propertyId ? marketIqPropertyActivityPath(marketId, event.propertyId) : "",
  };
}

function leaseUpPoint(alert: MarketIqLeaseUpAlert, marketId?: string): ActivityPoint | null {
  if (!validCoordinates(alert.latitude, alert.longitude)) return null;
  return {
    id: alert.id,
    category: "lease_up",
    latitude: alert.latitude,
    longitude: alert.longitude!,
    label: alert.propertyName,
    detail: `${alert.newListingCount} newly observed listings · ${alert.city}, ${alert.zip}`,
    manager: alert.propertyManagerName || "",
    observedAt: alert.observedAt,
    listingUrl: alert.listingUrl || "",
    propertyUrl: marketId ? marketIqPropertyActivityPath(marketId, alert.propertyId) : "",
  };
}

function bounds(points: ActivityPoint[]): MapBounds | null {
  if (!points.length) return null;
  const longitudes = points.map((point) => point.longitude);
  const latitudes = points.map((point) => point.latitude);
  return [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]];
}

function featureCollection(points: ActivityPoint[]): FeatureCollection<Point, ActivityFeatureProperties> {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      id: point.id,
      geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
      properties: {
        id: point.id,
        category: point.category,
        label: point.label,
        detail: point.detail,
        manager: point.manager,
        observedAt: point.observedAt,
        listingUrl: point.listingUrl,
        propertyUrl: point.propertyUrl,
      },
    })),
  };
}

function MapUnavailable({ tokenMissing, pointCount }: { tokenMissing: boolean; pointCount: number }) {
  return <div className="grid h-[500px] place-items-center rounded-2xl bg-slate-100 p-8 text-center">
    <div className="max-w-md"><p className="font-semibold text-navy">{tokenMissing ? "Activity map unavailable" : "No mappable events in this evidence window"}</p><p className="mt-2 text-sm leading-6 text-slate-500">{tokenMissing ? "The event sections remain available. The interactive map will appear after the public Mapbox token is configured." : `${pointCount} event records were retained, but none carried usable source coordinates.`}</p></div>
  </div>;
}

export function MarketIqDailyActivityMap({
  events,
  leaseUpAlerts = [],
  marketId,
  marketName,
  sectionId = "daily-activity-map",
  eyebrow = "Observed locations",
  heading = "Where activity happened",
  description,
}: {
  events: MarketIqListingEvent[];
  leaseUpAlerts?: MarketIqLeaseUpAlert[];
  marketId?: string;
  marketName: string;
  sectionId?: string;
  eyebrow?: string;
  heading?: string;
  description?: string;
}) {
  const points = useMemo(() => [
    ...events.map((event) => eventPoint(event, marketId)).filter((point): point is ActivityPoint => point !== null),
    ...leaseUpAlerts.map((alert) => leaseUpPoint(alert, marketId)).filter((point): point is ActivityPoint => point !== null),
  ], [events, leaseUpAlerts, marketId]);
  const presentCategories = useMemo(() => new Set(points.map((point) => point.category)), [points]);
  const [activeCategories, setActiveCategories] = useState<Set<ActivityCategory>>(() => new Set(CATEGORIES.map((category) => category.value)));
  const [mapFailed, setMapFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const tokenMissing = !process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const unmappedCount = events.length + leaseUpAlerts.length - points.length;

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("daily-activity-points")) return;
    map.setFilter("daily-activity-points", ["in", ["get", "category"], ["literal", [...activeCategories]]]);
  }, [activeCategories]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const container = containerRef.current;
    const mapBounds = bounds(points);
    if (!token || !container || !mapBounds) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const mapboxModule = await import("mapbox-gl");
        if (cancelled) return;
        const mapboxgl = mapboxModule.default;
        mapboxgl.accessToken = token;
        const isSinglePoint = mapBounds[0][0] === mapBounds[1][0] && mapBounds[0][1] === mapBounds[1][1];
        const map = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/light-v11",
          ...(isSinglePoint
            ? { center: mapBounds[0], zoom: 12 }
            : { bounds: mapBounds, fitBoundsOptions: { padding: 64, maxZoom: 12 } }),
          attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
        map.on("load", () => {
          map.addSource("daily-activity", { type: "geojson", data: featureCollection(points) });
          map.addLayer({
            id: "daily-activity-points",
            type: "circle",
            source: "daily-activity",
            paint: {
              "circle-color": ["match", ["get", "category"], ...CATEGORIES.flatMap((category) => [category.value, category.color]), "#64748b"],
              "circle-radius": ["case", ["==", ["get", "category"], "lease_up"], 10, 6],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
              "circle-opacity": 0.9,
            },
          });
          map.setFilter("daily-activity-points", ["in", ["get", "category"], ["literal", CATEGORIES.map((category) => category.value)]]);
          map.on("mouseenter", "daily-activity-points", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "daily-activity-points", () => { map.getCanvas().style.cursor = ""; });
          map.on("click", "daily-activity-points", (event) => {
            const properties = event.features?.[0]?.properties as ActivityFeatureProperties | undefined;
            if (!properties) return;
            const content = document.createElement("div");
            content.className = "max-w-[260px] py-1 text-sm";
            const title = document.createElement("strong");
            title.className = "block text-slate-900";
            title.textContent = properties.label;
            const detail = document.createElement("p");
            detail.className = "mt-1 text-xs leading-5 text-slate-600";
            detail.textContent = properties.detail;
            content.append(title, detail);
            if (properties.manager) {
              const manager = document.createElement("p");
              manager.className = "mt-1 text-xs font-semibold text-slate-500";
              manager.textContent = `Managed by ${properties.manager}`;
              content.append(manager);
            }
            if (properties.propertyUrl) {
              const propertyLink = document.createElement("a");
              propertyLink.href = properties.propertyUrl;
              propertyLink.className = "mt-2 mr-3 inline-block text-xs font-semibold text-teal-700";
              propertyLink.textContent = "View property";
              content.append(propertyLink);
            }
            if (properties.listingUrl) {
              const link = document.createElement("a");
              link.href = properties.listingUrl;
              link.target = "_blank";
              link.rel = "noreferrer";
              link.className = "mt-2 inline-block text-xs font-semibold text-teal-700";
              link.textContent = "Open source listing ↗";
              content.append(link);
            }
            new mapboxgl.Popup({ offset: 12 }).setLngLat(event.lngLat).setDOMContent(content).addTo(map);
          });
        });
        cleanup = () => { mapRef.current = null; map.remove(); };
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    })();
    return () => { cancelled = true; cleanup?.(); };
  }, [points]);

  function toggleCategory(category: ActivityCategory) {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return <section id={sectionId} className="mb-6 scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.04)] sm:p-6" aria-label={sectionId === "daily-activity-map" ? "Daily activity map" : "Observed activity map"}>
    <header className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--report-accent)]">{eyebrow}</p><h3 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--report-primary)]">{heading}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description ?? `Interactive source coordinates for retained ${marketName} listing events. Select a marker for property and manager context.`}</p></div><p className="text-xs font-semibold text-slate-500">{points.length.toLocaleString("en-US")} mapped{unmappedCount > 0 ? ` · ${unmappedCount.toLocaleString("en-US")} without coordinates` : ""}</p></header>
    <div className="my-4 flex flex-wrap gap-2" role="group" aria-label="Map activity filters">{CATEGORIES.filter((category) => presentCategories.has(category.value)).map((category) => {
      const active = activeCategories.has(category.value);
      return <button key={category.value} type="button" aria-pressed={active} onClick={() => toggleCategory(category.value)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${active ? "border-slate-300 bg-white text-navy shadow-sm" : "border-slate-200 bg-slate-50 text-slate-400"}`}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: active ? category.color : "#cbd5e1" }} />{category.label}</button>;
    })}</div>
    {tokenMissing || mapFailed || !points.length
      ? <MapUnavailable tokenMissing={tokenMissing || mapFailed} pointCount={events.length + leaseUpAlerts.length} />
      : <div ref={containerRef} className="h-[500px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100" role="img" aria-label={`Interactive map of observed ${marketName} listing activity`} />}
    <p className="mt-3 text-[11px] leading-5 text-slate-500">Markers show where source listing events were observed. Overlapping records may share one location. A lease-up marker reflects a 25-plus listing arrival at one property, not independently verified construction or occupancy.</p>
  </section>;
}
