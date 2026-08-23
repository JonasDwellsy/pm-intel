"use client";

import { useState, useTransition } from "react";

import {
  MARKET_IQ_COMPETITIVE_SIGNAL_CONDITIONS,
  MARKET_IQ_COMPETITIVE_SIGNAL_SCOPES,
  MARKET_IQ_COMPETITIVE_SIGNAL_WINDOWS,
  type MarketIqCompetitiveSetSignalRuleActionResult,
  type MarketIqCompetitiveSetSignalRuleInput,
  type MarketIqCompetitiveSetSignalRuleView,
} from "@/lib/market-iq/competitive-set-signal-rules";
import { MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES } from "@/lib/market-iq/daily-watchlists";

type SaveAction = (watchlistId: string, input: MarketIqCompetitiveSetSignalRuleInput) => Promise<MarketIqCompetitiveSetSignalRuleActionResult>;
type DeleteAction = (watchlistId: string, ruleId: string) => Promise<MarketIqCompetitiveSetSignalRuleActionResult>;

const EVENT_LABELS = {
  new_to_market: "New listings",
  rent_changes: "Rent moves",
  off_market: "Off market",
  aging_watch: "Aging watch",
  concessions: "Concessions",
  lease_up: "Lease-ups",
} as const;

const SCOPE_LABELS = { peers: "Peer properties", subject: "Subject property", all: "Entire radius" } as const;

function ruleDescription(rule: MarketIqCompetitiveSetSignalRuleInput) {
  const subject = SCOPE_LABELS[rule.propertyScope];
  const event = EVENT_LABELS[rule.eventType].toLocaleLowerCase("en-US");
  return rule.condition === "increase_at_least"
    ? `${subject}: ${event} increase by at least ${rule.threshold} versus the complete prior seven days.`
    : `${subject}: at least ${rule.threshold} ${event} within ${rule.windowDays === 1 ? "24 hours" : "seven days"}.`;
}

