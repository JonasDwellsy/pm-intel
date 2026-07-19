"use client";

// Operator-roster watch lists (Task 2) — "Watch operators" search-and-add
// modal. Lets an asset manager type operator names, add several as chips,
// name the list, then create it with those operators pinned in one shot.
// The index page (Task 3) opens this from a "Watch operators" button and,
// on success, lands on the new list's results page.
//
// Search wiring mirrors SearchInput.tsx exactly (useEntitledMarkets +
// filterResultsByEntitlement(searchPMs(query), entitled), same debounce
// shape) — this is the same client-side in-memory Fuse index, no new API.
// The pin key is derived via operatorMemberKey (extracted from
// SearchResultRow.tsx to src/lib/watch-list/operator-member-key.ts so
// both surfaces share one already-shipped derivation). Submission funnels
// through Task 1's addOperatorsToWatchList helper, which creates the
// criteria-less (pinned) list then POSTs each memberKey to the
// entitlement-safe /members endpoint.
//
// Modal primitive matches SearchModal.tsx's dialog/backdrop pattern
// (fixed-inset translucent backdrop, click-outside-to-close via
// stopPropagation on the inner panel, global Escape listener while open,
// autofocus the search input on open) rather than introducing a new
// overlay system.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  filterResultsByEntitlement,
  searchPMs,
  type PMSearchResult,
} from "@/lib/pm-search";
import { useEntitledMarkets } from "@/components/search/useEntitledMarkets";
import { operatorMemberKey } from "@/lib/watch-list/operator-member-key";
import { addOperatorsToWatchList } from "@/lib/watch-list/pin-client";

const RESULT_LIMIT = 8;
const DEBOUNCE_MS = 150;

interface SelectedOperator {
  name: string;
}

