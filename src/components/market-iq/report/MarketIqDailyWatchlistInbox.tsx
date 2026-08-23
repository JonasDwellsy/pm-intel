"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import type { MarketIqDailyDeliveryCadence, MarketIqDailyDeliveryState, MarketIqDailyInboxMatch } from "@/lib/market-iq/daily-watchlist-delivery";
import {
  MARKET_IQ_DAILY_TRIAGE_STATUSES,
  type MarketIqDailyTriageMutationResult,
} from "@/lib/market-iq/daily-watchlist-triage";
import { marketIqPropertyActivityPath } from "@/lib/market-iq/property-activity";

type Result = { ok: true } | { ok: false; message: string };
type UpdateTriage = (matchId: string, input: {
  status: MarketIqDailyInboxMatch["triage"]["status"];
  assignedToUserId: string | null;
}) => Promise<MarketIqDailyTriageMutationResult>;
type AddNote = (matchId: string, body: string) => Promise<MarketIqDailyTriageMutationResult>;

const STATUS_LABELS: Record<MarketIqDailyInboxMatch["triage"]["status"], string> = {
  new: "New",
  reviewing: "Reviewing",
  dismissed: "Dismissed",
  resolved: "Resolved",
};

function MatchTriageControls({ match, state, updateTriage, addNote, onChange }: {
  match: MarketIqDailyInboxMatch;
  state: MarketIqDailyDeliveryState;
  updateTriage: UpdateTriage;
  addNote: AddNote;
  onChange: (match: MarketIqDailyInboxMatch) => void;
}) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(input: Partial<MarketIqDailyInboxMatch["triage"]>) {
    startTransition(async () => {
      setMessage(null);
      const result = await updateTriage(match.id, {
        status: input.status ?? match.triage.status,
        assignedToUserId: input.assignedToUserId === undefined ? match.triage.assignedToUserId : input.assignedToUserId,
      });
      if (!result.ok) { setMessage(result.message); return; }
      onChange({ ...match, triage: { ...match.triage, status: result.status, assignedToUserId: result.assignedToUserId } });
    });
  }

  function submitNote() {
    startTransition(async () => {
      setMessage(null);
      const result = await addNote(match.id, note);
      if (!result.ok) { setMessage(result.message); return; }
      onChange({
        ...match,
        triage: {
          ...match.triage,
          status: result.status,
          assignedToUserId: result.assignedToUserId,
          notes: result.note ? [result.note, ...match.triage.notes] : match.triage.notes,
        },
      });
      setNote("");
    });
  }

  return <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <label><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Status</span><select aria-label={`Status for ${match.headline}`} value={match.triage.status} disabled={pending} onChange={(event) => update({ status: event.target.value as MarketIqDailyInboxMatch["triage"]["status"] })} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-navy">{MARKET_IQ_DAILY_TRIAGE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
      <label><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Assigned to</span><select aria-label={`Assignee for ${match.headline}`} value={match.triage.assignedToUserId ?? ""} disabled={pending} onChange={(event) => update({ assignedToUserId: event.target.value || null })} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-navy"><option value="">Unassigned</option>{state.teamMembers.map((member) => <option key={member.userId} value={member.userId}>{member.name}{member.userId === state.viewerUserId ? " (you)" : ""}</option>)}</select></label>
    </div>
    <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-violet-800">Internal notes ({match.triage.notes.length})</summary><div className="mt-3 space-y-3">{match.triage.notes.slice(0, 5).map((item) => <div key={item.id} className="rounded-lg bg-white p-3 text-xs leading-5 text-slate-600"><p>{item.body}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">{item.authorName} · {new Date(item.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div>)}<label className="block"><span className="sr-only">Add internal note for {match.headline}</span><textarea value={note} maxLength={1_000} onChange={(event) => setNote(event.target.value)} placeholder="Add context for your team" className="min-h-20 w-full rounded-lg border border-slate-300 bg-white p-3 text-xs text-navy" /></label><button type="button" disabled={pending || !note.trim()} onClick={submitNote} className="rounded-md bg-violet-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Add note</button></div></details>
    {message && <p role="status" className="mt-2 text-xs text-red-700">{message}</p>}
  </div>;
}

