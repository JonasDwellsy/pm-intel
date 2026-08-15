"use client";

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

function ActivityItem({ event }: { event: MarketIqListingEvent }) {
  const priceChanged = event.eventType === "price_change" && event.previousRent !== null;
  return <article className="flex w-[310px] shrink-0 items-center gap-3 border-r border-slate-200 px-5 py-4">
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${priceChanged ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>{priceChanged ? "$" : "+"}</span>
    <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-semibold text-slate-800">{event.city} · {event.zip}</p><time className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{time(event.observedAt)} ET</time></div><p className="mt-1 text-xs text-slate-500">{priceChanged ? "Asking rent changed" : "New listing"} · {product(event)}</p><p className="mt-0.5 text-sm font-semibold text-[var(--report-primary)]">{priceChanged && <span className="mr-1 font-normal text-slate-400 line-through">{money(event.previousRent ?? 0)}</span>}{money(event.askingRent)}</p></div>
  </article>;
}

export function MarketIqActivityTicker({ activity }: { activity: MarketIqMarketActivity }) {
  const events = activity.events.slice(0, 10);
  if (!events.length) return null;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.04)]" aria-label="Recent Cleveland listing activity">
    <div className="flex flex-col border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--report-accent)]">The market right now</p><h2 className="mt-1 text-xl font-semibold text-[var(--report-primary)]">Recent listing activity</h2></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 sm:mt-0"><span><strong className="text-slate-800">{activity.newListings24h}</strong> new in 24h</span><span><strong className="text-slate-800">{activity.sourceUpdates24h}</strong> source updates</span>{activity.confirmedPriceChanges24h > 0 && <span><strong className="text-slate-800">{activity.confirmedPriceChanges24h}</strong> confirmed price changes</span>}</div></div>
    <div className="market-iq-ticker-mask overflow-hidden" tabIndex={0} aria-label="Scroll recent listing events">
      <div className="market-iq-ticker-track flex w-max hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]">
        <div className="flex" aria-label="Recent events">{events.map((event) => <ActivityItem key={event.id} event={event} />)}</div>
        <div className="flex" aria-hidden="true">{events.map((event) => <ActivityItem key={`copy:${event.id}`} event={event} />)}</div>
      </div>
    </div>
    <p className="border-t border-slate-100 bg-slate-50 px-5 py-2 text-[10px] leading-4 text-slate-400">Observed listing events only. Addresses are withheld from this market-level read. Source current through {new Date(activity.asOf).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET.</p>
  </section>;
}
