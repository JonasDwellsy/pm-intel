"use client";

// Fix 1 (final-review) — the owner-only "Shared with org / Private"
// toggle. Before this, isShared had no write path at all: POST hardcoded
// isShared: false and nothing in the UI ever called PUT with it, so
// every list was permanently private even though the entire visibility
// model (reads, digest, index) already understood shared lists. This is
// the one control that makes sharing reachable.
//
// Mounted on /watch-lists/[id]/results, gated by the same canEditList
// check ("canEdit") the page already computes for canManageMembers — a
// view-only shared viewer never sees this control, only the owner (or a
// legacy-owned-in-org caller). PUT /api/watch-lists/[id] re-enforces
// canEditList server-side regardless, so this is belt-and-suspenders,
// not the actual security boundary.
//
// Optimistic update with revert-on-failure, same shape as
// AddToWatchList's togglePin — router.refresh() on success so the
// server-rendered page (and anything else keyed off isShared) picks up
// the new value on next navigation without a full reload.

import * as React from "react";
import { useRouter } from "next/navigation";

interface ShareToggleProps {
  watchListId: string;
  initialIsShared: boolean;
}

export function ShareToggle({ watchListId, initialIsShared }: ShareToggleProps) {
  const router = useRouter();
  const [isShared, setIsShared] = React.useState(initialIsShared);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleChange(next: boolean) {
    setIsShared(next);
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/watch-lists/${watchListId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isShared: next }),
      });
      if (!res.ok) {
        throw new Error(`Failed to update sharing (${res.status}).`);
      }
      router.refresh();
    } catch (e) {
      // Revert — the checkbox reflects the last confirmed server state.
      setIsShared(!next);
      setError(e instanceof Error ? e.message : "Failed to update sharing.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-9 items-center gap-2 rounded-md border border-grid bg-white px-3">
      <label className="flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-navy">
        <input
          type="checkbox"
          checked={isShared}
          disabled={pending}
          onChange={(e) => void handleChange(e.target.checked)}
          className="size-3.5 shrink-0 accent-teal"
          aria-label="Share with my organization"
        />
        {isShared ? "Shared with org" : "Private"}
      </label>
      {error && (
        <span role="alert" className="text-[11.5px] text-bad">
          {error}
        </span>
      )}
    </div>
  );
}
