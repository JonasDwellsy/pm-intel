"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import {
  EMPTY_MARKET_IQ_ALERT_WORKBENCH_FILTERS,
  filterMarketIqAlertWorkbenchItems,
  marketIqAlertWorkbenchCounts,
  type MarketIqAlertWorkbenchBulkInput,
  type MarketIqAlertWorkbenchBulkResult,
  type MarketIqAlertWorkbenchFilters,
  type MarketIqAlertWorkbenchItem,
  type MarketIqAlertWorkbenchState,
} from "@/lib/market-iq/daily-alert-workbench";
import type { MarketIqDailyTriageMutationResult, MarketIqDailyTriageStatus } from "@/lib/market-iq/daily-watchlist-triage";
import { MARKET_IQ_DAILY_TRIAGE_STATUSES } from "@/lib/market-iq/daily-watchlist-triage";
import { marketIqPropertyActivityPath } from "@/lib/market-iq/property-activity";

type Result = { ok: true } | { ok: false; message: string };
type UpdateTriage = (matchId: string, input: { status: MarketIqDailyTriageStatus; assignedToUserId: string | null }) => Promise<MarketIqDailyTriageMutationResult>;
type AddNote = (matchId: string, body: string) => Promise<MarketIqDailyTriageMutationResult>;

const STATUS_LABELS: Record<MarketIqDailyTriageStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  dismissed: "Dismissed",
  resolved: "Resolved",
};

const SCOPE_LABELS = {
  open: "Open",
  mine: "Assigned to me",
  unassigned: "Unassigned",
  all: "All alerts",
} as const;

