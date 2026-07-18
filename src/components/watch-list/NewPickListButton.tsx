"use client";

// v0.28 (Task 7 Step 1) — "New pick list" entry on the /watch-lists
// index, alongside the existing "New watch list" link. A pick list
// has no criteria to configure, so this deliberately skips the
// template picker / WatchListEditor flow that "New watch list" goes
// through — there's nothing to pick a template FOR. Name it, POST it
// into existence (empty criteria arrays → derives as a pinned list),
// and land straight on its (initially empty) results page; companies
// get pinned in from the "Watch list" control on any scorecard, market
// row, or search result (see AddToWatchList.tsx), which already lists
// this new pick list as a destination once it exists.
//
// Modeled on AddToWatchList's own inline create flow (same request
// shape: empty criteria arrays) and on WatchListIndex's
// delete-confirmation modal (same overlay pattern).

import * as React from "react";
import { useRouter } from "next/navigation";

export function NewPickListButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function close() {
    if (pending) return;
    setOpen(false);
    setName("");
    setError(null);
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/watch-lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          requiredCriteria: [],
          preferredCriteria: [],
          excludedCriteria: [],
        }),
      });
      if (!res.ok) throw new Error(`Failed to create pick list (${res.status}).`);
      const data = (await res.json()) as { watchList: { id: string } };
      router.push(`/watch-lists/${data.watchList.id}/results`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create pick list.");
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 inline-flex items-center rounded-md border border-grid bg-white px-4 text-[13.5px] font-semibold text-navy hover:border-teal hover:text-teal-700"
      >
        + New pick list
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-navy/40 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="w-[420px] rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[18px] font-semibold text-navy">
              New pick list
            </h2>
            <p className="mt-2 text-[13.5px] text-foreground/80">
              A pick list is a manually curated set of companies — no
              criteria, just the operators you add. Name it, then pin
              companies to it from any scorecard, market row, or search
              result.
            </p>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="Pick list name"
              aria-label="Pick list name"
              className="mt-4 h-9 w-full rounded-md border border-grid px-3 text-[13.5px] text-navy focus:border-navy focus:outline-none"
            />
            {error && (
              <p role="alert" className="mt-2 text-[12.5px] text-bad">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="h-9 rounded-md border border-grid bg-white px-3.5 text-[13.5px] font-medium text-navy hover:bg-surface-soft disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={pending || name.trim().length === 0}
                className="h-9 rounded-md bg-teal px-3.5 text-[13.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
