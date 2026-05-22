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
import { useSearchOverlay } from "./SearchOverlay";
import { capture } from "@/lib/analytics";

// Top-nav search input. Live filter as the user types; up to 10 results
// surfaced in a popover dropdown below the input; ESC + click-outside +
// blur close the dropdown; keyboard up/down arrows move a virtual cursor
// and Enter navigates to the highlighted row. The dropdown groups by tier
// (ranked / tracked) and falls into a not-found state with fuzzy-match
// suggestions when nothing scores above the strict-match threshold.
//
// Pairs with the global SearchModal (Cmd+K) that lives at app shell —
// this is the inline entry point on every page above the fold.

const DEBOUNCE_MS = 150;
const DROPDOWN_LIMIT = 10;
// Fuse scores ≤ this are "close enough" to surface as primary results;
// scores above are routed to the fuzzy-suggestions branch. 0 is a
// perfect match, 1 is no match. Calibrated against the v0.6.3 corpus —
// see FUSE_OPTIONS comment in pm-search.ts for the score-band anchors.
const STRICT_MATCH_SCORE = 0.3;

export function SearchInput() {
  // Pull the Cmd+K modal opener from the global overlay provider so the
  // "Open full search" hint in the not-found state hands off to the
  // modal. Outside the provider this no-ops gracefully.
  const { open: openModal } = useSearchOverlay();
  const onOpenModal = useCallback(() => openModal(), [openModal]);
  return <SearchInputInner onOpenModal={onOpenModal} />;
}

