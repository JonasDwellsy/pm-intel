"use client";

/* eslint-disable @next/next/no-img-element -- listing media hosts are dynamic source data, not a fixed application asset domain */

import type { MarketIqListingEvent, MarketIqMarketActivity } from "@/lib/market-iq/report/report";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function product(event: MarketIqListingEvent) {
  const bedrooms = event.bedrooms === 0 ? "Studio" : `${event.bedrooms}-bed`;
  return `${bedrooms} ${event.propertyType}`;
}

function time(value: string) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function ActivityItem({ event, duplicate = false }: { event: MarketIqListingEvent; duplicate?: boolean }) {
  const priceChanged = event.eventType === "price_change" && event.previousRent !== null;
  const content = <article className="flex w-[350px] shrink-0 items-center gap-3 border-r border-slate-200 px-4 py-3.5">
    {event.imageUrl
      ? <img src={event.imageUrl} alt="" className="h-16 w-20 shrink-0 rounded-lg bg-slate-100 object-cover" loading="lazy" referrerPolicy="no-referrer" />
      : <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg text-sm font-bold ${priceChanged ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>{priceChanged ? "$" : "+"}</span>}
    <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-semibold text-slate-800">{event.city} · {event.zip}</p><time className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{time(event.observedAt)} ET</time></div><p className="mt-1 text-xs text-slate-500">{priceChanged ? "Asking rent changed" : "New listing"} · {product(event)}</p><div className="mt-0.5 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[var(--report-primary)]">{priceChanged && <span className="mr-1 font-normal text-slate-400 line-through">{money(event.previousRent ?? 0)}</span>}{money(event.askingRent)}</p>{event.listingUrl && <span className="shrink-0 text-[10px] font-semibold text-teal-700">View on Dwellsy ↗</span>}</div></div>
  </article>;
  if (!event.listingUrl) return content;
  return <a href={event.listingUrl} target="_blank" rel="noreferrer" tabIndex={duplicate ? -1 : undefined} className="block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600" aria-label={`View ${product(event)} listing in ${event.city} on Dwellsy`}>{content}</a>;
}

export function MarketIqActivityTicker({ activity, marketName = "the market" }: { activity: MarketIqMarketActivity; marketName?: string }) {
  const events = activity.events.slice(0, 10);
  if (!events.length) return null;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.04)]" aria-label={`Recent ${marketName} listing activity`}>
    <div className="flex flex-col border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--report-accent)]">The market right now</p><h2 className="mt-1 text-xl font-semibold text-[var(--report-primary)]">Recent listing activity</h2></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 sm:mt-0"><span><strong className="text-slate-800">{activity.newListings24h}</strong> new in 24h</span><span><strong className="text-slate-800">{activity.sourceUpdates24h}</strong> source updates</span>{activity.confirmedPriceChanges24h > 0 && <span><strong className="text-slate-800">{activity.confirmedPriceChanges24h}</strong> confirmed price changes</span>}</div></div>
    <div className="market-iq-ticker-mask overflow-hidden" tabIndex={0} aria-label="Scroll recent listing events">
      <div className="market-iq-ticker-track flex w-max hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]">
        <div className="flex" aria-label="Recent events">{events.map((event) => <ActivityItem key={event.id} event={event} />)}</div>
        <div className="flex" aria-hidden="true">{events.map((event) => <ActivityItem key={`copy:${event.id}`} event={event} duplicate />)}</div>
      </div>
    </div>
    <p className="border-t border-slate-100 bg-slate-50 px-5 py-2 text-[10px] leading-4 text-slate-400">Observed listing events only. Addresses are withheld from this market-level read. Source current through {new Date(activity.asOf).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET.</p>
  </section>;
}
