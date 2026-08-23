"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

import { MarketIqDailyActivityMap } from "@/components/market-iq/report/MarketIqDailyActivityMap";
import type { MarketIqCompetitiveSetBrief as Brief } from "@/lib/market-iq/competitive-set-brief";
import { MARKET_IQ_COMPETITIVE_SET_BRIEF_EVENT_TYPES } from "@/lib/market-iq/competitive-set-brief";
import type { MarketIqDailyWatchlistEventType } from "@/lib/market-iq/daily-watchlists";
import { marketIqPropertyActivityPath } from "@/lib/market-iq/property-activity";

type AvailableBrief = Extract<Brief, { state: "available" }>;

const EVENT_LABELS: Record<MarketIqDailyWatchlistEventType, string> = {
  new_to_market: "New listings",
  rent_changes: "Rent moves",
  off_market: "Off market",
  aging_watch: "Aging watch",
  concessions: "Concessions",
  lease_up: "Lease-ups",
};

const EVENT_COLORS: Record<MarketIqDailyWatchlistEventType, string> = {
  new_to_market: "border-teal-400 bg-teal-50 text-teal-900",
  rent_changes: "border-sky-400 bg-sky-50 text-sky-900",
  off_market: "border-orange-400 bg-orange-50 text-orange-900",
  aging_watch: "border-slate-400 bg-slate-100 text-slate-800",
  concessions: "border-amber-400 bg-amber-50 text-amber-900",
  lease_up: "border-violet-400 bg-violet-50 text-violet-900",
};