function SearchInputInner({
  onOpenModal,
}: {
  onOpenModal: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the query so Fuse.js fires once per ~150ms of typing rather
  // than on every keystroke. Cleared on unmount or rapid change.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  // Run the search against the debounced query. Memoized so re-renders
  // from active-index changes don't rerun the search.
  const results = useMemo(() => {
    return searchPMs(debouncedQuery, DROPDOWN_LIMIT);
  }, [debouncedQuery]);

  // Partition strict-match results from fuzzy suggestions for the
  // not-found branch. A "strict" result here is one whose Fuse score
  // beats STRICT_MATCH_SCORE.
  const strictResults = useMemo(
    () => results.filter((r) => r.score <= STRICT_MATCH_SCORE),
    [results]
  );
  const fuzzyResults = useMemo(
    () => results.filter((r) => r.score > STRICT_MATCH_SCORE),
    [results]
  );
  // Memo'd so the empty-array fallback isn't a fresh reference on
  // every render — the downstream useMemo / useCallback dependency
  // arrays read this as stable when results haven't actually changed.
  const visibleResults = useMemo(
    () => (strictResults.length > 0 ? strictResults : []),
    [strictResults]
  );
  const { canonical, ranked, tracked } = useMemo(
    () => partitionByTier(visibleResults),
    [visibleResults]
  );

  // Reset active index whenever the result set changes so the cursor
  // doesn't dangle past the new length. The set-state-in-effect rule
  // would prefer this be derived during render via a "stored previous
  // value" pattern, but the reset is a side-effect of an external
  // input (debouncedQuery) changing — useEffect is the right tool.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(0);
  }, [debouncedQuery]);

  // Click-outside handler — only mounted while the dropdown is open to
  // avoid a stray listener on every page.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
        return;
      }
      if (!open || visibleResults.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % visibleResults.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(
          (i) => (i - 1 + visibleResults.length) % visibleResults.length
        );
        return;
      }
      if (e.key === "Enter") {
        const selected = visibleResults[activeIndex];
        if (selected) {
          // v0.17 — search_performed. Fired when the user commits a
          // search by selecting a result (Enter OR click). Privacy
          // guardrail: query_length_chars only — the raw text never
          // leaves the browser as part of a captured event.
          capture("search_performed", {
            query_length_chars: debouncedQuery.length,
            result_tier: selected.tier,
            had_strict_results: strictResults.length > 0,
            entry_point: "nav_input_enter",
          });
          // Let the <Link> handle navigation; close after a tick so the
          // route change unmounts cleanly.
          window.location.href = selected.href;
          setOpen(false);
        }
      }
    },
    [activeIndex, open, visibleResults]
  );

  // v0.17 — single helper for the "user committed a search by
  // clicking a result row" path. Mirrors the capture in the Enter
  // branch above so click + keyboard paths are symmetric.
  const handleResultClick = useCallback(
    (result: PMSearchResult) => {
      capture("search_performed", {
        query_length_chars: debouncedQuery.length,
        result_tier: result.tier,
        had_strict_results: strictResults.length > 0,
        entry_point: "nav_input_click",
      });
      setOpen(false);
    },
    [debouncedQuery.length, strictResults.length]
  );

  const counts = useMemo(() => getSearchCounts(), []);

  // Render-time state classifier so the JSX below stays readable.
  let state:
    | "closed"
    | "empty"
    | "results"
    | "no-match"
    | "fuzzy" = "closed";
  if (open) {
    if (debouncedQuery.trim().length < 2) state = "empty";
    else if (strictResults.length > 0) state = "results";
    else if (fuzzyResults.length > 0) state = "fuzzy";
    else state = "no-match";
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        {/* Search glyph */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <svg
            width="14"
            height="14"
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
          role="combobox"
          aria-expanded={open}
          aria-controls="pm-search-results"
          aria-autocomplete="list"
          placeholder="Search operators..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="h-9 w-[260px] rounded-md border border-grid bg-white pl-8 pr-12 text-[13.5px] text-navy placeholder:text-muted-2 transition-colors focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
        />
        {/* Keyboard hint chip — only visible when the input isn't
            focused; otherwise the chip competes with the active state. */}
        {!open && (
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-grid bg-surface-soft px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:inline-block">
            ⌘K
          </kbd>
        )}
      </div>

      {state !== "closed" && (
        <div
          id="pm-search-results"
          role="listbox"
          className="absolute right-0 top-full z-50 mt-2 w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-grid bg-white shadow-[0_12px_32px_-12px_rgb(15_31_63_/_0.22),_0_2px_8px_rgb(15_31_63_/_0.08)]"
        >
          {state === "empty" && (
            <div className="px-4 py-5 text-[13px] text-muted-foreground">
              <p>Search by operator name.</p>
              <p className="mt-1 text-[12px] text-muted-2">
                Press{" "}
                <kbd className="rounded border border-grid bg-surface-soft px-1 py-0.5 text-[10px] font-medium">
                  ⌘K
                </kbd>{" "}
                anywhere on the site to open full search.
              </p>
            </div>
          )}

          {state === "results" && (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              <ResultGroups
                canonical={canonical}
                ranked={ranked}
                tracked={tracked}
                allResults={visibleResults}
                activeIndex={activeIndex}
                onSelect={handleResultClick}
              />
            </ul>
          )}

          {state === "fuzzy" && (
            <div>
              <div className="px-4 py-3 text-[13px]">
                <p className="text-muted-foreground">
                  No exact match for{" "}
                  <span className="font-medium text-navy">
                    &ldquo;{debouncedQuery}&rdquo;
                  </span>
                  . Closest matches:
                </p>
              </div>
              <ul className="max-h-[40vh] overflow-y-auto border-t border-grid py-1">
                {fuzzyResults.slice(0, 3).map((r, i) => (
                  <SearchResultRow
                    key={`${r.tier}-${r.name}-${i}`}
                    result={r}
                    active={false}
                    onSelect={() => handleResultClick(r)}
                  />
                ))}
              </ul>
              <NotFoundFooter counts={counts} onOpenModal={onOpenModal} />
            </div>
          )}

          {state === "no-match" && (
            <div>
              <div className="px-4 py-3 text-[13px]">
                <p className="text-muted-foreground">
                  No match for{" "}
                  <span className="font-medium text-navy">
                    &ldquo;{debouncedQuery}&rdquo;
                  </span>
                  .
                </p>
              </div>
              <NotFoundFooter counts={counts} onOpenModal={onOpenModal} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Result-group renderer — surfaces a small "Ranked" / "Tracked" header
// above each group when both are present. Active-index threads through
// the flat result list (visibleResults), not per-group, so the keyboard
// cursor traverses naturally across the boundary.
function ResultGroups({
  canonical,
  ranked,
  tracked,
  allResults,
  activeIndex,
  onSelect,
}: {
  canonical: Extract<PMSearchResult, { tier: "canonical" }>[];
  ranked: Extract<PMSearchResult, { tier: "ranked" }>[];
  tracked: Extract<PMSearchResult, { tier: "tracked" }>[];
  allResults: PMSearchResult[];
  activeIndex: number;
  // v0.17 — accepts the clicked result so the parent can attach
  // result-tier metadata to the search_performed event.
  onSelect: (result: PMSearchResult) => void;
}) {
  // v0.6.4 Patch 1 — canonical group renders first because cross-market
  // operators are the most informative search hit; ranked + tracked
  // follow.
  return (
    <>
      {canonical.length > 0 && (
        <>
          <p className="px-4 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-2">
            Cross-market operators
          </p>
          {canonical.map((r) => {
            const idx = allResults.indexOf(r);
            return (
              <SearchResultRow
                key={`${r.tier}-${r.canonicalSlug}`}
                result={r}
                active={idx === activeIndex}
                onSelect={() => onSelect(r)}
              />
            );
          })}
        </>
      )}
      {ranked.length > 0 && (
        <>
          {canonical.length > 0 && (
            <div className="my-1 border-t border-grid-soft" aria-hidden />
          )}
          <p className="px-4 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-2">
            Ranked operators
          </p>
          {ranked.map((r) => {
            const idx = allResults.indexOf(r);
            return (
              <SearchResultRow
                key={`${r.tier}-${r.slug}`}
                result={r}
                active={idx === activeIndex}
                onSelect={() => onSelect(r)}
              />
            );
          })}
        </>
      )}
      {tracked.length > 0 && (
        <>
          {(canonical.length > 0 || ranked.length > 0) && (
            <div className="my-1 border-t border-grid-soft" aria-hidden />
          )}
          <p className="px-4 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-2">
            Tracked (no scorecard)
          </p>
          {tracked.map((r) => {
            const idx = allResults.indexOf(r);
            return (
              <SearchResultRow
                key={`${r.tier}-${r.name}-${r.marketId}`}
                result={r}
                active={idx === activeIndex}
                onSelect={() => onSelect(r)}
              />
            );
          })}
        </>
      )}
    </>
  );
}

// Footer surfaced inside both the no-match and fuzzy states. Shows the
// corpus size + a browse-markets fallback so the user always has a
// next-step affordance even when their query failed.
function NotFoundFooter({
  counts,
  onOpenModal,
}: {
  counts: { ranked: number; tracked: number; total: number };
  onOpenModal?: () => void;
}) {
  return (
    <div className="border-t border-grid bg-surface-soft px-4 py-3 text-[12px] leading-[1.5] text-muted-foreground">
      <p>
        We track{" "}
        <span className="dq-mono font-medium text-navy">
          {counts.ranked}
        </span>{" "}
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
          onClick={onOpenModal ? undefined : undefined}
        >
          Browse markets →
        </Link>
        {onOpenModal && (
          <button
            type="button"
            onClick={onOpenModal}
            className="ml-3 font-medium text-teal hover:text-teal-700"
          >
            Open full search ⌘K
          </button>
        )}
      </p>
    </div>
  );
}
