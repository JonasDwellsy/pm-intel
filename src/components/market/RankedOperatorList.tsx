"use client";

// Client wrapper for the market "Ranked operators" list. Renders the sort
// control + the list, re-ordering the (already server-loaded) rows instantly
// on the client. Default order = the server's star ranking (gold-then-silver,
// then within-cohort rank), preserved as the incoming array order.

import { useMemo, useState } from "react";
import Link from "next/link";
import { PMListItem } from "./PMListItem";
import type { PMListItem as PMListItemData } from "@/lib/types";
import { sortRankedOperators, type OperatorSortKey } from "@/lib/rank-sort";

const SORT_OPTIONS: Array<{ key: OperatorSortKey; label: string }> = [
  { key: "rank", label: "Star ranking" },
  { key: "size", label: "Portfolio size" },
  { key: "name", label: "Name (A–Z)" },
];

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
  const [sort, setSort] = useState<OperatorSortKey>("rank");

  const sorted = useMemo(() => sortRankedOperators(pms, sort), [pms, sort]);

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
      <div className="mb-3 flex justify-end">
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

      <ul className="flex flex-col gap-3.5">
        {sorted.map((pm) => {
          let pmSubmarket: { displayName: string; share: number | null } | null =
            null;
          if (submarket) {
            const idx = (pm.topCitySlugs ?? []).indexOf(submarket.slug);
            const share = idx >= 0 ? pm.topCityPcts?.[idx] ?? null : null;
            pmSubmarket = { displayName: submarket.displayName, share: share ?? null };
          }
          return (
            <PMListItem
              key={pm.slug}
              pm={pm}
              stateSlug={stateSlug}
              citySlug={citySlug}
              submarket={pmSubmarket}
            />
          );
        })}
      </ul>
    </>
  );
}
