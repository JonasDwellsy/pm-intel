"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

// v0.6.3 quick-wins — Tier 2 search highlight banner.
// PR #15 (PM search) routes Tier 2 results (tracked, no scorecard) to
// /property-managers/[state]/[city]?highlight=<operatorName>. This
// banner is the landing-state acknowledgment: it confirms the operator
// the user clicked, surfaces their T12 listing count + top 3 submarkets
// from the search index, and explains why no scorecard exists yet.
//
// Mounted as a client component so the dismiss button can call
// router.replace() to strip the query param without a full page reload.
// Data is server-resolved in the page route (via findTrackedInMarket)
// and handed in as props; this component is dumb about lookup.

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function TrackedOperatorBanner({
  operatorName,
  marketCity,
  t12Listings,
  topSubmarkets,
}: {
  operatorName: string;
  marketCity: string;
  t12Listings: number;
  topSubmarkets: Array<{ slug: string; count: number }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Dismiss strips ?highlight= while preserving all other params (e.g.
  // ?submarket= might be set in parallel) and scroll position. Uses
  // router.replace so the dismiss doesn't add a history entry.
  const onDismiss = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("highlight");
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  // Active-in line — render the top submarkets the search index carries
  // for this operator. Display names derive from title-casing the slug,
  // matching the form already used for the submarket filter chips. Falls
  // back to a generic phrasing if the index is empty for this op.
  const submarketNames = topSubmarkets
    .map((s) => titleCaseSlug(s.slug))
    .filter((n) => n.length > 0);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto mt-4 max-w-[1320px] px-6 sm:px-14"
    >
      <div className="flex items-start gap-3 rounded-md border border-grid bg-surface-soft p-4 text-[13.5px] leading-[1.55] text-foreground">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-2">
            Tracked operator
          </p>
          <p className="mt-1 text-[15px] font-semibold text-navy">
            {operatorName}
          </p>
          <p className="mt-1 text-muted-foreground">
            <span className="dq-mono font-medium text-navy">
              {t12Listings.toLocaleString("en-US")}
            </span>{" "}
            listings T12 in {marketCity}.
            {submarketNames.length > 0 && (
              <>
                {" "}
                Active in{" "}
                <span className="font-medium text-navy/90">
                  {submarketNames.join(", ")}
                </span>
                .
              </>
            )}{" "}
            Below the ≥30 listings threshold for full ranking — no scorecard
            available yet.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss ${operatorName} highlight`}
          className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white hover:text-navy focus-visible:bg-white focus-visible:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/20"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