function AlertItem({ item, state, selected, pending, onSelect, onUpdate, updateTriage, addNote }: {
  item: MarketIqAlertWorkbenchItem;
  state: MarketIqAlertWorkbenchState;
  selected: boolean;
  pending: boolean;
  onSelect: (selected: boolean) => void;
  onUpdate: (item: MarketIqAlertWorkbenchItem) => void;
  updateTriage: UpdateTriage;
  addNote: AddNote;
}) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [itemPending, startTransition] = useTransition();
  const disabled = pending || itemPending;

  function update(input: Partial<MarketIqAlertWorkbenchItem["triage"]>) {
    startTransition(async () => {
      setMessage(null);
      const result = await updateTriage(item.id, {
        status: input.status ?? item.triage.status,
        assignedToUserId: input.assignedToUserId === undefined ? item.triage.assignedToUserId : input.assignedToUserId,
      });
      if (!result.ok) { setMessage(result.message); return; }
      onUpdate({ ...item, triage: { ...item.triage, status: result.status, assignedToUserId: result.assignedToUserId } });
    });
  }

  function submitNote() {
    startTransition(async () => {
      setMessage(null);
      const result = await addNote(item.id, note);
      if (!result.ok) { setMessage(result.message); return; }
      onUpdate({
        ...item,
        triage: {
          ...item.triage,
          status: result.status,
          assignedToUserId: result.assignedToUserId,
          notes: result.note ? [result.note, ...item.triage.notes] : item.triage.notes,
        },
      });
      setNote("");
    });
  }

  const editionUrl = `/market-iq/daily?market=${encodeURIComponent(item.marketId)}&edition=${encodeURIComponent(item.editionId)}${item.sectionHref}`;
  const evidenceUrl = item.destinationHref ?? editionUrl;
  return <article className={`rounded-2xl border bg-white p-5 shadow-sm transition-colors ${selected ? "border-violet-400 ring-2 ring-violet-100" : "border-slate-200"}`}>
    <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)_16rem]">
      <label className="pt-1"><span className="sr-only">Select {item.headline}</span><input type="checkbox" checked={selected} disabled={disabled} onChange={(event) => onSelect(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-violet-700" /></label>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{item.eventType.replaceAll("_", " ")}</span>
          {item.matchKind === "competitive_signal" && <span className="rounded-full bg-teal-100 px-2 py-1 text-teal-800">Grouped signal · {item.evidenceCount} events</span>}
          <span className="text-teal-700">{item.marketName}</span>
          <span className="text-violet-700">{item.watchlistName}</span>
          {item.watchlistVisibility === "organization" && <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-800">Team</span>}
          {!item.readAt && <span className="rounded-full bg-orange-100 px-2 py-1 text-orange-800">Unread</span>}
        </div>
        <h2 className="mt-3 text-lg font-semibold leading-7 text-navy">{item.headline}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
        <p className="mt-2 text-xs text-slate-400">Observed {new Date(item.observedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}{item.city ? ` · ${item.city}` : ""}{item.propertyManagerName ? ` · ${item.propertyManagerName}` : ""}</p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
          {item.propertyId && <Link href={marketIqPropertyActivityPath(item.marketId, item.propertyId)} className="text-teal-800 hover:underline">View property</Link>}
          {item.competitiveSetHref && item.matchKind !== "competitive_signal" && <Link href={item.competitiveSetHref} className="text-teal-800 hover:underline">Open competitive brief</Link>}
          <Link href={evidenceUrl} className="text-violet-800 hover:underline">{item.matchKind === "competitive_signal" ? "Open grouped evidence" : "Open evidence"}</Link>
        </div>
      </div>
      <div className="rounded-xl bg-slate-50 p-4">
        <div className="grid gap-3">
          <label><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Status</span><select aria-label={`Status for ${item.headline}`} value={item.triage.status} disabled={disabled} onChange={(event) => update({ status: event.target.value as MarketIqDailyTriageStatus })} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-navy">{MARKET_IQ_DAILY_TRIAGE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
          <label><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Assigned to</span><select aria-label={`Assignee for ${item.headline}`} value={item.triage.assignedToUserId ?? ""} disabled={disabled} onChange={(event) => update({ assignedToUserId: event.target.value || null })} className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-navy"><option value="">Unassigned</option>{state.teamMembers.map((member) => <option key={member.userId} value={member.userId}>{member.name}{member.userId === state.viewerUserId ? " (you)" : ""}</option>)}</select></label>
        </div>
        <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-violet-800">Notes ({item.triage.notes.length})</summary><div className="mt-3 space-y-3">{item.triage.notes.slice(0, 5).map((entry) => <div key={entry.id} className="rounded-lg bg-white p-3 text-xs leading-5 text-slate-600"><p>{entry.body}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">{entry.authorName} · {new Date(entry.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div>)}<label className="block"><span className="sr-only">Add internal note for {item.headline}</span><textarea value={note} maxLength={1_000} onChange={(event) => setNote(event.target.value)} placeholder="Add context for your team" className="min-h-20 w-full rounded-lg border border-slate-300 bg-white p-3 text-xs text-navy" /></label><button type="button" disabled={disabled || !note.trim()} onClick={submitNote} className="rounded-md bg-violet-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Add note</button></div></details>
        {message && <p role="status" className="mt-2 text-xs text-red-700">{message}</p>}
      </div>
    </div>
  </article>;
}

export function MarketIqAlertWorkbench({ state, bulkUpdate, markRead, updateTriage, addNote }: {
  state: MarketIqAlertWorkbenchState;
  bulkUpdate: (matchIds: string[], input: MarketIqAlertWorkbenchBulkInput) => Promise<MarketIqAlertWorkbenchBulkResult>;
  markRead: (matchIds: string[]) => Promise<Result>;
  updateTriage: UpdateTriage;
  addNote: AddNote;
}) {
  const [items, setItems] = useState(state.items);
  const [filters, setFilters] = useState<MarketIqAlertWorkbenchFilters>(EMPTY_MARKET_IQ_ALERT_WORKBENCH_FILTERS);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<"keep" | MarketIqDailyTriageStatus>("keep");
  const [bulkAssignee, setBulkAssignee] = useState("keep");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const counts = useMemo(() => marketIqAlertWorkbenchCounts(items, state.viewerUserId), [items, state.viewerUserId]);
  const visible = useMemo(() => filterMarketIqAlertWorkbenchItems(items, filters, state.viewerUserId), [items, filters, state.viewerUserId]);
  const rendered = visible.slice(0, 100);
  const selectedSet = new Set(selected);
  const visibleIds = new Set(visible.map((item) => item.id));
  const selectedVisible = selected.filter((id) => visibleIds.has(id));
  const markets = [...new Map(items.map((item) => [item.marketId, item.marketName])).entries()].sort((left, right) => left[1].localeCompare(right[1]));
  const watchlists = [...new Map(items.map((item) => [item.watchlistId, item.watchlistName])).entries()].sort((left, right) => left[1].localeCompare(right[1]));
  const eventTypes = [...new Set(items.map((item) => item.eventType))].sort();

  function patchItem(next: MarketIqAlertWorkbenchItem) {
    setItems((current) => current.map((item) => item.id === next.id ? next : item));
  }

  function selectVisible() {
    const ids = rendered.map((item) => item.id);
    setSelected(ids.every((id) => selectedSet.has(id)) ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]);
  }

  function applyBulk() {
    const input: MarketIqAlertWorkbenchBulkInput = {
      ...(bulkStatus !== "keep" ? { status: bulkStatus } : {}),
      ...(bulkAssignee !== "keep" ? { assignedToUserId: bulkAssignee || null } : {}),
    };
    startTransition(async () => {
      setMessage(null);
      const result = await bulkUpdate(selectedVisible, input);
      if (!result.ok) { setMessage(result.message); return; }
      const updated = new Set(result.updatedMatchIds);
      setItems((current) => current.map((item) => updated.has(item.id) ? {
        ...item,
        triage: {
          ...item.triage,
          ...(bulkStatus !== "keep" ? { status: bulkStatus } : {}),
          ...(bulkAssignee !== "keep" ? { assignedToUserId: bulkAssignee || null } : {}),
        },
      } : item));
      setSelected([]);
      setMessage(`${result.updatedMatchIds.length} alert${result.updatedMatchIds.length === 1 ? "" : "s"} updated.`);
    });
  }

  function markSelectedRead() {
    startTransition(async () => {
      const result = await markRead(selectedVisible);
      if (!result.ok) { setMessage(result.message); return; }
      const updated = new Set(selectedVisible);
      const readAt = new Date().toISOString();
      setItems((current) => current.map((item) => updated.has(item.id) ? { ...item, readAt } : item));
      setSelected([]);
    });
  }

  return <div>
    <header className="rounded-3xl bg-navy px-7 py-8 text-white shadow-[0_20px_60px_rgba(23,50,74,0.18)] sm:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-300">Market intelligence workflow</p>
      <div className="mt-2 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end"><div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Alert workbench</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Review observed activity across every market and watchlist you follow. Status, assignment, and notes stay shared on team watchlists; read state remains personal.</p></div><p className="text-sm text-slate-300"><strong className="text-3xl text-white">{counts.open}</strong><br />open alerts</p></div>
    </header>

    <section aria-label="Alert views" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{(Object.keys(SCOPE_LABELS) as Array<keyof typeof SCOPE_LABELS>).map((scope) => <button key={scope} type="button" onClick={() => setFilters((current) => ({ ...current, scope }))} className={`rounded-2xl border p-5 text-left ${filters.scope === scope ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white"}`}><span className="text-xs font-bold uppercase tracking-wider text-slate-500">{SCOPE_LABELS[scope]}</span><span className="mt-2 block text-3xl font-semibold text-navy">{counts[scope]}</span></button>)}</section>

    <section aria-label="Alert filters" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="xl:col-span-2"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Search</span><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Property, manager, city, or watchlist" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-navy" /></label>
        <FilterSelect label="Market" value={filters.marketId} onChange={(marketId) => setFilters((current) => ({ ...current, marketId }))} options={markets} />
        <FilterSelect label="Watchlist" value={filters.watchlistId} onChange={(watchlistId) => setFilters((current) => ({ ...current, watchlistId }))} options={watchlists} />
        <FilterSelect label="Event" value={filters.eventType} onChange={(eventType) => setFilters((current) => ({ ...current, eventType }))} options={eventTypes.map((eventType) => [eventType, eventType.replaceAll("_", " ")])} />
        <label><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as MarketIqAlertWorkbenchFilters["status"] }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy"><option value="all">All statuses</option>{MARKET_IQ_DAILY_TRIAGE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
        <label><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Assignee</span><select value={filters.assignee} onChange={(event) => setFilters((current) => ({ ...current, assignee: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy"><option value="all">All assignees</option><option value="unassigned">Unassigned</option>{state.teamMembers.map((member) => <option key={member.userId} value={member.userId}>{member.name}{member.userId === state.viewerUserId ? " (you)" : ""}</option>)}</select></label>
        <label><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Watchlist access</span><select value={filters.visibility} onChange={(event) => setFilters((current) => ({ ...current, visibility: event.target.value as MarketIqAlertWorkbenchFilters["visibility"] }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy"><option value="all">Personal and team</option><option value="private">Personal only</option><option value="organization">Team only</option></select></label>
        <label><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Order</span><select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as MarketIqAlertWorkbenchFilters["sort"] }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-sm text-slate-500"><strong className="text-navy">{visible.length}</strong> matching alerts</p><button type="button" onClick={() => setFilters(EMPTY_MARKET_IQ_ALERT_WORKBENCH_FILTERS)} className="text-sm font-semibold text-violet-800">Reset filters</button></div>
    </section>

    <section aria-label="Bulk alert actions" className="sticky top-3 z-20 mt-6 rounded-2xl border border-slate-300 bg-white/95 p-4 shadow-lg backdrop-blur">
      <div className="flex flex-wrap items-end gap-3"><button type="button" onClick={selectVisible} className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-navy">{rendered.length > 0 && rendered.every((item) => selectedSet.has(item.id)) ? "Clear visible" : "Select visible"}</button><p className="h-10 min-w-24 py-2 text-sm text-slate-500"><strong className="text-navy">{selectedVisible.length}</strong> selected</p><label><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Set status</span><select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as typeof bulkStatus)} className="mt-1 h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="keep">Keep status</option>{MARKET_IQ_DAILY_TRIAGE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label><label><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">Assign to</span><select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)} className="mt-1 h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="keep">Keep assignee</option><option value="">Unassigned</option>{state.teamMembers.map((member) => <option key={member.userId} value={member.userId}>{member.name}{member.userId === state.viewerUserId ? " (you)" : ""}</option>)}</select></label><button type="button" disabled={pending || !selectedVisible.length || bulkStatus === "keep" && bulkAssignee === "keep"} onClick={applyBulk} className="h-10 rounded-lg bg-violet-800 px-4 text-sm font-semibold text-white disabled:opacity-40">Apply update</button><button type="button" disabled={pending || !selectedVisible.length} onClick={markSelectedRead} className="h-10 rounded-lg px-3 text-sm font-semibold text-violet-800 disabled:opacity-40">Mark read</button></div>
      {message && <p aria-live="polite" className="mt-3 text-xs text-slate-600">{message}</p>}
    </section>

    <div className="mt-6 space-y-4">{rendered.map((item) => <AlertItem key={item.id} item={item} state={state} selected={selectedSet.has(item.id)} pending={pending} onSelect={(checked) => setSelected((current) => checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} onUpdate={patchItem} updateTriage={updateTriage} addNote={addNote} />)}</div>
    {!visible.length && <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><h2 className="text-xl font-semibold text-navy">No alerts match this view</h2><p className="mt-2 text-sm text-slate-500">Change the filters or open a different queue.</p></div>}
    {(visible.length > rendered.length || state.truncated) && <p className="mt-5 text-center text-xs text-slate-500">Showing the first {rendered.length.toLocaleString("en-US")} matching alerts. Narrow the filters to focus the queue.</p>}
  </div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-navy"><option value="all">All {label.toLocaleLowerCase("en-US")}s</option>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
