"use client";

import { useMemo, useState, useTransition } from "react";

import {
  EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS,
  filterMarketIqDailyEventHeadlines,
  marketIqDailyExplorerFilters,
  marketIqDailyEventExplorerOptions,
  marketIqDailyObservedEventTotal,
  sameMarketIqDailySavedView,
  savedMarketIqDailyView,
  type MarketIqDailyEventBedrooms,
  type MarketIqDailyEventExplorerFilters,
  type MarketIqDailyEventPropertyType,
  type MarketIqDailyEventRentDirection,
  type MarketIqDailyEventRentMagnitude,
  type MarketIqDailyEventSection,
  type MarketIqDailySavedViewFilters,
} from "@/lib/market-iq/daily-event-explorer";
import { buildMarketIqDailyEventCsv } from "@/lib/market-iq/daily-event-export";
import { buildDailyEventHeadlines, type MarketIqDailyEventHeadline } from "@/lib/market-iq/daily-events";
import type { MarketIqListingEvent, MarketIqMarketActivity } from "@/lib/market-iq/listing-events";

type PreferenceAction = (marketId: string, filters: MarketIqDailySavedViewFilters) => Promise<{ ok: boolean; message?: string }>;
type ClearPreferenceAction = (marketId: string) => Promise<{ ok: boolean; message?: string }>;

const PAGE_SIZE = 25;

const SECTION_LABELS: Record<MarketIqDailyEventHeadline["section"], string> = {
  new_to_market: "New to market",
  rent_changes: "Rent change",
  off_market: "Off market",
  aging_watch: "Aging watch",
  concessions: "Concession",
};

