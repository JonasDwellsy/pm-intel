"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { marketIqDailyEventExplorerOptions } from "@/lib/market-iq/daily-event-explorer";
import { buildDailyEventHeadlines } from "@/lib/market-iq/daily-events";
import {
  EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS,
  MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES,
  marketIqDailyWatchlistScopeLabel,
  matchMarketIqDailyWatchlist,
  type MarketIqDailyWatchlistActionResult,
  type MarketIqDailyWatchlistEventType,
  type MarketIqDailyWatchlistFilters,
  type MarketIqDailyWatchlistInput,
  type MarketIqDailyWatchlistView,
} from "@/lib/market-iq/daily-watchlists";
import type { MarketIqMarketActivity } from "@/lib/market-iq/listing-events";
import { marketIqPropertyActivityPath } from "@/lib/market-iq/property-activity";

type SaveAction = (marketId: string, input: MarketIqDailyWatchlistInput) => Promise<MarketIqDailyWatchlistActionResult>;
type DeleteAction = (marketId: string, watchlistId: string) => Promise<MarketIqDailyWatchlistActionResult>;

const EVENT_LABELS: Record<MarketIqDailyWatchlistEventType, string> = {
  new_to_market: "New listings",
  rent_changes: "Rent changes",
  off_market: "Off market",
  aging_watch: "Aging watch",
  concessions: "Concessions",
  lease_up: "Lease-ups",
};

const EVENT_STYLES: Record<MarketIqDailyWatchlistEventType, string> = {
  new_to_market: "bg-teal-50 text-teal-800 ring-teal-200",
  rent_changes: "bg-sky-50 text-sky-800 ring-sky-200",
  off_market: "bg-orange-50 text-orange-800 ring-orange-200",
  aging_watch: "bg-slate-100 text-slate-700 ring-slate-200",
  concessions: "bg-amber-50 text-amber-800 ring-amber-200",
  lease_up: "bg-violet-50 text-violet-800 ring-violet-200",
};

