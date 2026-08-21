"use client";

/* eslint-disable @next/next/no-img-element -- listing media hosts are dynamic source data, not a fixed application asset domain */

import { useMemo, useState } from "react";
import type { MarketIqListingEvent, MarketIqMarketActivity } from "@/lib/market-iq/report/report";

const PAGE_SIZE = 25;

type EventFilter = "all" | MarketIqListingEvent["eventType"];

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function product(event: MarketIqListingEvent) {
  const bedrooms = event.bedrooms === 0 ? "Studio" : `${event.bedrooms}-bed`;
  return `${bedrooms} ${event.propertyType}`;
}

function eventName(event: MarketIqListingEvent) {
  return event.eventType === "price_change" ? "Asking rent changed" : "New listing";
}

function time(value: string) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function dateTime(value: string) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function ActivityItem({ event, duplicate = false }: { event: MarketIqListingEvent; duplicate?: boolean }) {
  const priceChanged = event.eventType === "price_change" && event.previousRent !== null;
  const content = <article className="flex min-h-28 w-[390px] shrink-0 items-center gap-3 border-r border-slate-200 px-4 py-3.5">
    {event.imageUrl
      ? <img src={event.imageUrl} alt="" className="h-16 w-20 shrink-0 rounded-lg bg-slate-100 object-cover" loading="lazy" referrerPolicy="no-referrer" />
      : <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg text-sm font-bold ${priceChanged ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>{priceChanged ? "$" : "+"}</span>}
    <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-semibold text-slate-800">{event.city} · {event.zip}</p><time className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{time(event.observedAt)} ET</time></div><p className="mt-1 min-h-8 text-xs leading-4 text-slate-600">{event.address ?? "Address unavailable"}</p><p className="text-xs text-slate-500">{eventName(event)} · {product(event)}</p><div className="mt-0.5 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[var(--report-primary)]">{priceChanged && <span className="mr-1 font-normal text-slate-400 line-through">{money(event.previousRent ?? 0)}</span>}{money(event.askingRent)}</p>{event.listingUrl && <span className="shrink-0 text-[10px] font-semibold text-teal-700">View on Dwellsy ↗</span>}</div></div>
  </article>;
  if (!event.listingUrl) return content;
  return <a href={event.listingUrl} target="_blank" rel="noreferrer" tabIndex={duplicate ? -1 : undefined} className="block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600" aria-label={`View ${product(event)} listing in ${event.city} on Dwellsy`}>{content}</a>;
}

function ExplorerItem({ event }: { event: MarketIqListingEvent }) {
  const priceChanged = event.eventType === "price_change" && event.previousRent !== null;
  return <article className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-center">
    {event.imageUrl
      ? <img src={event.imageUrl} alt="" className="h-20 w-full rounded-lg bg-slate-100 object-cover sm:w-[88px]" loading="lazy" referrerPolicy="no-referrer" />
      : <span className={`grid h-20 w-full place-items-center rounded-lg text-lg font-bold sm:w-[88px] ${priceChanged ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>{priceChanged ? "$" : "+"}</span>}
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${priceChanged ? "bg-amber-50 text-amber-800" : "bg-teal-50 text-teal-800"}`}>{eventName(event)}</span><time className="text-xs text-slate-400">{dateTime(event.observedAt)} ET</time></div>
      <p className="mt-2 break-words text-sm font-semibold text-[var(--report-primary)]">{event.address ?? "Address unavailable"}</p>
      <p className="mt-0.5 text-xs text-slate-500">{event.city} · {event.zip} · {product(event)}</p>
    </div>
    <div className="flex items-end justify-between gap-4 sm:min-w-32 sm:flex-col sm:items-end">
      <p className="text-base font-semibold text-[var(--report-primary)]">{priceChanged && <span className="mr-1.5 text-sm font-normal text-slate-400 line-through">{money(event.previousRent ?? 0)}</span>}{money(event.askingRent)}</p>
      {event.listingUrl && <a href={event.listingUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-teal-700 underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">View on Dwellsy ↗</a>}
    </div>
  </article>;
}

function sortedOptions(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function MarketIqActivityTicker({ activity, marketName = "the market" }: { activity: MarketIqMarketActivity; marketName?: string }) {
  const tickerEvents = activity.events.slice(0, 10);
  const [expanded, setExpanded] = useState(false);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [city, setCity] = useState("all");
  const [zip, setZip] = useState("all");
  const [bedrooms, setBedrooms] = useState("all");
  const [propertyType, setPropertyType] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const options = useMemo(() => ({
    cities: sortedOptions(activity.events.map((event) => event.city)),
    zips: sortedOptions(activity.events.map((event) => event.zip)),
    bedrooms: [...new Set(activity.events.map((event) => event.bedrooms))].sort((a, b) => a - b),
  }), [activity.events]);

  const filteredEvents = useMemo(() => activity.events.filter((event) =>
    (eventFilter === "all" || event.eventType === eventFilter) &&
    (city === "all" || event.city === city) &&
    (zip === "all" || event.zip === zip) &&
    (bedrooms === "all" || event.bedrooms === Number(bedrooms)) &&
    (propertyType === "all" || event.propertyType === propertyType)
  ), [activity.events, bedrooms, city, eventFilter, propertyType, zip]);

  if (!tickerEvents.length) return null;
  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const reportableLabel = activity.eventsTruncated
    ? `Latest ${activity.events.length} reportable events`
    : `${activity.events.length} reportable event${activity.events.length === 1 ? "" : "s"}`;
  const setFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setVisibleCount(PAGE_SIZE);
  };
  const resetFilters = () => {
    setEventFilter("all");
    setCity("all");
    setZip("all");
    setBedrooms("all");
    setPropertyType("all");
    setVisibleCount(PAGE_SIZE);
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.04)]" aria-label={`Recent ${marketName} listing activity`}>
    <div className="flex flex-col border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--report-accent)]">The market right now</p><h2 className="mt-1 text-xl font-semibold text-[var(--report-primary)]">Recent listing activity</h2></div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center lg:mt-0"><div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span><strong className="text-slate-800">{activity.newListings24h}</strong> new in 24h</span><span><strong className="text-slate-800">{activity.confirmedPriceChanges24h}</strong> confirmed price changes</span><span><strong className="text-slate-800">{activity.sourceUpdates24h}</strong> source updates</span></div><button type="button" aria-expanded={expanded} aria-controls="market-iq-activity-explorer" onClick={() => setExpanded((value) => !value)} className="shrink-0 rounded-lg bg-[var(--report-primary)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">{expanded ? "Collapse activity" : `View all activity (${activity.events.length}${activity.eventsTruncated ? "+" : ""})`}</button></div>
    </div>
    <div className="market-iq-ticker-mask overflow-hidden" tabIndex={0} aria-label="Scroll recent listing events">
      <div className="market-iq-ticker-track flex w-max hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]">
        <div className="flex" aria-label="Recent events">{tickerEvents.map((event) => <ActivityItem key={event.id} event={event} />)}</div>
        <div className="flex" aria-hidden="true">{tickerEvents.map((event) => <ActivityItem key={`copy:${event.id}`} event={event} duplicate />)}</div>
      </div>
    </div>
    {expanded && <div id="market-iq-activity-explorer" role="region" aria-label="All recent listing activity" className="border-t border-slate-200 bg-slate-50 px-5 py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Activity explorer</p><h3 className="mt-1 text-lg font-semibold text-[var(--report-primary)]">{reportableLabel} in the saved 24-hour read</h3><p className="mt-1 text-xs text-slate-500">Only new listings and confirmed asking-rent changes are included.</p></div><button type="button" onClick={resetFilters} className="self-start text-xs font-semibold text-teal-700 underline-offset-4 hover:underline">Reset filters</button></div>
      <div className="mt-5 flex flex-wrap gap-2" aria-label="Activity type"><button type="button" aria-pressed={eventFilter === "all"} onClick={() => { setEventFilter("all"); setVisibleCount(PAGE_SIZE); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${eventFilter === "all" ? "border-[var(--report-primary)] bg-[var(--report-primary)] text-white" : "border-slate-300 bg-white text-slate-600"}`}>All activity</button><button type="button" aria-pressed={eventFilter === "new_listing"} onClick={() => { setEventFilter("new_listing"); setVisibleCount(PAGE_SIZE); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${eventFilter === "new_listing" ? "border-[var(--report-primary)] bg-[var(--report-primary)] text-white" : "border-slate-300 bg-white text-slate-600"}`}>New listings</button><button type="button" aria-pressed={eventFilter === "price_change"} onClick={() => { setEventFilter("price_change"); setVisibleCount(PAGE_SIZE); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${eventFilter === "price_change" ? "border-[var(--report-primary)] bg-[var(--report-primary)] text-white" : "border-slate-300 bg-white text-slate-600"}`}>Price changes</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">Municipality<select aria-label="Municipality" value={city} onChange={(event) => setFilter(setCity, event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700"><option value="all">All municipalities</option>{options.cities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">ZIP code<select aria-label="ZIP code" value={zip} onChange={(event) => setFilter(setZip, event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700"><option value="all">All ZIP codes</option>{options.zips.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Bedrooms<select aria-label="Bedrooms" value={bedrooms} onChange={(event) => setFilter(setBedrooms, event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700"><option value="all">All bedrooms</option>{options.bedrooms.map((value) => <option key={value} value={String(value)}>{value === 0 ? "Studio" : `${value} bedrooms`}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Property type<select aria-label="Property type" value={propertyType} onChange={(event) => setFilter(setPropertyType, event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700"><option value="all">Apartments and houses</option><option value="apartment">Apartments</option><option value="house">Houses</option></select></label>
      </div>
      <div className="mt-5 flex items-center justify-between gap-4"><p className="text-xs text-slate-500" aria-live="polite">Showing {Math.min(visibleCount, filteredEvents.length)} of {filteredEvents.length} matching events</p>{activity.eventsTruncated && <p className="text-xs text-amber-700">The saved read reached its 200-event safety limit.</p>}</div>
      <div className="mt-3 grid gap-3 xl:grid-cols-2">{visibleEvents.map((event) => <ExplorerItem key={event.id} event={event} />)}</div>
      {!filteredEvents.length && <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">No saved events match these filters.</p>}
      {visibleCount < filteredEvents.length && <button type="button" onClick={() => setVisibleCount((value) => value + PAGE_SIZE)} className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-teal-700 hover:bg-slate-50">Load 25 more</button>}
    </div>}
    <p className="border-t border-slate-100 bg-slate-50 px-5 py-2 text-[10px] leading-4 text-slate-400">Observed listing events only. Each address and link identifies the source property shown. Source current through {dateTime(activity.asOf)} ET.</p>
  </section>;
}
