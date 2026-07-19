"use client";

// Operator-roster watch lists (Task 3) — the two primary entry points on
// the /watch-lists index toolbar, verb-first instead of noun-first
// ("+ New pick list" / "+ New watch list"):
//
//   - "Watch operators"    → opens WatchOperatorsModal (Task 2): search
//                            operators by name, add several, name the
//                            list, create it with those operators pinned
//                            in one shot. Modal open state lives here.
//   - "Build a smart list" → Link to /watch-lists/new, the existing
//                            criteria/editor create route (unchanged
//                            from the prior "+ New watch list" link).
//
// Replaces the index's prior name-only "new pinned list" entry point
// now that WatchOperatorsModal covers the same pinned-list-creation
// job with a richer, search-first flow.

import * as React from "react";
import Link from "next/link";
import { WatchOperatorsModal } from "./WatchOperatorsModal";

export function WatchListsIndexActions() {
  const [watchOperatorsOpen, setWatchOperatorsOpen] = React.useState(false);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => setWatchOperatorsOpen(true)}
        className="h-9 inline-flex items-center rounded-md border border-grid bg-white px-4 text-[13.5px] font-semibold text-navy hover:border-teal hover:text-teal-700"
      >
        Watch operators
      </button>
      <Link
        href="/watch-lists/new"
        className="h-9 inline-flex items-center rounded-md bg-teal px-4 text-[13.5px] font-semibold text-white hover:bg-teal-700"
      >
        Build a smart list
      </Link>

      <WatchOperatorsModal
        open={watchOperatorsOpen}
        onClose={() => setWatchOperatorsOpen(false)}
      />
    </div>
  );
}
