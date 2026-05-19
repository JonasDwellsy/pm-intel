"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getSearchCounts,
  partitionByTier,
  searchPMs,
  type PMSearchResult,
} from "@/lib/pm-search";
import { SearchResultRow } from "./SearchResultRow";

// Global Cmd+K (Ctrl+K) search modal. Lives at app shell level so it's
// reachable from every page. Same Fuse.js backing as the top-nav
// SearchInput; bigger surface, more rows, more comfortable row spacing.
//
// State: controlled by SearchOverlay which mounts the modal conditionally
// and wires the keyboard shortcut + close handler.

const MODAL_LIMIT = 20;
// Same strict-match threshold as the top-nav SearchInput — see comment
// in pm-search.ts FUSE_OPTIONS for the score-band calibration.
const STRICT_MATCH_SCORE = 0.3;
const DEBOUNCE_MS = 120;

export function SearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the query identically to the top-nav input so Fuse fires
  // once per ~120ms typing burst.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  // Auto-focus input on open + reset query when the modal closes so the
  // next open is a fresh canvas.
  useEffect(() => {
    if (open) {
      // Defer one microtask so the input is mounted before focus().
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    setQuery("");
    setDebouncedQuery("");
    setActiveIndex(0);
    return undefined;
  }, [open]);

  // ESC closes the modal; ArrowUp/Down move the cursor; Enter follows
  // the active result. The keydown listener is global while the modal
  // is open so the user doesn't need focus on the input specifically.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const results = useMemo(
    () => searchPMs(debouncedQuery, MODAL_LIMIT),
    [debouncedQuery]
  );
  const strictResults = useMemo(
    () => results.filter((r) => r.score <= STRICT_MATCH_SCORE),
    [results]
  );
  const fuzzyResults = useMemo(
    () => results.filter((r) => r.score > STRICT_MATCH_SCORE),
    [results]
  );
  const visibleResults =
    strictResults.length > 0 ? strictResults : fuzzyResults.slice(0, 3);
  const { canonical, ranked, tracked } = useMemo(
    () => partitionByTier(strictResults.length > 0 ? strictResults : []),
    [strictResults]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery]);

  const handleInputKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (visibleResults.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % visibleResults.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(
          (i) => (i - 1 + visibleResults.length) % visibleResults.length
        );
      } else if (e.key === "Enter") {
        const selected = visibleResults[activeIndex];
        if (selected) {
          window.location.href = selected.href;
          onClose();
        }
      }
    },
    [activeIndex, onClose, visibleResults]
  );

  const counts = useMemo(() => getSearchCounts(), []);

  // Render-time state classifier mirrors SearchInput's structure.
  let state: "empty" | "results" | "fuzzy" | "no-match" = "empty";
  if (debouncedQuery.trim().length >= 2) {
    if (strictResults.length > 0) state = "results";
    else if (fuzzyResults.length > 0) state = "fuzzy";
    else state = "no-match";
  }

  if (!open) return null;

  return (
    // Backdrop — translucent overlay; click-outside closes via the
    // onClose stopPropagation pattern on the modal body.
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search operators"
      className="fixed inset-0 z-[60] flex items-start justify-center bg-navy/40 px-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] overflow-hidden rounded-lg border border-grid bg-white shadow-[0_24px_64px_-24px_rgb(15_31_63_/_0.45),_0_4px_12px_rgb(15_31_63_/_0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 border-b border-grid px-5 py-4">
          <span aria-hidden className="text-muted-foreground">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-3.5-3.5" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKey}
            placeholder="Search operators by name..."
            aria-controls="pm-search-modal-results"
            className="flex-1 bg-transparent text-[16px] text-navy placeholder:text-muted-2 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="text-[12px] font-medium text-muted-foreground hover:text-navy"
          >
            ESC
          </button>
        </div>

        {/* Results body */}
        <div
          id="pm-search-modal-results"
          className="max-h-[60vh] overflow-y-auto"
        >
          {state === "empty" && (
            <div className="px-5 py-6 text-[14px] text-muted-foreground">
              <p>Search by operator name across all 7 markets.</p>
              <p className="mt-3 text-[12.5px] text-muted-2">
                We track{" "}
                <span className="dq-mono font-medium text-navy">
                  {counts.ranked}
                </span>{" "}
                ranked operators (with full scorecards) and{" "}
                <span className="dq-mono font-medium text-navy">
                  {counts.tracked}
                </span>{" "}
                tracked operators (≥3 listings T12).
              </p>
            </div>
          )}

          {state === "results" && (
            <ul className="py-1">
              {/* v0.6.4 Patch 1 — Cross-market group renders first. */}
              {canonical.length > 0 && (
                <>
                  <p className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-2">
                    Cross-market operators
                  </p>
                  {canonical.map((r) => {
                    const idx = strictResults.indexOf(r);
                    return (
                      <SearchResultRow
                        key={`${r.tier}-${r.canonicalSlug}`}
                        result={r}
                        active={idx === activeIndex}
                        onSelect={onClose}
                        size="comfortable"
                      />
                    );
                  })}
                </>
              )}
              {ranked.length > 0 && (
                <>
                  {canonical.length > 0 && (
                    <div
                      className="my-1 border-t border-grid-soft"
                      aria-hidden
                    />
                  )}
                  <p className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-2">
                    Ranked operators
                  </p>
                  {ranked.map((r) => {
                    const idx = strictResults.indexOf(r);
                    return (
                      <SearchResultRow
                        key={`${r.tier}-${r.slug}`}
                        result={r}
                        active={idx === activeIndex}
                        onSelect={onClose}
                        size="comfortable"
                      />
                    );
                  })}
                </>
              )}
              {tracked.length > 0 && (
                <>
                  {(canonical.length > 0 || ranked.length > 0) && (
                    <div
                      className="my-1 border-t border-grid-soft"
                      aria-hidden
                    />
                  )}
                  <p className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-2">
                    Tracked (no scorecard)
                  </p>
                  {tracked.map((r) => {
                    const idx = strictResults.indexOf(r);
                    return (
                      <SearchResultRow
                        key={`${r.tier}-${r.name}-${r.marketId}`}
                        result={r}
                        active={idx === activeIndex}
                        onSelect={onClose}
                        size="comfortable"
                      />
                    );
                  })}
                </>
              )}
            </ul>
          )}

          {state === "fuzzy" && (
            <div>
              <div className="px-5 py-3 text-[14px] text-muted-foreground">
                No exact match for{" "}
                <span className="font-medium text-navy">
                  &ldquo;{debouncedQuery}&rdquo;
                </span>
                . Closest matches:
              </div>
              <ul className="border-t border-grid py-1">
                {fuzzyResults.slice(0, 3).map((r, i) => (
                  <SearchResultRow
                    key={`${r.tier}-${r.name}-${i}`}
                    result={r}
                    active={i === activeIndex}
                    onSelect={onClose}
                    size="comfortable"
                  />
                ))}
              </ul>
              <ModalFooterBrowse counts={counts} />
            </div>
          )}

          {state === "no-match" && (
            <div>
              <div className="px-5 py-4 text-[14px] text-muted-foreground">
                No match for{" "}
                <span className="font-medium text-navy">
                  &ldquo;{debouncedQuery}&rdquo;
                </span>
                .
              </div>
              <ModalFooterBrowse counts={counts} />
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-grid bg-surface-soft px-5 py-2.5 text-[11.5px] text-muted-2">
          Press{" "}
          <kbd className="rounded border border-grid bg-white px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>{" "}
          to close ·{" "}
          <kbd className="rounded border border-grid bg-white px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>{" "}
          to reopen
        </div>
      </div>
    </div>
  );
}

function ModalFooterBrowse({
  counts,
}: {
  counts: { ranked: number; tracked: number; total: number };
}) {
  return (
    <div className="border-t border-grid bg-surface-soft px-5 py-3 text-[13px] leading-[1.5] text-muted-foreground">
      <p>
        We track{" "}
        <span className="dq-mono font-medium text-navy">{counts.ranked}</span>{" "}
        ranked operators and{" "}
        <span className="dq-mono font-medium text-navy">
          {counts.tracked}
        </span>{" "}
        tracked operators across 7 markets.
      </p>
      <p className="mt-1.5">
        <Link
          href="/property-managers"
          className="font-medium text-teal hover:text-teal-700"
        >
          Browse markets →
        </Link>
      </p>
    </div>
  );
}
