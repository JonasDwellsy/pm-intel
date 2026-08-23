"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { marketIqPropertyActivityPath } from "@/lib/market-iq/property-activity";
import type { MarketIqDailyDeliveryCadence, MarketIqDailyDeliveryState } from "@/lib/market-iq/daily-watchlist-delivery";

type Result = { ok: true } | { ok: false; message: string };

export function MarketIqDailyWatchlistInbox({ state, savePreference, markRead }: {
  state: MarketIqDailyDeliveryState;
  savePreference: (cadence: MarketIqDailyDeliveryCadence) => Promise<Result>;
  markRead: (ids: string[]) => Promise<Result>;
}) {
  const [cadence, setCadence] = useState(state.cadence);
  const [matches, setMatches] = useState(state.matches);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unread = matches.filter((match) => !match.readAt);

  function updateCadence(next: MarketIqDailyDeliveryCadence) {
    const prior = cadence;
    setCadence(next);
    startTransition(async () => {
      const result = await savePreference(next);
      if (!result.ok) { setCadence(prior); setMessage(result.message); }
      else setMessage(next === "in_app_only" ? "Matches will stay in your in-app inbox." : `${next === "daily" ? "Daily" : "Weekly"} email delivery is on.`);
    });
  }

  function markAllRead() {
    const ids = unread.map((match) => match.id);
    if (!ids.length) return;
    startTransition(async () => {
      const result = await markRead(ids);
      if (!result.ok) setMessage(result.message);
      else setMatches((current) => current.map((match) => ids.includes(match.id) ? { ...match, readAt: new Date().toISOString() } : match));
    });
  }

  return <section id="daily-watchlist-inbox" className="mb-6 scroll-mt-24 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-[0_14px_40px_rgba(76,29,149,0.08)]" aria-labelledby="daily-watchlist-inbox-heading">
    <header className="grid gap-5 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-6 py-6 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-800">Personal delivery</p><h2 id="daily-watchlist-inbox-heading" className="mt-1 text-2xl font-semibold tracking-tight text-navy">Your match inbox</h2><p className="mt-2 text-sm leading-6 text-slate-600">Newly observed events matched to your saved watchlists. Email is opt-in and empty updates are never sent.</p></div><div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-500" htmlFor="daily-delivery-cadence">Delivery</label><select id="daily-delivery-cadence" value={cadence} disabled={pending} onChange={(event) => updateCadence(event.target.value as MarketIqDailyDeliveryCadence)} className="mt-1 block h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-navy"><option value="in_app_only">In-app only</option><option value="daily">Daily email</option><option value="weekly">Weekly summary</option></select></div></header>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-3"><p className="text-xs text-slate-500"><strong className="text-navy">{unread.length}</strong> unread · {matches.length} recent</p>{unread.length > 0 && <button type="button" disabled={pending} onClick={markAllRead} className="text-xs font-semibold text-violet-800">Mark all read</button>}</div>
    {matches.length ? <div className="divide-y divide-slate-100">{matches.slice(0, 12).map((match) => { const editionUrl = `/market-iq/daily?market=${encodeURIComponent(match.marketId)}&edition=${encodeURIComponent(match.editionId)}${match.sectionHref}`; return <article key={match.id} className={`grid gap-3 px-6 py-5 lg:grid-cols-[1fr_auto] ${match.readAt ? "bg-white" : "bg-violet-50/35"}`}><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">{match.eventType.replaceAll("_", " ")}</span><span className="text-[10px] font-semibold text-violet-700">{match.watchlistName}</span>{!match.readAt && <span className="h-2 w-2 rounded-full bg-violet-600" aria-label="Unread" />}</div><h3 className="mt-2 text-sm font-semibold text-navy">{match.headline}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{match.detail}</p><div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">{match.propertyId && <Link href={marketIqPropertyActivityPath(match.marketId, match.propertyId)} className="text-teal-800">View property</Link>}<Link href={editionUrl} className="text-violet-800">Open Daily Edition</Link></div></div><time dateTime={match.observedAt} className="text-[11px] font-semibold tabular-nums text-slate-400">{new Date(match.observedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></article>; })}</div> : <p className="px-6 py-10 text-center text-sm text-slate-500">No persisted matches yet. The inbox will populate after the next nightly snapshot evaluates your watchlists.</p>}
    {message && <p aria-live="polite" className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">{message}</p>}
  </section>;
}
