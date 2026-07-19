"use client";

// Client wrapper for the market "Ranked operators" list. Renders the sort
// control + the list, re-ordering the (already server-loaded) rows instantly
// on the client. Default order = the server's star ranking (gold-then-silver,
// then within-cohort rank), preserved as the incoming array order.
//
// Task 4 (operator-roster watch lists) — discovery-driven roster builder.
// A signed-in asset manager can flip on "Select" to reveal a checkbox per
// row (mounted via PMListItem's optional `selection` prop — see
// PMListItem.tsx), multi-select operators straight off this ranked list,
// then add them all to one of their own watch lists (or a brand-new one)
// in a single action via a sticky bottom action bar. Submission funnels
// through the same addOperatorsToWatchList helper (pin-client.ts) used by
// AddToWatchList's own "+ New list" path and the Watch Operators
// search-and-add modal — one create+pin contract for every "add operators
// to a watch list" flow in the app.
//
// All of this is gated on isSignedIn: the market page is public, and
// anonymous visitors see the list exactly as before (no Select toggle, no
// checkboxes, no action bar). Pinning requires auth anyway, and the
// /members endpoint re-authorizes server-side — the market view already
// only renders operators the caller is entitled to see, so no additional
// gating is needed here.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { PMListItem } from "./PMListItem";
import type { PMListItem as PMListItemData } from "@/lib/types";
import { sortRankedOperators, type OperatorSortKey } from "@/lib/rank-sort";
import { addOperatorsToWatchList } from "@/lib/watch-list/pin-client";

const SORT_OPTIONS: Array<{ key: OperatorSortKey; label: string }> = [
  { key: "rank", label: "Star ranking" },
  { key: "size", label: "Portfolio size" },
  { key: "name", label: "Name (A–Z)" },
];

/** Minimal shape read off a watch-list row for the target picker — mirrors
 *  AddToWatchList's own WatchListSummary so this module doesn't need the
 *  full server-side WatchListRecord shape (createdAt/criteria/etc.). */
interface WatchListSummary {
  id: string;
  name: string;
  ownerId: string;
}

/** The one-company pin key used everywhere else in the watch-list pin
 *  system (apply.ts, AddToWatchList, the Watch Operators modal) — fixed
 *  per the brief, identical to PMListItem's own AddToWatchList mount. */
function memberKeyOf(pm: PMListItemData): string {
  return pm.canonicalOperatorId ?? pm.slug;
}