const SECTION_STYLES: Record<MarketIqDailyEventHeadline["section"], string> = {
  new_to_market: "bg-teal-50 text-teal-800 ring-teal-200",
  rent_changes: "bg-sky-50 text-sky-800 ring-sky-200",
  off_market: "bg-orange-50 text-orange-800 ring-orange-200",
  aging_watch: "bg-slate-100 text-slate-700 ring-slate-200",
  concessions: "bg-amber-50 text-amber-800 ring-amber-200",
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fullDateTime(value: string, timeZone: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function propertyFacts(event: MarketIqListingEvent) {
  const bedrooms = event.bedrooms === 0 ? "Studio" : `${event.bedrooms} BR`;
  const propertyType = event.propertyType === "house" ? "House" : "Apartment";
  return `${bedrooms} · ${propertyType}`;
}

function rentMove(event: MarketIqListingEvent) {
  if (event.eventType !== "price_change" || event.previousRent === null) return null;
  const difference = event.askingRent - event.previousRent;
  return {
    label: `${money(event.previousRent)} → ${money(event.askingRent)}`,
    difference: `${difference > 0 ? "+" : difference < 0 ? "−" : ""}${money(Math.abs(difference))}`,
  };
}

function EventRecord({ headline, timeZone }: { headline: MarketIqDailyEventHeadline; timeZone: string }) {
  const event = headline.event;
  const move = rentMove(event);
  return (
    <article className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[150px_1fr_auto] lg:items-start">
      <div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ring-1 ring-inset ${SECTION_STYLES[headline.section]}`}>
          {SECTION_LABELS[headline.section]}
        </span>
        <p className="mt-2 text-xs font-semibold text-slate-500">{event.city} · {event.zip}</p>
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-6 text-navy">{headline.headline}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{headline.detail}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold text-slate-400">
          <span>{propertyFacts(event)}</span>
          {!move && <span>{money(event.askingRent)} asking</span>}
          {move && <><span className="text-slate-500">{move.label}</span><span className="text-teal-700">{move.difference}</span></>}
          {event.eventType === "delisting" && <span>{event.listingAgeDays === 0 ? "Less than 1 day listed" : `${event.listingAgeDays} days listed`}</span>}
          {event.eventType === "aging_threshold" && <span>{event.listingAgeDays} days live</span>}
          {event.eventType === "concession" && <span>Advertised, not verified</span>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 lg:block lg:text-right">
        <time dateTime={headline.observedAt} className="block text-[11px] font-semibold tabular-nums text-slate-400">{fullDateTime(headline.observedAt, timeZone)}</time>
        {event.listingUrl && <a href={event.listingUrl} target="_blank" rel="noreferrer" className="mt-0 inline-flex text-xs font-semibold text-teal-700 hover:text-teal-900 lg:mt-3">Open source listing ↗</a>}
      </div>
    </article>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return <label className="block">
    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
      {children}
    </select>
  </label>;
}

export function MarketIqDailyEventExplorer({
  activity,
  marketId,
  marketName = "market",
  timeZone,
  initialSavedFilters = null,
  savePreference,
  clearPreference,
}: {
  activity: MarketIqMarketActivity;
  marketId?: string;
  marketName?: string;
  timeZone: string;
  initialSavedFilters?: MarketIqDailySavedViewFilters | null;
  savePreference?: PreferenceAction;
  clearPreference?: ClearPreferenceAction;
}) {
  const headlines = useMemo(() => buildDailyEventHeadlines(activity.events), [activity.events]);
  const options = useMemo(() => marketIqDailyEventExplorerOptions(headlines), [headlines]);
  const [filters, setFilters] = useState<MarketIqDailyEventExplorerFilters>(() => marketIqDailyExplorerFilters(initialSavedFilters));
  const [savedFilters, setSavedFilters] = useState<MarketIqDailySavedViewFilters | null>(initialSavedFilters);
  const [preferenceMessage, setPreferenceMessage] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const filtered = useMemo(() => filterMarketIqDailyEventHeadlines(headlines, filters), [filters, headlines]);
  const visible = filtered.slice(0, visibleLimit);
  const observedTotal = marketIqDailyObservedEventTotal(activity);
  const retainedTotal = headlines.length;
  const recordsArePartial = activity.eventsTruncated || retainedTotal < observedTotal;
  const activeFilterCount = [
    filters.query.trim(),
    filters.section !== "all",
    filters.geography !== "all",
    filters.bedrooms !== "all",
    filters.propertyType !== "all",
    filters.rentDirection !== "all",
    filters.minimumRentMagnitude > 0,
  ].filter(Boolean).length;
  const currentSavedView = savedMarketIqDailyView(filters);
  const savedViewIsCurrent = savedFilters ? sameMarketIqDailySavedView(currentSavedView, savedFilters) : false;

  function updateFilters(patch: Partial<MarketIqDailyEventExplorerFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setVisibleLimit(PAGE_SIZE);
  }

  function resetFilters() {
    setFilters(EMPTY_MARKET_IQ_DAILY_EVENT_FILTERS);
    setVisibleLimit(PAGE_SIZE);
  }

  function saveView() {
    if (!marketId || !savePreference) return;
    startSaving(async () => {
      setPreferenceMessage(null);
      try {
        const result = await savePreference(marketId, currentSavedView);
        if (result.ok) {
          setSavedFilters(currentSavedView);
          setPreferenceMessage("Saved as your default for this market.");
        } else setPreferenceMessage(result.message ?? "This market view could not be saved.");
      } catch {
        setPreferenceMessage("This market view could not be saved.");
      }
    });
  }

  function restoreView() {
    if (!savedFilters) return;
    setFilters(marketIqDailyExplorerFilters(savedFilters));
    setVisibleLimit(PAGE_SIZE);
    setPreferenceMessage("Your saved market view has been restored.");
  }

  function clearSavedView() {
    if (!marketId || !clearPreference) return;
    startSaving(async () => {
      setPreferenceMessage(null);
      try {
        const result = await clearPreference(marketId);
        if (result.ok) {
          setSavedFilters(null);
          setPreferenceMessage("Your saved default for this market has been cleared.");
        } else setPreferenceMessage(result.message ?? "This saved view could not be cleared.");
      } catch {
        setPreferenceMessage("This saved view could not be cleared.");
      }
    });
  }

  function exportCsv() {
    const exported = buildMarketIqDailyEventCsv({
      headlines: filtered,
      marketName,
      timeZone,
      editionAsOf: activity.asOf,
      observedEventTotal: observedTotal,
      retainedRecordTotal: retainedTotal,
      retainedRecordsPartial: recordsArePartial,
    });
    const url = URL.createObjectURL(new Blob([exported.content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = exported.filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExportMessage(`Downloaded ${exported.rowCount.toLocaleString("en-US")} matching retained ${exported.rowCount === 1 ? "record" : "records"}.`);
  }

  return (
    <section id="daily-event-explorer" aria-label="Daily event explorer" className="mt-7 scroll-mt-28 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
      <header className="grid gap-5 border-b border-slate-200 bg-slate-50 px-5 py-6 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">Saved event ledger</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-navy">Explore this edition</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Search and filter the individual records retained with this Daily Edition. Every result keeps its original observation time and source link when available.</p>
        </div>
        <div className="rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200">
          <strong className="text-navy">{filtered.length.toLocaleString("en-US")}</strong>
          <span className="text-slate-500"> of {retainedTotal.toLocaleString("en-US")} retained records</span>
        </div>
      </header>

      <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_repeat(6,minmax(0,1fr))]">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Address search</span>
            <input
              type="search"
              value={filters.query}
              onChange={(event) => updateFilters({ query: event.target.value })}
              placeholder="Address, city, or ZIP"
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy outline-none placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
          <SelectField label="Event" value={filters.section} onChange={(section) => updateFilters({ section: section as MarketIqDailyEventSection })}>
            <option value="all">All events</option>
            <option value="new_to_market">New to market</option>
            <option value="rent_changes">Rent changes</option>
            <option value="off_market">Off market</option>
            <option value="aging_watch">Aging watch</option>
            <option value="concessions">Concessions</option>
          </SelectField>
          <SelectField label="Area" value={filters.geography} onChange={(geography) => updateFilters({ geography })}>
            <option value="all">All areas</option>
            {options.cities.length > 0 && <optgroup label="Cities">{options.cities.map((city) => <option key={city} value={`city:${city}`}>{city}</option>)}</optgroup>}
            {options.zipCodes.length > 0 && <optgroup label="ZIP codes">{options.zipCodes.map((zip) => <option key={zip} value={`zip:${zip}`}>{zip}</option>)}</optgroup>}
          </SelectField>
          <SelectField label="Beds" value={filters.bedrooms} onChange={(bedrooms) => updateFilters({ bedrooms: bedrooms as MarketIqDailyEventBedrooms })}>
            <option value="all">All beds</option><option value="studio">Studio</option><option value="1">1 bed</option><option value="2">2 beds</option><option value="3">3 beds</option><option value="4_plus">4+ beds</option>
          </SelectField>
          <SelectField label="Property" value={filters.propertyType} onChange={(propertyType) => updateFilters({ propertyType: propertyType as MarketIqDailyEventPropertyType })}>
            <option value="all">All types</option><option value="apartment">Apartment</option><option value="house">House</option>
          </SelectField>
          <SelectField label="Rent move" value={filters.rentDirection} onChange={(rentDirection) => updateFilters({ rentDirection: rentDirection as MarketIqDailyEventRentDirection })}>
            <option value="all">Any direction</option><option value="increase">Increase</option><option value="decrease">Decrease</option>
          </SelectField>
          <SelectField label="Change size" value={String(filters.minimumRentMagnitude)} onChange={(minimumRentMagnitude) => updateFilters({ minimumRentMagnitude: Number(minimumRentMagnitude) as MarketIqDailyEventRentMagnitude })}>
            <option value="0">Any amount</option><option value="50">$50+</option><option value="100">$100+</option><option value="200">$200+</option>
          </SelectField>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div><p aria-live="polite" className="text-xs text-slate-500">Showing {visible.length.toLocaleString("en-US")} of {filtered.length.toLocaleString("en-US")} matching retained records.</p><p className="mt-1 text-[10px] text-slate-400">Rent direction and change-size filters apply only to confirmed rent-change records. Address search is session-only and is never saved.</p>{preferenceMessage && <p role="status" className="mt-2 text-xs font-semibold text-teal-700">{preferenceMessage}</p>}{exportMessage && <p role="status" className="mt-2 text-xs font-semibold text-teal-700">{exportMessage}</p>}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className="rounded-md border border-teal-700 bg-white px-3 py-2 text-xs font-semibold text-teal-800 disabled:cursor-not-allowed disabled:opacity-40">Export {filtered.length.toLocaleString("en-US")} matching {filtered.length === 1 ? "record" : "records"} CSV</button>
            {marketId && savePreference && savedFilters && !savedViewIsCurrent && <button type="button" onClick={restoreView} disabled={isSaving} className="rounded-md border border-teal-700 px-3 py-2 text-xs font-semibold text-teal-800 disabled:opacity-40">Restore saved view</button>}
            {marketId && savePreference && <button type="button" onClick={saveView} disabled={isSaving || savedViewIsCurrent} className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{isSaving ? "Saving…" : savedViewIsCurrent ? "Default saved" : "Save as my default"}</button>}
            {marketId && clearPreference && savedFilters && <button type="button" onClick={clearSavedView} disabled={isSaving} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-navy disabled:opacity-40">Clear saved default</button>}
            <button type="button" onClick={resetFilters} disabled={activeFilterCount === 0} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-navy disabled:cursor-not-allowed disabled:opacity-40">Reset filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</button>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {visible.map((headline) => <EventRecord key={headline.id} headline={headline} timeZone={timeZone} />)}
        {filtered.length === 0 && <div className="px-6 py-12 text-center"><h3 className="text-base font-semibold text-navy">No retained records match these filters.</h3><p className="mt-2 text-sm text-slate-500">Reset the filters to return to the full saved ledger.</p></div>}
      </div>

      {visible.length < filtered.length && <div className="border-t border-slate-200 px-5 py-4 text-center sm:px-6"><button type="button" onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)} className="rounded-md bg-navy px-5 py-2.5 text-sm font-semibold text-white">Show {Math.min(PAGE_SIZE, filtered.length - visible.length)} more records</button></div>}

      <footer className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-500 sm:px-6">
        {recordsArePartial
          ? <>The source observed <strong className="text-slate-700">{observedTotal.toLocaleString("en-US")}</strong> reportable events in this edition’s 24-hour window. This saved edition retains <strong className="text-slate-700">{retainedTotal.toLocaleString("en-US")}</strong> individual records, and filters apply only to those retained records.</>
          : <>The source observed {observedTotal.toLocaleString("en-US")} reportable events in this edition’s 24-hour window, and {retainedTotal.toLocaleString("en-US")} individual records are available to filter.</>}
        <span className="mt-1 block">CSV exports include every matching retained record, including records not yet displayed on this page. They never retrieve additional source records.</span>
      </footer>
    </section>
  );
}