function observedTime(value: string, timeZone: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function WatchlistSelect({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100">{children}</select></label>;
}

export function MarketIqDailyWatchlists({
  activity,
  marketId,
  timeZone,
  initialWatchlists,
  saveWatchlist,
  deleteWatchlist,
}: {
  activity: MarketIqMarketActivity;
  marketId: string;
  timeZone: string;
  initialWatchlists: MarketIqDailyWatchlistView[];
  saveWatchlist: SaveAction;
  deleteWatchlist: DeleteAction;
}) {
  const options = useMemo(() => marketIqDailyEventExplorerOptions(buildDailyEventHeadlines(activity.events)), [activity.events]);
  const [watchlists, setWatchlists] = useState(initialWatchlists);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [filters, setFilters] = useState<MarketIqDailyWatchlistFilters>(EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS);
  const [builderOpen, setBuilderOpen] = useState(initialWatchlists.length === 0);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetBuilder() {
    setEditingId(null);
    setName("");
    setFilters(EMPTY_MARKET_IQ_DAILY_WATCHLIST_FILTERS);
    setMessage(null);
  }

  function edit(watchlist: MarketIqDailyWatchlistView) {
    setEditingId(watchlist.id);
    setName(watchlist.name);
    setFilters(watchlist.filters);
    setBuilderOpen(true);
    setMessage(null);
  }

  function toggleEventType(eventType: MarketIqDailyWatchlistEventType) {
    setFilters((current) => ({
      ...current,
      eventTypes: current.eventTypes.includes(eventType)
        ? current.eventTypes.filter((item) => item !== eventType)
        : [...current.eventTypes, eventType],
    }));
  }

  function submit() {
    startTransition(async () => {
      setMessage(null);
      const result = await saveWatchlist(marketId, { id: editingId ?? undefined, name, filters });
      if (!result.ok || !result.watchlist) {
        setMessage(result.ok ? "This watchlist could not be saved." : result.message);
        return;
      }
      setWatchlists((current) => editingId
        ? current.map((item) => item.id === editingId ? result.watchlist! : item)
        : [result.watchlist!, ...current]);
      resetBuilder();
      setBuilderOpen(false);
      setMessage("Your personal watchlist was saved.");
    });
  }

  function remove(watchlistId: string) {
    startTransition(async () => {
      setMessage(null);
      const result = await deleteWatchlist(marketId, watchlistId);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setWatchlists((current) => current.filter((item) => item.id !== watchlistId));
      if (editingId === watchlistId) resetBuilder();
      setPendingDeleteId(null);
      setMessage("Watchlist removed.");
    });
  }

  return <section id="daily-watchlists" className="mb-6 overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-[0_14px_40px_rgba(15,118,110,0.08)]" aria-labelledby="daily-watchlists-heading">
    <header className="flex flex-col gap-4 border-b border-teal-100 bg-gradient-to-r from-teal-50 to-white px-5 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-6">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-800">Personal intelligence</p><h2 id="daily-watchlists-heading" className="mt-1 text-2xl font-semibold tracking-tight text-navy">Your watchlists</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Follow the places, properties, managers, and event types that matter to you. These watchlists are visible only to your signed-in account.</p></div>
      <button type="button" onClick={() => { setBuilderOpen((current) => !current); if (builderOpen) resetBuilder(); }} className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">{builderOpen ? "Close builder" : "New watchlist"}</button>
    </header>

    {builderOpen && <div className="border-b border-slate-200 bg-slate-50 px-5 py-6 sm:px-6">
      <div className="grid gap-4 lg:grid-cols-4">
        <label className="block lg:col-span-2"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Watchlist name</span><input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="West side rent cuts" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></label>
        <WatchlistSelect label="Area" value={filters.geography} onChange={(geography) => setFilters((current) => ({ ...current, geography }))}>
          <option value="all">All areas</option>
          {options.cities.length > 0 && <optgroup label="Cities">{options.cities.map((city) => <option key={city} value={`city:${city}`}>{city}</option>)}</optgroup>}
          {options.zipCodes.length > 0 && <optgroup label="ZIP codes">{options.zipCodes.map((zip) => <option key={zip} value={`zip:${zip}`}>{zip}</option>)}</optgroup>}
        </WatchlistSelect>
        <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Property, address, or manager</span><input value={filters.query} maxLength={120} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Optional name or address" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></label>
        <WatchlistSelect label="Beds" value={filters.bedrooms} onChange={(bedrooms) => setFilters((current) => ({ ...current, bedrooms: bedrooms as MarketIqDailyWatchlistFilters["bedrooms"] }))}><option value="all">All beds</option><option value="studio">Studio</option><option value="1">1 bed</option><option value="2">2 beds</option><option value="3">3 beds</option><option value="4_plus">4+ beds</option></WatchlistSelect>
        <WatchlistSelect label="Property" value={filters.propertyType} onChange={(propertyType) => setFilters((current) => ({ ...current, propertyType: propertyType as MarketIqDailyWatchlistFilters["propertyType"] }))}><option value="all">All types</option><option value="apartment">Apartments</option><option value="house">Houses</option></WatchlistSelect>
        <WatchlistSelect label="Rent move" value={filters.rentDirection} onChange={(rentDirection) => setFilters((current) => ({ ...current, rentDirection: rentDirection as MarketIqDailyWatchlistFilters["rentDirection"] }))}><option value="all">Any direction</option><option value="increase">Increases</option><option value="decrease">Decreases</option></WatchlistSelect>
        <WatchlistSelect label="Change size" value={String(filters.minimumRentMagnitude)} onChange={(minimumRentMagnitude) => setFilters((current) => ({ ...current, minimumRentMagnitude: Number(minimumRentMagnitude) as MarketIqDailyWatchlistFilters["minimumRentMagnitude"] }))}><option value="0">Any amount</option><option value="50">$50+</option><option value="100">$100+</option><option value="200">$200+</option></WatchlistSelect>
      </div>
      <fieldset className="mt-5"><legend className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Event types <span className="font-normal normal-case tracking-normal">(none selected means all)</span></legend><div className="mt-2 flex flex-wrap gap-2">{MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES.map((eventType) => <label key={eventType} className={`cursor-pointer rounded-full px-3 py-2 text-xs font-semibold ring-1 ring-inset ${filters.eventTypes.includes(eventType) ? "bg-navy text-white ring-navy" : "bg-white text-slate-600 ring-slate-300"}`}><input type="checkbox" checked={filters.eventTypes.includes(eventType)} onChange={() => toggleEventType(eventType)} className="sr-only" />{EVENT_LABELS[eventType]}</label>)}</div></fieldset>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-5 text-slate-500">Matches are computed only from records retained in the selected Daily Edition. No monthly trend is substituted.</p><div className="flex gap-2">{editingId && <button type="button" onClick={resetBuilder} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-navy">Cancel edit</button>}<button type="button" disabled={isPending || !name.trim()} onClick={submit} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{isPending ? "Saving…" : editingId ? "Save changes" : "Create watchlist"}</button></div></div>
    </div>}

    {message && <p role="status" className="border-b border-slate-100 px-5 py-3 text-xs font-semibold text-teal-800 sm:px-6">{message}</p>}

    {watchlists.length ? <div className="divide-y divide-slate-100">{watchlists.map((watchlist) => {
      const matches = matchMarketIqDailyWatchlist(watchlist, activity);
      return <article key={watchlist.id} className="px-5 py-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-navy">{watchlist.name}</h3><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-800">{matches.length} {matches.length === 1 ? "match" : "matches"}</span></div><p className="mt-1 text-xs text-slate-500">{marketIqDailyWatchlistScopeLabel(watchlist.filters)}</p></div><div className="flex gap-3 text-xs font-semibold"> <button type="button" onClick={() => edit(watchlist)} className="text-teal-800">Edit</button>{pendingDeleteId === watchlist.id ? <><button type="button" disabled={isPending} onClick={() => remove(watchlist.id)} className="text-red-700">Confirm remove</button><button type="button" onClick={() => setPendingDeleteId(null)} className="text-slate-500">Cancel</button></> : <button type="button" onClick={() => setPendingDeleteId(watchlist.id)} className="text-red-700">Remove</button>}</div></div>
        {matches.length ? <div className="mt-4 grid gap-3 lg:grid-cols-3">{matches.slice(0, 3).map((match) => <div key={`${match.eventType}:${match.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider ring-1 ring-inset ${EVENT_STYLES[match.eventType]}`}>{EVENT_LABELS[match.eventType]}</span><time dateTime={match.observedAt} className="text-[10px] font-semibold text-slate-400">{observedTime(match.observedAt, timeZone)}</time></div><h4 className="mt-3 text-sm font-semibold leading-5 text-navy">{match.headline}</h4><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{match.detail}</p>{match.propertyManagerName && <p className="mt-2 text-[10px] font-semibold text-slate-400">Managed by {match.propertyManagerName}</p>}<div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">{match.propertyId && <Link href={marketIqPropertyActivityPath(marketId, match.propertyId)} className="text-teal-800">View property</Link>}<a href={match.sectionHref} className="text-teal-800">View section ↓</a>{match.listingUrl && <a href={match.listingUrl} target="_blank" rel="noreferrer" className="text-teal-800">Source ↗</a>}</div></div>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No retained events matched this watchlist in the current edition.</p>}
        {matches.length > 3 && <a href="#daily-event-explorer" className="mt-4 inline-flex text-xs font-semibold text-teal-800">Explore all {matches.length} matches ↓</a>}
      </article>;
    })}</div> : !builderOpen && <div className="px-6 py-10 text-center"><h3 className="font-semibold text-navy">No personal watchlists yet.</h3><p className="mt-2 text-sm text-slate-500">Create one to bring the most relevant events to the top of every Daily Edition.</p></div>}
  </section>;
}