function dateTime(value: string, timeZone: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function rentMove(event: AvailableBrief["largestRentMoves"][number]) {
  const difference = event.askingRent! - event.previousRent!;
  const percentage = difference / event.previousRent! * 100;
  return `${difference > 0 ? "+" : "−"}$${Math.abs(difference).toLocaleString("en-US")} · ${percentage > 0 ? "+" : ""}${percentage.toFixed(1)}%`;
}

export function MarketIqCompetitiveSetBrief({ brief, marketName, timeZone }: {
  brief: AvailableBrief;
  marketName: string;
  timeZone: string;
}) {
  const scope = brief.watchlist.filters.competitiveSet!;
  const defaultSelected = brief.current7d.events.slice(0, 5).map((event) => event.key);
  const [selected, setSelected] = useState(defaultSelected);
  const reportHref = useMemo(() => {
    const params = new URLSearchParams({
      market: brief.watchlist.marketId,
      from: "competitive-set",
      competitiveSetId: brief.watchlist.id,
    });
    selected.slice(0, 10).forEach((key) => params.append("event", key));
    return `/market-iq/report?${params.toString()}`;
  }, [brief.watchlist.id, brief.watchlist.marketId, selected]);
  const subjectEvents = brief.current7d.events.filter((event) => event.isSubject);
  const peerEvents = brief.current7d.events.length - subjectEvents.length;

  function toggle(key: string) {
    setSelected((current) => current.includes(key)
      ? current.filter((candidate) => candidate !== key)
      : current.length < 10 ? [...current, key] : current);
  }

  return <div style={{ "--report-primary": "#17324a", "--report-accent": "#0f766e" } as CSSProperties}>
    <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq/daily" className="hover:text-teal-700">Daily Edition</Link><span>/</span><span>Competitive sets</span><span>/</span><span className="text-navy">{brief.watchlist.name}</span></nav>
    <header className="overflow-hidden rounded-3xl bg-navy text-white shadow-[0_24px_70px_rgba(23,50,74,0.2)]">
      <div className="grid gap-8 px-7 py-9 sm:px-10 lg:grid-cols-[1fr_auto] lg:items-end"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-teal-400/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-200">Competitive set brief</span><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/70">{brief.watchlist.visibility === "organization" ? "Team" : "Private"}</span></div><h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{brief.watchlist.name}</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">Observed activity within {scope.radiusMiles} {scope.radiusMiles === 1 ? "mile" : "miles"} of <strong className="font-semibold text-white">{scope.label}</strong>. This brief reports what changed and when, without inferring occupancy, achieved rent, or causation.</p></div><div className="rounded-2xl bg-white/10 p-5 lg:min-w-56"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/55">Evidence current through</p><p className="mt-2 text-lg font-semibold">{dateTime(brief.sourceAsOf, timeZone)}</p><p className="mt-3 text-xs leading-5 text-white/55">Persisted Daily Editions only</p></div></div>
      <div className="grid border-t border-white/10 sm:grid-cols-3"><div className="px-7 py-5 sm:px-10"><p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Center activity, 7 days</p><p className="mt-2 text-3xl font-semibold">{subjectEvents.length}</p><p className="mt-1 text-xs text-white/55">{brief.subjectPropertyId ? "Observed at the subject property" : "No source property identity retained"}</p></div><div className="border-white/10 px-7 py-5 sm:border-l sm:px-10"><p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Peer activity, 7 days</p><p className="mt-2 text-3xl font-semibold">{peerEvents}</p><p className="mt-1 text-xs text-white/55">Observed elsewhere in the radius</p></div><div className="border-white/10 px-7 py-5 sm:border-l sm:px-10"><p className="text-[10px] font-bold uppercase tracking-wider text-white/50">Coverage</p><p className="mt-2 text-3xl font-semibold">{brief.current7d.coverageDays}/{brief.current7d.expectedDays}</p><p className="mt-1 text-xs text-white/55">Persisted daily editions represented</p></div></div>
    </header>

    {(!brief.current7d.complete || !brief.comparison.available) && <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800">Evidence coverage</p><p className="mt-2 text-sm leading-6 text-amber-950">The rolling window contains {brief.current7d.coverageDays} of 7 persisted daily editions{brief.current7d.eventsTruncated ? " and at least one edition retained a truncated event set" : ""}. Seven-day activity is shown as retained evidence, but a prior-period comparison is withheld until both seven-day windows are complete and untruncated.</p></section>}

    <section className="mt-7" aria-labelledby="competitive-set-24h"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700">Latest observed window</p><h2 id="competitive-set-24h" className="mt-1 text-3xl font-semibold tracking-tight text-navy">What moved in 24 hours</h2></div><p className="text-xs font-semibold text-slate-500">{brief.current24h.events.length} retained matches</p></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{MARKET_IQ_COMPETITIVE_SET_BRIEF_EVENT_TYPES.map((eventType) => <article key={eventType} className={`rounded-2xl border-l-4 p-5 ${EVENT_COLORS[eventType]}`}><p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{EVENT_LABELS[eventType]}</p><p className="mt-3 text-4xl font-semibold">{brief.current24h.counts[eventType]}</p></article>)}</div></section>

    <section className="mt-10 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><header className="grid gap-5 border-b border-slate-100 bg-slate-50 px-7 py-7 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">Rolling evidence</p><h2 className="mt-1 text-3xl font-semibold tracking-tight text-navy">Seven-day activity mix</h2><p className="mt-2 text-sm leading-6 text-slate-600">Unique events are deduplicated across persisted Daily Editions using their observed event identity.</p></div><p className="text-sm font-semibold text-slate-500">{brief.current7d.events.length} unique retained events</p></header><div className="grid divide-y divide-slate-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">{MARKET_IQ_COMPETITIVE_SET_BRIEF_EVENT_TYPES.map((eventType) => {
      const metric = brief.comparison.metrics.find((candidate) => candidate.eventType === eventType)!;
      return <article key={eventType} className="p-6"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{EVENT_LABELS[eventType]}</p><div className="mt-3 flex items-end justify-between gap-3"><p className="text-3xl font-semibold text-navy">{metric.current}</p>{brief.comparison.available && <p className={`rounded-full px-2.5 py-1 text-xs font-bold ${metric.difference > 0 ? "bg-orange-50 text-orange-800" : metric.difference < 0 ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}>{metric.difference > 0 ? "+" : ""}{metric.difference} vs prior 7d</p>}</div></article>;
    })}</div></section>

    {brief.largestRentMoves.length > 0 && <section className="mt-10 rounded-3xl border border-sky-200 bg-sky-50/60 p-7"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-800">Asking-rent evidence</p><h2 className="mt-2 text-2xl font-semibold text-navy">Largest confirmed moves</h2><div className="mt-5 grid gap-4 lg:grid-cols-2">{brief.largestRentMoves.map((event) => <article key={event.key} className="rounded-2xl bg-white p-5 ring-1 ring-sky-100"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-800">{rentMove(event)}</span>{event.isSubject && <span className="rounded-full bg-navy px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Subject</span>}</div><h3 className="mt-3 text-base font-semibold text-navy">{event.headline}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{event.detail}</p><p className="mt-3 text-xs text-slate-400">Observed {dateTime(event.observedAt, timeZone)}</p></article>)}</div></section>}

    <div className="mt-10"><MarketIqDailyActivityMap events={brief.sevenDayListingEvents} leaseUpAlerts={brief.sevenDayLeaseUpAlerts} marketId={brief.watchlist.marketId} marketName={marketName} sectionId="competitive-set-map" eyebrow="Competitive geography" heading={`Activity around ${scope.label}`} description={`Source-located retained events observed within the saved ${scope.radiusMiles}-mile competitive radius during the rolling evidence window.`} /></div>

    <section className="mt-10 overflow-hidden rounded-3xl border border-slate-200 bg-white"><header className="grid gap-5 border-b border-slate-100 px-7 py-7 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">Evidence timeline</p><h2 className="mt-1 text-3xl font-semibold tracking-tight text-navy">Select findings for a client report</h2><p className="mt-2 text-sm leading-6 text-slate-600">Choose up to 10 observed findings. The report composer will preserve their timestamps and disclosure separately from your editorial commentary.</p></div><div className="text-right"><p className="text-sm font-semibold text-navy">{selected.length} selected</p><Link aria-disabled={!selected.length} href={selected.length ? reportHref : "#"} className={`mt-2 inline-flex rounded-lg px-4 py-2.5 text-sm font-semibold ${selected.length ? "bg-navy text-white" : "pointer-events-none bg-slate-200 text-slate-400"}`}>Add to client report</Link></div></header>
      {brief.current7d.events.length ? <div className="divide-y divide-slate-100">{brief.current7d.events.slice(0, 30).map((event) => {
        const evidenceUrl = `/market-iq/daily?market=${encodeURIComponent(brief.watchlist.marketId)}&edition=${encodeURIComponent(event.editionId)}${event.sectionHref}`;
        return <article key={event.key} className="grid gap-4 px-6 py-5 sm:grid-cols-[auto_72px_minmax(0,1fr)_auto] sm:items-center"><label><span className="sr-only">Include {event.headline} in client report</span><input type="checkbox" checked={selected.includes(event.key)} disabled={!selected.includes(event.key) && selected.length >= 10} onChange={() => toggle(event.key)} className="h-4 w-4 rounded border-slate-300 accent-teal-700" /></label>{event.imageUrl ? <Image src={event.imageUrl} alt="" width={72} height={54} unoptimized className="h-[54px] w-[72px] rounded-lg object-cover" /> : <div className="hidden h-[54px] w-[72px] rounded-lg bg-slate-100 sm:block" />}<div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border-l-2 px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${EVENT_COLORS[event.eventType]}`}>{EVENT_LABELS[event.eventType]}</span>{event.isSubject && <span className="rounded-full bg-navy px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white">Subject</span>}</div><h3 className="mt-2 text-sm font-semibold text-navy">{event.headline}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{event.detail}</p><p className="mt-2 text-[10px] font-semibold text-slate-400">Observed {dateTime(event.observedAt, timeZone)}</p></div><div className="flex flex-wrap gap-3 text-xs font-semibold sm:flex-col sm:items-end">{event.propertyId && <Link href={marketIqPropertyActivityPath(brief.watchlist.marketId, event.propertyId)} className="text-teal-800">Property</Link>}<Link href={evidenceUrl} className="text-violet-800">Evidence</Link></div></article>;
      })}</div> : <p className="px-7 py-12 text-center text-sm text-slate-500">No retained events matched this competitive set in the rolling window.</p>}
    </section>

    <footer className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5 text-xs leading-6 text-slate-500">Observed listing activity only. Asking rents are advertised, concessions are not verified, and off-market means leased or withdrawn, undetermined. Counts describe unique retained event records inside the saved radius. No standing inventory, achieved rent, occupancy, causation, or locally recomputed rent trend is presented.</footer>
  </div>;
}