export function WatchOperatorsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, SelectedOperator>>(
    new Map()
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set only on the partial-failure path (list created, some pins failed)
  // so the error paragraph can offer a link to the list that already
  // exists rather than the user re-submitting (which would create a
  // second list — see handleSubmit).
  const [createdListId, setCreatedListId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the query the same way SearchInput does so the in-memory
  // Fuse index isn't re-queried on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  // Reset all transient state when the modal closes so the next open is
  // a fresh canvas (mirrors SearchModal's open-effect); autofocus the
  // search input when it opens.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery("");
    setDebouncedQuery("");
    setSelected(new Map());
    setName("");
    setError(null);
    setCreatedListId(null);
    setBusy(false);
    return undefined;
  }, [open]);

  // Escape closes the modal — global listener while open, same as
  // SearchModal, so the user doesn't need focus on the input specifically.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // v0.22 pattern — scope results to the viewer's entitled markets.
  const entitled = useEntitledMarkets();
  const results = useMemo(
    () =>
      filterResultsByEntitlement(
        searchPMs(debouncedQuery, RESULT_LIMIT),
        entitled
      ),
    [debouncedQuery, entitled]
  );

  // This modal is specifically about operators, not markets — a
  // market-tier hit isn't an operator at all, so it's omitted rather than
  // shown greyed-out (unlike tracked-tier, which IS an operator, just not
  // a pinnable one yet).
  const operatorResults = useMemo(
    () => results.filter((r) => r.tier !== "market"),
    [results]
  );

  const toggleResult = useCallback((result: PMSearchResult) => {
    const key = operatorMemberKey(result);
    if (!key) return; // tracked-tier — no scorecard/slug identity to pin.
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { name: result.name });
      return next;
    });
  }, []);

  const removeSelected = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const canSubmit = selected.size > 0 && name.trim().length > 0 && !busy;

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    if (selected.size === 0 || trimmedName.length === 0) return;
    setBusy(true);
    setError(null);
    setCreatedListId(null);
    try {
      const { listId, failed } = await addOperatorsToWatchList(
        { newName: trimmedName },
        Array.from(selected.keys())
      );
      if (failed > 0) {
        // The list was already created (and any successful pins already
        // landed) — don't navigate and don't onClose(), or the error is
        // lost silently: onClose() flips the parent's `open` to false and
        // this component early-returns null on its next render, so an
        // error set right before that never gets painted. Keep the modal
        // open, surface the count, and link to the already-created list
        // instead of letting the user re-submit — clicking "Create &
        // watch" again would create a SECOND list rather than retry the
        // failed pins.
        setCreatedListId(listId);
        setError(
          `${failed} operator${failed === 1 ? "" : "s"} couldn't be added to the list.`
        );
        return;
      }
      router.push(`/watch-lists/${listId}/results`);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to create watch list."
      );
    } finally {
      setBusy(false);
    }
  }, [name, selected, router, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Watch operators"
      className="fixed inset-0 z-[60] flex items-start justify-center bg-navy/40 px-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-lg border border-grid bg-white shadow-[0_24px_64px_-24px_rgb(15_31_63_/_0.45),_0_4px_12px_rgb(15_31_63_/_0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-grid px-5 py-4">
          <h2 className="text-[15px] font-semibold text-navy">
            Watch operators
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[12px] font-medium text-muted-foreground hover:text-navy"
          >
            ESC
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Search input */}
          <label htmlFor="watch-operators-search" className="sr-only">
            Search operators by name
          </label>
          <input
            ref={inputRef}
            id="watch-operators-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search operators by name..."
            className="h-9 w-full rounded-md border border-grid bg-white px-3 text-[13.5px] text-navy placeholder:text-muted-2 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
          />

          {/* Live results */}
          {debouncedQuery.trim().length >= 2 && (
            <ul
              role="listbox"
              aria-label="Operator search results"
              className="mt-2 max-h-[240px] overflow-y-auto rounded-md border border-grid"
            >
              {operatorResults.length === 0 && (
                <li className="px-3 py-2.5 text-[13px] text-muted-foreground">
                  No match for &ldquo;{debouncedQuery}&rdquo;.
                </li>
              )}
              {operatorResults.map((r) => {
                const key = operatorMemberKey(r);
                const isSelected = key !== null && selected.has(key);
                const subtitle =
                  r.tier === "canonical"
                    ? `${r.marketCount} markets`
                    : `${r.marketCity}, ${r.stateCode}`;
                return (
                  <li key={key ?? `${r.tier}-${r.name}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={key === null}
                      onClick={() => toggleResult(r)}
                      className={
                        "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors " +
                        (key === null
                          ? "cursor-not-allowed opacity-50"
                          : isSelected
                          ? "bg-teal/10"
                          : "hover:bg-surface-soft")
                      }
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-navy">
                          {r.name}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {subtitle}
                          {r.tier === "tracked" && (
                            <>
                              <span className="mx-1.5 text-muted-2">·</span>
                              Tracked, no scorecard — not addable
                            </>
                          )}
                        </span>
                      </span>
                      {key !== null && (
                        <span className="shrink-0 text-[12px] font-semibold text-teal">
                          {isSelected ? "Added" : "+ Add"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Selected chips */}
          {selected.size > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Array.from(selected.entries()).map(([key, op]) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-grid bg-surface-soft px-2.5 py-1 text-[12.5px] font-medium text-navy"
                >
                  {op.name}
                  <button
                    type="button"
                    onClick={() => removeSelected(key)}
                    aria-label={`Remove ${op.name}`}
                    className="text-muted-foreground hover:text-bad"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* List name */}
          <div className="mt-4">
            <label
              htmlFor="watch-operators-list-name"
              className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              List name
            </label>
            <input
              id="watch-operators-list-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Watching for Q3"
              className="mt-1.5 h-9 w-full rounded-md border border-grid bg-white px-3 text-[13.5px] text-navy placeholder:text-muted-2 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
            />
          </div>

          {error && (
            <div role="alert" className="mt-3 text-[12.5px] text-bad">
              <p>{error}</p>
              {createdListId && (
                <Link
                  href={`/watch-lists/${createdListId}/results`}
                  onClick={onClose}
                  className="mt-1 inline-block font-semibold text-teal underline hover:text-teal-700"
                >
                  View the list
                </Link>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-grid px-3 py-1.5 text-[13px] font-medium text-navy hover:bg-surface-soft"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="rounded-md bg-teal px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create & watch"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