export function MarketIqDailyWatchlistInbox({ state, savePreference, markRead, updateTriage, addNote }: {
  state: MarketIqDailyDeliveryState;
  savePreference: (cadence: MarketIqDailyDeliveryCadence) => Promise<Result>;
  markRead: (ids: string[]) => Promise<Result>;
  updateTriage: UpdateTriage;
  addNote: AddNote;
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

  function updateMatch(next: MarketIqDailyInboxMatch) {
    setMatches((current) => current.map((match) => match.id === next.id ? next : match));
  }

  return <section id="daily-watchlist-inbox" className="mb-6 scroll-mt-24 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-[0_14px_40px_rgba(76,29,149,0.08)]" aria-labelledby="daily-watchlist-inbox-heading">
    <header className="grid gap-5 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-6 py-6 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-800">Personal delivery · team workflow</p><h2 id="daily-watchlist-inbox-heading" className="mt-1 text-2xl font-semibold tracking-tight text-navy">Your match inbox</h2><p className="mt-2 text-sm leading-6 text-slate-600">Newly observed events matched to watchlists you own or follow. Delivery is personal; status, assignment, and notes are shared with teammates on team watchlists.</p></div><div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-500" htmlFor="daily-delivery-cadence">Delivery</label><select id="daily-delivery-cadence" value={cadence} disabled={pending} onChange={(event) => updateCadence(event.target.value as MarketIqDailyDeliveryCadence)} className="mt-1 block h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-navy"><option value="in_app_only">In-app only</option><option value="daily">Daily email</option><option value="weekly">Weekly summary</option></select></div></header>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-3"><p className="text-xs text-slate-500"><strong className="text-navy">{unread.length}</strong> unread · {matches.length} recent</p>{unread.length > 0 && <button type="button" disabled={pending} onClick={markAllRead} className="text-xs font-semibold text-violet-800">Mark all read</button>}</div>
    {matches.length ? <div className="divide-y divide-slate-100">{matches.slice(0, 12).map((match) => {
      const editionUrl = `/market-iq/daily?market=${encodeURIComponent(match.marketId)}&edition=${encodeURIComponent(match.editionId)}${match.sectionHref}`;
      const destinationUrl = match.destinationHref ?? editionUrl;
      return <article key={match.id} className={`grid gap-3 px-6 py-5 lg:grid-cols-[1fr_auto] ${match.readAt ? "bg-white" : "bg-violet-50/35"}`}><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">{match.eventType.replaceAll("_", " ")}</span>{match.matchKind === "competitive_signal" && <span className="rounded-full bg-teal-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-teal-800">Grouped signal · {match.evidenceCount} events</span>}<span className="text-[10px] font-semibold text-violet-700">{match.watchlistName}</span>{match.watchlistVisibility === "organization" && <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-violet-800">Team</span>}{!match.readAt && <span className="h-2 w-2 rounded-full bg-violet-600" aria-label="Unread" />}</div><h3 className="mt-2 text-sm font-semibold text-navy">{match.headline}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{match.detail}</p><div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">{match.propertyId && <Link href={marketIqPropertyActivityPath(match.marketId, match.propertyId)} className="text-teal-800">View property</Link>}<Link href={destinationUrl} className="text-violet-800">{match.matchKind === "competitive_signal" ? "Open competitive brief" : "Open Daily Edition"}</Link></div><MatchTriageControls match={match} state={state} updateTriage={updateTriage} addNote={addNote} onChange={updateMatch} /></div><time dateTime={match.observedAt} className="text-[11px] font-semibold tabular-nums text-slate-400">{new Date(match.observedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></article>;
    })}</div> : <p className="px-6 py-10 text-center text-sm text-slate-500">No persisted matches yet. The inbox will populate after the next nightly snapshot evaluates watchlists you own or follow.</p>}
    {message && <p aria-live="polite" className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">{message}</p>}
  </section>;
}
