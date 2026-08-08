"use client";

// v0.8 dormant tier (Phase 2) — dormant-operator disclosure.
//
// A dormant operator has no listing event inside the recency window. They are
// excluded from the ranked list and from every cohort baseline above, because
// ranking a stale 12-month window against currently-active peers compares two
// different things — and letting them into the cohort math would shift every
// active operator's percentile as operators drift in and out month to month.
//
// They stay reachable here, on demand. Mirrors BrokerToggleSection: the rows
// are already loaded server-side, so the toggle is pure show/hide, no refetch.
//
// Voice: we report only what the listing record shows. "No new listings
// observed since <date>" is a fact. "Inactive", "departed", "left the market",
// or anything asserting the business stopped operating is not — an operator
// can go quiet with us for reasons we cannot see.

import { useState } from "react";
import type { PMListItem as PMListItemType } from "@/lib/types";
import { PMListItem } from "./PMListItem";
import { countAsWord } from "@/lib/format-count";

export function DormantToggleSection({
  dormant,
  stateSlug,
  citySlug,
}: {
  dormant: PMListItemType[];
  stateSlug: string;
  citySlug: string;
}) {
  const [open, setOpen] = useState(false);

  if (dormant.length === 0) return null;

  const countLabel = `${dormant.length} dormant operator${
    dormant.length === 1 ? "" : "s"
  }`;

  return (
    <div className="mt-8 border-t border-grid pt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 text-[14px] font-semibold text-navy hover:text-navy-700"
      >
        <span
          aria-hidden
          className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▸
        </span>
        {open ? `Hide ${countLabel}` : `Show ${countLabel}`}
      </button>

      {open && (
        <div className="mt-4">
          <p className="mb-4 max-w-[680px] text-[13px] leading-[1.5] text-muted-foreground">
            {countAsWord(dormant.length)} operator
            {dormant.length === 1 ? "" : "s"} in this market{" "}
            {dormant.length === 1 ? "has" : "have"} no new listings inside the
            recency window. Their scorecards still reflect the 12 months through
            their last observed listing, but they are held out of the ranked list
            and the cohort benchmarks above so a stale window is never compared
            against currently-active peers.
          </p>
          <ul className="flex flex-col gap-3.5">
            {dormant.map((pm) => (
              <PMListItem
                key={pm.slug}
                pm={pm}
                stateSlug={stateSlug}
                citySlug={citySlug}
                submarket={null}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