export function MarketIqCompetitiveSetSignalRules({ watchlistId, canConfigure, initialRules, saveRule, deleteRule }: {
  watchlistId: string;
  canConfigure: boolean;
  initialRules: MarketIqCompetitiveSetSignalRuleView[];
  saveRule: SaveAction;
  deleteRule: DeleteAction;
}) {
  const [rules, setRules] = useState(initialRules);
  const [draft, setDraft] = useState<MarketIqCompetitiveSetSignalRuleInput>({ eventType: "rent_changes", propertyScope: "peers", windowDays: 1, condition: "count_at_least", threshold: 3, enabled: true });
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(input: MarketIqCompetitiveSetSignalRuleInput, successMessage: string) {
    startTransition(async () => {
      setMessage(null);
      const result = await saveRule(watchlistId, input);
      if (!result.ok || !result.rule) { setMessage(result.ok ? "This signal rule could not be saved." : result.message); return; }
      setRules((current) => [result.rule!, ...current.filter((rule) => rule.id !== result.rule!.id)]);
      setMessage(successMessage);
    });
  }

  function remove(ruleId: string) {
    startTransition(async () => {
      const result = await deleteRule(watchlistId, ruleId);
      if (!result.ok) { setMessage(result.message); return; }
      setRules((current) => current.filter((rule) => rule.id !== ruleId));
      setMessage("Signal rule removed.");
    });
  }

  return <section className="mt-7 overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm" aria-labelledby="competitive-signal-rules-heading">
    <header className="grid gap-4 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-7 py-7 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">Personal signal rules</p><h2 id="competitive-signal-rules-heading" className="mt-1 text-2xl font-semibold tracking-tight text-navy">Alert only when movement becomes meaningful</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Each rule groups supporting observed events into one workbench signal. Rules are personal even when the competitive set is shared, and they use your existing email cadence.</p></div><span className="h-fit rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 ring-1 ring-violet-200">{rules.filter((rule) => rule.enabled).length} active</span></header>
    {canConfigure ? <div className="grid gap-5 border-b border-slate-100 bg-slate-50 px-7 py-6 lg:grid-cols-6 lg:items-end">
      <label className="text-xs font-semibold text-navy">Event<select value={draft.eventType} onChange={(event) => setDraft((current) => ({ ...current, eventType: event.target.value as MarketIqCompetitiveSetSignalRuleInput["eventType"] }))} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal">{MARKET_IQ_DAILY_WATCHLIST_EVENT_TYPES.map((eventType) => <option key={eventType} value={eventType}>{EVENT_LABELS[eventType]}</option>)}</select></label>
      <label className="text-xs font-semibold text-navy">Properties<select value={draft.propertyScope} onChange={(event) => setDraft((current) => ({ ...current, propertyScope: event.target.value as MarketIqCompetitiveSetSignalRuleInput["propertyScope"] }))} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal">{MARKET_IQ_COMPETITIVE_SIGNAL_SCOPES.map((scope) => <option key={scope} value={scope}>{SCOPE_LABELS[scope]}</option>)}</select></label>
      <label className="text-xs font-semibold text-navy">Condition<select value={draft.condition} onChange={(event) => { const condition = event.target.value as MarketIqCompetitiveSetSignalRuleInput["condition"]; setDraft((current) => ({ ...current, condition, ...(condition === "increase_at_least" ? { windowDays: 7 } : {}) })); }} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal">{MARKET_IQ_COMPETITIVE_SIGNAL_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition === "count_at_least" ? "Count reaches" : "Increase vs prior"}</option>)}</select></label>
      <label className="text-xs font-semibold text-navy">Window<select value={draft.windowDays} disabled={draft.condition === "increase_at_least"} onChange={(event) => setDraft((current) => ({ ...current, windowDays: Number(event.target.value) as MarketIqCompetitiveSetSignalRuleInput["windowDays"] }))} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal disabled:bg-slate-100">{MARKET_IQ_COMPETITIVE_SIGNAL_WINDOWS.map((days) => <option key={days} value={days}>{days === 1 ? "24 hours" : "7 days"}</option>)}</select></label>
      <label className="text-xs font-semibold text-navy">Threshold<input type="number" min={1} max={50} value={draft.threshold} onChange={(event) => setDraft((current) => ({ ...current, threshold: Number(event.target.value) }))} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal" /></label>
      <button type="button" disabled={pending || draft.threshold < 1 || draft.threshold > 50} onClick={() => save(draft, "Signal rule saved.")} className="h-10 rounded-lg bg-violet-800 px-4 text-sm font-semibold text-white disabled:opacity-40">Add rule</button>
    </div> : <p className="border-b border-slate-100 bg-amber-50 px-7 py-4 text-sm text-amber-900">Follow this team watchlist before creating personal signal rules.</p>}
    {rules.length ? <div className="divide-y divide-slate-100">{rules.map((rule) => <article key={rule.id} className="flex flex-col gap-4 px-7 py-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${rule.enabled ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{rule.enabled ? "Active" : "Paused"}</span><span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">{EVENT_LABELS[rule.eventType]}</span></div><p className="mt-2 text-sm font-semibold leading-6 text-navy">{ruleDescription(rule)}</p></div><div className="flex gap-3 text-xs font-semibold"><button type="button" disabled={pending} onClick={() => save({ ...rule, enabled: !rule.enabled }, rule.enabled ? "Signal rule paused." : "Signal rule activated.")} className="text-violet-800">{rule.enabled ? "Pause" : "Activate"}</button><button type="button" disabled={pending} onClick={() => remove(rule.id)} className="text-red-700">Remove</button></div></article>)}</div> : <p className="px-7 py-9 text-center text-sm text-slate-500">No signal rules yet. Individual observed events will continue to appear through the watchlist’s existing matching behavior.</p>}
    {message && <p role="status" className="border-t border-slate-100 px-7 py-3 text-xs font-semibold text-violet-800">{message}</p>}
  </section>;
}
