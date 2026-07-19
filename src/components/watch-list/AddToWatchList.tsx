"use client";

// v0.27 (Task 6) — "Add to watch list" client island. A bookmark button
// that opens a small popover listing the signed-in user's OWN watch
// lists (pinned, smart, or hybrid), each with a checkbox reflecting
// current membership. Toggling calls POST/DELETE
// /api/watch-lists/[id]/members; a "+ New list…" row creates a fresh
// list (POST /api/watch-lists with empty criteria — a fresh list has
// no criteria, so it derives as a pinned list) and pins into it
// immediately.
//
// Mounted on three surfaces: the scorecard header (ScorecardHeader.tsx,
// gated by !publicSample), market rows (PMListItem.tsx), and search rows
// (SearchResultRow.tsx, operator tiers only). The gating for anonymous
// visitors lives HERE (useAuth().isSignedIn) rather than being threaded
// as a prop through every host — PMListItem/SearchResultRow are rendered
// on fully public pages with no existing per-row auth context, so
// self-gating keeps this a drop-in island. The scorecard mount is also
// unconditionally behind Clerk's middleware (only /sample is public,
// and that's excluded via !publicSample by the caller already), so
// isSignedIn is true there in practice.
//
// Membership check: GET /api/watch-lists returns every list visible to
// the caller (own + shared-in-org); we filter to ownerId === the
// caller's own userId — any of your own lists, regardless of kind, are
// valid pin targets (the server's add/remove member routes authorize via
// canEditList, not via kind, so pinning onto a smart/hybrid list already
// works server-side). A shared-in-org list you don't own is excluded
// even though canEditList may allow editing it — surfacing someone
// else's list in a per-operator quick-pin menu would be a confusing
// scope creep for this control. For each of the caller's own lists
// (typically a handful), we then GET /api/watch-lists/[id]/members to
// resolve whether this memberKey is already pinned — an N+1 fan-out,
// deferred to popover-open so a market page with 50 rows never fires
// 50×N background requests.

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { addOperatorsToWatchList } from "@/lib/watch-list/pin-client";

interface AddToWatchListProps {
  /** canonicalOperatorId ?? pmSlug — the one-company pin key used
   *  everywhere else in the watch-list pin system (see apply.ts). */
  memberKey: string;
  operatorName: string;
  /** Icon-only trigger (market/search rows). Default renders the full
   *  labeled pill button (scorecard header). */
  compact?: boolean;
}

/** Minimal shape this component reads off a watch-list row — decoupled
 *  from the full server-side WatchListRecord (createdAt/criteria/etc.)
 *  so this client module and its tests don't need to know that shape. */
interface WatchListSummary {
  id: string;
  name: string;
  ownerId: string;
}

interface MemberRow {
  memberKey: string;
}

