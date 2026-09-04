"use client";

// v0.30 — Public "look up your property manager" box for the consumer funnel.
// Reuses the existing Fuse-backed searchPMs (no re-index). Ranked operators
// link to their /report/r/[slug] page; tracked operators show as Profiles
// (real, observed, not yet rankable) so a miss reads honestly instead of as
// "not found".
//
// Hero.tsx mounts this unconditionally on the marketing homepage, above the
// fold. @/lib/pm-search statically imports src/data/search_index.json (4.5 MB)
// plus Fuse, so a static import here would ship that payload in the
// homepage's initial bundle. Load it lazily on first real query instead — the
// same cached-dynamic-import idiom SearchInput.tsx uses for the top-nav
// search (see its loadSearchModule()).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PMSearchResult } from "@/lib/pm-search";
import { tierFromSearch } from "@/lib/report/confidence-tier";
import { ConfidenceBadge } from "@/components/report/ConfidenceBadge";

type RankedResult = Extract<PMSearchResult, { tier: "ranked" }>;
type TrackedResult = Extract<PMSearchResult, { tier: "tracked" }>;

let searchModulePromise: Promise<typeof import("@/lib/pm-search")> | null = null;

function loadSearchModule() {
  searchModulePromise ??= import("@/lib/pm-search");
  return searchModulePromise;
}

export function ReportSearch({ partner }: { partner?: string | null }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<PMSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounce, and flip `loading` / clear stale results in the SAME tick
  // `debounced` updates (both inside the timeout callback, matching
  // SearchInput.tsx's shape) rather than as a separate synchronous setState
  // call in the fetch effect's body below.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query);
      const trimmed = query.trim();
      setLoading(trimmed.length >= 2);
      if (trimmed.length < 2) setResults([]);
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (debounced.trim().length < 2) return;
    let active = true;
    void loadSearchModule().then((search) => {
      if (!active) return;
      setResults(search.searchPMs(debounced, 20));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [debounced]);

  const { ranked, tracked } = useMemo(() => {
    return {
      ranked: results.filter((r): r is RankedResult => r.tier === "ranked"),
      tracked: results.filter((r): r is TrackedResult => r.tier === "tracked"),
    };
  }, [results]);

  const suffix = partner ? `?partner=${encodeURIComponent(partner)}` : "";
  const showResults = debounced.trim().length >= 2;
  const empty = showResults && !loading && ranked.length === 0 && tracked.length === 0;

  return (
    <div className="w-full">
      <label htmlFor="pm-lookup" className="sr-only">
        Search for a property manager
      </label>
      <input
        id="pm-lookup"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a property manager by name…"
        className="h-14 w-full rounded-xl border border-grid bg-white px-5 text-[16px] text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus:border-navy focus:ring-2 focus:ring-navy/15"
      />

      {showResults && (
        <div className="mt-3 overflow-hidden rounded-xl border border-grid bg-white">
          {ranked.map((r) => (
            <Link
              key={`r-${r.slug}`}
              href={`/report/r/${r.slug}${suffix}`}
              className="flex items-center justify-between gap-4 border-b border-grid/70 px-5 py-3.5 transition-colors last:border-0 hover:bg-navy-soft"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-navy">{r.name}</p>
                <p className="text-[13px] text-muted-foreground">
                  {r.marketCity}, {r.stateCode}
                  {r.t12Listings ? ` · ${r.t12Listings.toLocaleString()} listings/yr` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {(r.goldCount > 0 || r.silverCount > 0) && (
                  <span className="text-[12px] font-medium text-navy/80">
                    ★ {r.goldCount}
                    {r.silverCount > 0 ? ` · ${r.silverCount}` : ""}
                  </span>
                )}
                <ConfidenceBadge info={tierFromSearch(r)} />
              </div>
            </Link>
          ))}

          {tracked.map((r) => (
            <div
              key={`t-${r.marketId}-${r.name}`}
              className="flex items-center justify-between gap-4 border-b border-grid/70 px-5 py-3.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-foreground/75">
                  {r.name}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {r.marketCity}, {r.stateCode} · not yet enough activity to rank
                </p>
              </div>
              <ConfidenceBadge info={tierFromSearch(r)} />
            </div>
          ))}

          {empty && (
            <div className="px-5 py-6 text-center text-[14px] text-muted-foreground">
              We don&rsquo;t have <span className="font-medium text-foreground/80">{debounced}</span> yet.
              Coverage is expanding — try the market name, or check back soon.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
