"use client";

// v0.6.4 Patch 9 (Phase A) — broker disclosure.
//
// Brokers are included on the platform but hidden from the ranked list by
// default (they're a different kind of operator than the PMs the product
// centers on). This client component renders a toggle that reveals the
// market's eligible brokers on demand — they're already loaded server-side
// (brokerPms), so the toggle is pure show/hide, no refetch.
//
// Brokers are scored within their OWN cohort upstream, so each broker's
// rank reads "X of {brokers}", not interleaved with the PM ranks. Reuses
// PMListItem for visual consistency.
//
// Renders nothing when the market has no brokers (every pre-Phase-A market,
// until re-exported with company-type data).

import { useState } from "react";
import type { PMListItem as PMListItemType } from "@/lib/types";
import { PMListItem } from "./PMListItem";
import { countAsWord } from "@/lib/format-count";

export function BrokerToggleSection({
  brokers,
  stateSlug,
  citySlug,
}: {
  brokers: PMListItemType[];
  stateSlug: string;
  citySlug: string;
}) {
  const [open, setOpen] = useState(false);

  if (brokers.length === 0) return null;

  const countLabel = `${brokers.length} ${
    brokers.length === 1 ? "broker" : "brokers"
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
            Brokers are excluded from the ranked operator list and the cohort
            benchmarks above &mdash; the rankings center on property managers
            and owner/operators. {countAsWord(brokers.length)} broker
            {brokers.length === 1 ? "" : "s"} observed in this market{" "}
            {brokers.length === 1 ? "is" : "are"} shown below, scored against
            other brokers.
          </p>
          <ul className="flex flex-col gap-3.5">
            {brokers.map((pm) => (
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