export function AddToWatchList({
  memberKey,
  operatorName,
  compact = false,
}: AddToWatchListProps) {
  const { isSignedIn, userId } = useAuth();

  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [lists, setLists] = React.useState<WatchListSummary[] | null>(null);
  const [pinnedIn, setPinnedIn] = React.useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [newListName, setNewListName] = React.useState("");
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  // Outside click + Escape close — matches FitScoreBadge/CopyLinkButton.
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function loadPinnedLists() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/watch-lists");
      if (!res.ok) throw new Error(`Failed to load watch lists (${res.status}).`);
      const data = (await res.json()) as { watchListes: WatchListSummary[] };
      const mine = data.watchListes.filter((w) => w.ownerId === userId);
      setLists(mine);

      // Resolve current membership per list. Small N (a user's own pin
      // lists) so an N+1 GET fan-out is fine — there's no batch
      // "is memberKey in these lists" endpoint.
      const hits = await Promise.all(
        mine.map(async (w) => {
          try {
            const r = await fetch(`/api/watch-lists/${w.id}/members`);
            if (!r.ok) return null;
            const body = (await r.json()) as { members: MemberRow[] };
            return body.members.some((m) => m.memberKey === memberKey)
              ? w.id
              : null;
          } catch {
            return null;
          }
        })
      );
      setPinnedIn(new Set(hits.filter((id): id is string => id !== null)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load watch lists.");
      setLists([]);
    } finally {
      setLoading(false);
    }
  }

  function handleTrigger() {
    const next = !open;
    setOpen(next);
    if (next && lists === null) {
      void loadPinnedLists();
    }
  }

  async function togglePin(listId: string, currentlyPinned: boolean) {
    setPendingId(listId);
    setError(null);
    // Optimistic update — revert on failure.
    setPinnedIn((prev) => {
      const next = new Set(prev);
      if (currentlyPinned) next.delete(listId);
      else next.add(listId);
      return next;
    });
    try {
      const res = await fetch(`/api/watch-lists/${listId}/members`, {
        method: currentlyPinned ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberKey }),
      });
      if (!res.ok) throw new Error(`Failed to update watch list (${res.status}).`);
    } catch (e) {
      setPinnedIn((prev) => {
        const next = new Set(prev);
        if (currentlyPinned) next.add(listId);
        else next.delete(listId);
        return next;
      });
      setError(e instanceof Error ? e.message : "Failed to update watch list.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleCreate() {
    const name = newListName.trim();
    if (!name) return;
    setPendingId("__new__");
    setError(null);

    // Funnel through the shared helper (pin-client.ts) so the create +
    // pin contract matches every other "add operators to a watch list"
    // flow (market multi-select, search-and-add modal). The helper
    // creates the criteria-less list, then pins memberKey via the same
    // entitlement-safe /members POST as togglePin below.
    let result: Awaited<ReturnType<typeof addOperatorsToWatchList>>;
    try {
      result = await addOperatorsToWatchList({ newName: name }, [memberKey]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create watch list.");
      setPendingId(null);
      return;
    }

    // The list exists server-side now regardless of what happens with
    // the pin — add it to `lists` and close the create form immediately.
    // If the pin failed, the list still shows up in the popover as an
    // unchecked row; a retry pins the EXISTING list via its checkbox
    // (togglePin) instead of re-running this create flow and minting a
    // duplicate list.
    const created: WatchListSummary = {
      id: result.listId,
      name,
      ownerId: userId ?? "",
    };
    setLists((prev) => [...(prev ?? []), created]);
    setNewListName("");
    setShowCreate(false);

    if (result.failed > 0) {
      setError("Failed to update watch list.");
    } else {
      setPinnedIn((prev) => new Set(prev).add(created.id));
    }
    setPendingId(null);
  }

  // Anonymous / unentitled visitors never see the control — mirrors the
  // scorecard's !publicSample gating for the two hosts (PMListItem,
  // SearchResultRow) that render on fully public pages.
  //
  // Only bail on a CONFIRMED signed-out state (isSignedIn === false), not
  // Clerk's resolving state (isSignedIn === undefined) — same convention
  // as GatedLink (src/components/auth/GatedLink.tsx). Treating "resolving"
  // as "signed out" would pop the bookmark in after hydration on every
  // row once Clerk settles; rendering the control during the brief
  // resolving window instead means the (much more common, on these
  // authenticated hosts) signed-in case never flickers, at the cost of a
  // confirmed-anon visitor seeing it disappear a beat later.
  if (isSignedIn === false) return null;

  const triggerLabel = compact
    ? `Add ${operatorName} to a watch list`
    : "Add to watch list";

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={handleTrigger}
        aria-expanded={open}
        aria-label={triggerLabel}
        className={
          compact
            ? "inline-flex h-7 w-7 items-center justify-center rounded-full border border-grid bg-white text-muted-foreground transition-colors hover:border-navy hover:text-navy focus-visible:border-navy focus-visible:outline-none"
            : "inline-flex items-center gap-1.5 rounded-full border border-grid bg-white px-3 py-1 text-[11.5px] font-semibold text-navy transition-colors hover:border-navy hover:bg-surface-soft focus-visible:border-navy focus-visible:bg-surface-soft focus-visible:outline-none"
        }
      >
        <BookmarkIcon filled={pinnedIn.size > 0} />
        {!compact && "Watch list"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`Add ${operatorName} to a watch list`}
          className="absolute right-0 top-9 z-30 w-[260px] rounded-lg border border-grid bg-white p-3 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Pin to a watch list
          </p>

          {loading && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">Loading…</p>
          )}

          {!loading && lists !== null && lists.length === 0 && !showCreate && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              No watch lists yet.
            </p>
          )}

          {!loading && lists !== null && lists.length > 0 && (
            <ul className="mt-2 max-h-[220px] space-y-1 overflow-y-auto">
              {lists.map((list) => {
                const checked = pinnedIn.has(list.id);
                return (
                  <li key={list.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-navy hover:bg-surface-soft">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pendingId === list.id}
                        onChange={() => togglePin(list.id, checked)}
                        className="size-3.5 shrink-0 accent-teal"
                      />
                      <span className="truncate">{list.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <p role="alert" className="mt-2 text-[12px] text-bad">
              {error}
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
                  disabled={pendingId === "__new__" || newListName.trim().length === 0}
                  className="h-8 shrink-0 rounded-md bg-teal px-2.5 text-[12px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {pendingId === "__new__" ? "…" : "Create"}
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
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1z" />
    </svg>
  );
}
