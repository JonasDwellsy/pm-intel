"use client";

// Client wrapper around the list page. The server component loads
// the watch-list rows; we render them as a card grid with action
// buttons that hit the API:
//
//   - Apply      → Link to /watch-lists/[id]/results (ranked table).
//                  Primary action — this is the value-prop view.
//   - Edit       → /watch-lists/[id]/edit
//   - Duplicate  → POST /api/watch-lists (copy with name "[orig] (copy)")
//                  then redirect into the new id's editor
//   - Delete     → confirm modal → DELETE /api/watch-lists/[id]
//
// Empty state lives here too — pointing the user at /watch-lists/new.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WatchListRecord } from "@/lib/watch-list/store";
import { deriveListKind } from "@/lib/watch-list/kind";

interface Props {
  watchListes: WatchListRecord[];
  /** v0.28 (Task 7 Step 1) — watchListId → pinned-member count, for
   *  every row (smart lists return 0). Computed server-side
   *  (listMembers per row) and passed down so this client component
   *  doesn't need its own data-fetching path just to render "N
   *  companies". */
  pinnedCounts: Record<string, number>;
}

export function WatchListIndex({ watchListes, pinnedCounts }: Props) {
  const router = useRouter();
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const confirmTarget = watchListes.find((b) => b.id === confirmDeleteId) ?? null;

  async function handleDuplicate(bb: WatchListRecord) {
    setBusyId(bb.id);
    setError(null);
    try {
      const res = await fetch("/api/watch-lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // A duplicate copies criteria but not pinned membership, so its
          // derived kind (pinned/smart/hybrid) reflects the copy's own
          // content — a duplicated pick list comes back as an empty pick
          // list, a duplicated smart/hybrid list as a smart list.
          name: `${bb.name} (copy)`,
          description: bb.description,
          requiredCriteria: bb.requiredCriteria,
          preferredCriteria: bb.preferredCriteria,
          excludedCriteria: bb.excludedCriteria,
        }),
      });
      if (!res.ok) throw new Error(`Duplicate failed: ${res.status}`);
      const data = (await res.json()) as { watchList: { id: string } };
      router.push(`/watch-lists/${data.watchList.id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duplicate failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/watch-lists/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setConfirmDeleteId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  // The v0.12 nav-positioning pass moved the empty-state branch up
  // to /watch-lists/page.tsx so it can render the TemplateGrid inline.
  // Callers always pass a non-empty list now, but we keep a defensive
  // early-return so a future caller bug surfaces as a clean nothing-
  // rendered rather than a crash on the empty .map.
  if (watchListes.length === 0) return null;

  return (
    <>
      {error && (
        <div className="mt-6 rounded-md border border-bad/40 bg-rose-soft px-4 py-2.5 text-[13px] text-bad">
          {error}
        </div>
      )}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {watchListes.map((bb) => {
          // v0.28 (Task 7 Step 2) — the card's label + body derive from
          // content (criteria-presence + pin count), NOT the stored
          // `kind` column, so a smart list that accumulates pins (or a
          // pick list that later gains criteria) reclassifies itself
          // automatically without a migration.
          const listKind = deriveListKind(bb, pinnedCounts[bb.id] ?? 0);
          return (
          <article
            key={bb.id}
            className="flex flex-col rounded-lg border border-grid bg-white p-5 transition-shadow hover:shadow-tile-hover"
          >
            <header>
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-semibold leading-snug text-navy">
                  {bb.name}
                </h2>
              </div>
              <p className="mt-1.5 line-clamp-2 min-h-[2.6em] text-[13px] text-foreground/70">
                {bb.description ?? (
                  <span className="italic text-muted-2">No description.</span>
                )}
              </p>
            </header>

            {listKind === "pinned" ? (
              // v0.28 (Task 7 Step 1) — a pick list has no criteria to
              // summarize; show the manual-membership count instead
              // (from listMembers, computed server-side).
              <div className="mt-4 flex items-center gap-1.5 text-[12px]">
                <span className="inline-block size-1.5 rounded-full bg-teal" />
                <span className="dq-mono tabular-nums text-navy">
                  {pinnedCounts[bb.id] ?? 0}
                </span>
                <span className="text-teal-700">
                  {(pinnedCounts[bb.id] ?? 0) === 1 ? "operator" : "operators"}
                </span>
              </div>
            ) : listKind === "smart" ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                <CountChip label="required" color="text-bad" dot="bg-bad" value={bb.requiredCriteria.length} />
                <CountChip
                  label="preferred"
                  color="text-orange-700"
                  dot="bg-orange"
                  value={bb.preferredCriteria.length}
                />
                <CountChip
                  label="excluded"
                  color="text-muted-foreground"
                  dot="bg-muted-2"
                  value={bb.excludedCriteria.length}
                />
              </div>
            ) : (
              // Hybrid — has both criteria and pins. Show the criteria
              // chips (what qualifies a match) stacked above the pin
              // count (what was manually added on top), each block
              // reusing its exact standalone markup.
              <>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                  <CountChip label="required" color="text-bad" dot="bg-bad" value={bb.requiredCriteria.length} />
                  <CountChip
                    label="preferred"
                    color="text-orange-700"
                    dot="bg-orange"
                    value={bb.preferredCriteria.length}
                  />
                  <CountChip
                    label="excluded"
                    color="text-muted-foreground"
                    dot="bg-muted-2"
                    value={bb.excludedCriteria.length}
                  />
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[12px]">
                  <span className="inline-block size-1.5 rounded-full bg-teal" />
                  <span className="dq-mono tabular-nums text-navy">
                    {pinnedCounts[bb.id] ?? 0}
                  </span>
                  <span className="text-teal-700">
                    {(pinnedCounts[bb.id] ?? 0) === 1 ? "operator" : "operators"}
                  </span>
                </div>
              </>
            )}

            <div className="mt-2 text-[11.5px] text-muted-foreground dq-mono">
              Updated {formatRelative(bb.updatedAt)}
            </div>

            <div className="mt-auto pt-5 flex flex-wrap items-center gap-2">
              <Link
                href={`/watch-lists/${bb.id}/results`}
                className="h-8 inline-flex items-center rounded-md bg-teal px-3 text-[12.5px] font-semibold text-white hover:bg-teal-700"
              >
                Apply →
              </Link>
              <Link
                href={`/watch-lists/${bb.id}/edit`}
                className="h-8 inline-flex items-center rounded-md border border-grid bg-white px-3 text-[12.5px] font-medium text-navy hover:border-teal hover:text-teal-700"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => handleDuplicate(bb)}
                disabled={busyId === bb.id}
                className="h-8 rounded-md border border-grid bg-white px-3 text-[12.5px] font-medium text-navy hover:border-teal hover:text-teal-700 disabled:opacity-50"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(bb.id)}
                disabled={busyId === bb.id}
                className="h-8 rounded-md border border-grid bg-white px-3 text-[12.5px] font-medium text-muted-foreground hover:border-bad hover:text-bad disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </article>
          );
        })}
      </div>

      {/* Delete confirmation */}
      {confirmTarget && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-navy/40 backdrop-blur-sm"
          onClick={() => busyId === null && setConfirmDeleteId(null)}
        >
          <div
            className="w-[420px] rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[18px] font-semibold text-navy">Delete watch list?</h2>
            <p className="mt-2 text-[13.5px] text-foreground/80">
              This will permanently remove{" "}
              <span className="font-semibold">{confirmTarget.name}</span>. This action
              can&rsquo;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                disabled={busyId !== null}
                className="h-9 rounded-md border border-grid bg-white px-3.5 text-[13.5px] font-medium text-navy hover:bg-surface-soft"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmTarget.id)}
                disabled={busyId !== null}
                className="h-9 rounded-md bg-bad px-3.5 text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busyId === confirmTarget.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CountChip({
  label,
  value,
  color,
  dot,
}: {
  label: string;
  value: number;
  color: string;
  dot: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block size-1.5 rounded-full ${dot}`} />
      <span className="dq-mono tabular-nums text-navy">{value}</span>
      <span className={color}>{label}</span>
    </span>
  );
}

function formatRelative(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = Date.now() - date.getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