export function RankedOperatorList({
  pms,
  stateSlug,
  citySlug,
  submarket,
  marketHref,
  marketCity,
}: {
  pms: PMListItemData[];
  stateSlug: string;
  citySlug: string;
  /** Active submarket filter (slug + display label) or null. */
  submarket: { slug: string; displayName: string } | null;
  marketHref: string;
  marketCity: string;
}) {
  const { isSignedIn, userId } = useAuth();

  const [sort, setSort] = useState<OperatorSortKey>("rank");

  // --- Task 4: multi-select roster builder -------------------------------
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lists, setLists] = useState<WatchListSummary[] | null>(null);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const sorted = useMemo(() => sortRankedOperators(pms, sort), [pms, sort]);

  // Outside click + Escape close — mirrors AddToWatchList's popover
  // dismissal (src/components/watch-list/AddToWatchList.tsx). Resets the
  // "+ New list" sub-form too, same as the Cancel/Clear handlers below,
  // so a later reopen never lands on a stale pre-filled create form.
  useEffect(() => {
    if (!pickerOpen) return;
    function close() {
      setPickerOpen(false);
      setShowCreate(false);
      setNewListName("");
    }
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  function toggleSelectMode() {
    setSelectMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelected(new Set());
        setPickerOpen(false);
        setShowCreate(false);
        setNewListName("");
      }
      return next;
    });
    setConfirmation(null);
  }

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setPickerOpen(false);
    setShowCreate(false);
    setNewListName("");
  }

  // Fetch the caller's OWN lists — same ownerId === userId filter shape
  // AddToWatchList's loadPinnedLists uses. Unlike that control, we don't
  // need a membership fan-out here: picking a destination just needs the
  // candidate list of targets, not per-list "already pinned" state.
  async function loadLists() {
    setListsLoading(true);
    setListsError(null);
    try {
      const res = await fetch("/api/watch-lists");
      if (!res.ok) throw new Error(`Failed to load watch lists (${res.status}).`);
      const data = (await res.json()) as { watchListes: WatchListSummary[] };
      setLists(data.watchListes.filter((w) => w.ownerId === userId));
    } catch (e) {
      setListsError(e instanceof Error ? e.message : "Failed to load watch lists.");
      setLists([]);
    } finally {
      setListsLoading(false);
    }
  }

  function openPicker() {
    setSubmitError(null);
    setConfirmation(null);
    setPickerOpen((prev) => {
      const next = !prev;
      if (next && lists === null) void loadLists();
      return next;
    });
  }

  // Shared submit path for both "choose an existing list" and "+ New
  // list" — funnels through the T1 helper so create+pin goes over the
  // wire identically to AddToWatchList and the Watch Operators modal.
  async function submitTo(target: { listId: string } | { newName: string }) {
    setSubmitting(true);
    setSubmitError(null);
    const keys = Array.from(selected);
    try {
      const result = await addOperatorsToWatchList(target, keys);
      // Clear selection + selectMode on completion (full success or
      // partial failure) — the list mutation already happened server-side
      // either way; only a hard failure (create POST itself throwing,
      // caught below) leaves the selection intact for a retry.
      setSelected(new Set());
      setSelectMode(false);
      setPickerOpen(false);
      setShowCreate(false);
      setNewListName("");
      setConfirmation(
        result.failed > 0
          ? `Added ${result.added} of ${keys.length} operators — ${result.failed} couldn't be added.`
          : `Added ${result.added} operator${result.added === 1 ? "" : "s"} to the watch list.`
      );
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to add to watch list.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreate() {
    const name = newListName.trim();
    if (!name) return;
    await submitTo({ newName: name });
  }

  if (pms.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-grid bg-[#FAFAF8] p-10 text-center">
        <p className="text-sm font-medium text-navy">
          {submarket
            ? `No operators observed in ${submarket.displayName}.`
            : "No operators in this segment yet."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {submarket ? (
            <>
              The submarket filter matched zero operators in {marketCity}.{" "}
              <Link href={marketHref} className="text-teal hover:text-teal-700">
                Clear the filter
              </Link>{" "}
              to view all operators.
            </>
          ) : (
            <>
              Try another filter or{" "}
              <Link href={marketHref} className="text-teal hover:text-teal-700">
                view all operators
              </Link>
              .
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <>
      {confirmation && (
        <div
          role="status"
          className="mb-3 flex items-center justify-between rounded-md border border-good/30 bg-good/5 px-3.5 py-2 text-[13px] font-medium text-good"
        >
          {confirmation}
          <button
            type="button"
            onClick={() => setConfirmation(null)}
            aria-label="Dismiss"
            className="text-good/70 hover:text-good"
          >
            ×
          </button>
        </div>
      )}

      <div className="mb-3 flex items-center justify-end gap-2">
        {isSignedIn !== false && (
          <button
            type="button"
            onClick={toggleSelectMode}
            aria-pressed={selectMode}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-grid bg-white px-3.5 text-[13px] font-medium text-navy transition-colors hover:border-navy"
          >
            {selectMode ? "Cancel" : "Select"}
          </button>
        )}
        <label className="inline-flex h-8 items-center gap-2 rounded-full border border-grid bg-white px-3.5 text-[13px] text-muted-foreground">
          Sort:
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as OperatorSortKey)}
            aria-label="Sort ranked operators"
            className="cursor-pointer bg-transparent font-medium text-navy focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="flex flex-col gap-3.5 pb-4">
        {sorted.map((pm) => {
          let pmSubmarket: { displayName: string; share: number | null } | null =
            null;
          if (submarket) {
            const idx = (pm.topCitySlugs ?? []).indexOf(submarket.slug);
            const share = idx >= 0 ? pm.topCityPcts?.[idx] ?? null : null;
            pmSubmarket = { displayName: submarket.displayName, share: share ?? null };
          }
          const key = memberKeyOf(pm);
          return (
            <PMListItem
              key={pm.slug}
              pm={pm}
              stateSlug={stateSlug}
              citySlug={citySlug}
              submarket={pmSubmarket}
              selection={
                isSignedIn !== false && selectMode
                  ? { selected: selected.has(key), onToggle: () => toggleSelected(key) }
                  : undefined
              }
            />
          );
        })}
      </ul>

      {isSignedIn !== false && selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-grid bg-white/95 shadow-[0_-8px_24px_-12px_rgba(15,31,63,0.18)] backdrop-blur">
          <div className="relative mx-auto flex max-w-[1080px] items-center justify-between px-6 py-3">
            <span className="text-[13.5px] font-semibold text-navy">
              {selected.size} selected
            </span>
            <div className="flex items-center gap-3">
              {/* wrapRef scopes the outside-click/Escape dismissal (the
                  useEffect above) to just the trigger + picker — it never
                  wraps the Clear button or the row checkboxes elsewhere on
                  the page, so it can't interfere with either. */}
              <div ref={wrapRef} className="relative">
                <button
                  type="button"
                  onClick={openPicker}
                  aria-expanded={pickerOpen}
                  className="text-[13px] font-semibold text-teal hover:text-teal-700"
                >
                  Add to a watch list
                </button>

                {pickerOpen && (
                  <div
                    role="dialog"
                    aria-label="Add to a watch list"
                    className="absolute bottom-full right-0 mb-2 w-[280px] rounded-lg border border-grid bg-white p-3 text-left shadow-xl"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Add to a watch list
                    </p>

                    {listsLoading && (
                      <p className="mt-2 text-[12.5px] text-muted-foreground">Loading…</p>
                    )}

                    {!listsLoading && lists !== null && lists.length === 0 && !showCreate && (
                      <p className="mt-2 text-[12.5px] text-muted-foreground">
                        No watch lists yet.
                      </p>
                    )}

                    {!listsLoading && lists !== null && lists.length > 0 && (
                      <ul className="mt-2 max-h-[200px] space-y-1 overflow-y-auto">
                        {lists.map((l) => (
                          <li key={l.id}>
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => void submitTo({ listId: l.id })}
                              className="block w-full truncate rounded-md px-1.5 py-1 text-left text-[13px] text-navy hover:bg-surface-soft disabled:opacity-50"
                            >
                              {l.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {listsError && (
                      <p role="alert" className="mt-2 text-[12px] text-bad">
                        {listsError}
                      </p>
                    )}
                    {submitError && (
                      <p role="alert" className="mt-2 text-[12px] text-bad">
                        {submitError}
                      </p>
                    )}

                    <div className="mt-2 border-t border-grid pt-2">
                      {showCreate ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            autoFocus
                            value={newListName}
                            onChange={(e) => setNewListName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleCreate();
                              }
                            }}
                            placeholder="List name"
                            aria-label="New watch list name"
                            className="h-8 min-w-0 flex-1 rounded-md border border-grid px-2 text-[12.5px] text-navy focus:border-navy focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void handleCreate()}
                            disabled={submitting || newListName.trim().length === 0}
                            className="h-8 shrink-0 rounded-md bg-teal px-2.5 text-[12px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                          >
                            {submitting ? "…" : "Create"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowCreate(true)}
                          className="text-[12.5px] font-semibold text-teal hover:text-teal-700"
                        >
                          ＋ New list…
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <span className="text-muted-2">·</span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-[13px] font-medium text-muted-foreground hover:text-navy"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
