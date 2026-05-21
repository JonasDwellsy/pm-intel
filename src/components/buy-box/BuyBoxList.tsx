"use client";

// Client wrapper around the list page. The server component loads
// the buy-box rows; we render them as a card grid with action
// buttons that hit the API:
//
//   - Apply      → Link to /buy-boxes/[id]/results (ranked table).
//                  Primary action — this is the value-prop view.
//   - Edit       → /buy-boxes/[id]/edit
//   - Duplicate  → POST /api/buy-boxes (copy with name "[orig] (copy)")
//                  then redirect into the new id's editor
//   - Delete     → confirm modal → DELETE /api/buy-boxes/[id]
//
// Empty state lives here too — pointing the user at /buy-boxes/new.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BuyBoxRecord } from "@/lib/buy-box/store";

interface Props {
  buyBoxes: BuyBoxRecord[];
}

export function BuyBoxList({ buyBoxes }: Props) {
  const router = useRouter();
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const confirmTarget = buyBoxes.find((b) => b.id === confirmDeleteId) ?? null;

  async function handleDuplicate(bb: BuyBoxRecord) {
    setBusyId(bb.id);
    setError(null);
    try {
      const res = await fetch("/api/buy-boxes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `${bb.name} (copy)`,
          description: bb.description,
          requiredCriteria: bb.requiredCriteria,
          preferredCriteria: bb.preferredCriteria,
          excludedCriteria: bb.excludedCriteria,
        }),
      });
      if (!res.ok) throw new Error(`Duplicate failed: ${res.status}`);
      const data = (await res.json()) as { buyBox: { id: string } };
      router.push(`/buy-boxes/${data.buyBox.id}/edit`);
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
      const res = await fetch(`/api/buy-boxes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setConfirmDeleteId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (buyBoxes.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {error && (
        <div className="mt-6 rounded-md border border-bad/40 bg-rose-soft px-4 py-2.5 text-[13px] text-bad">
          {error}
        </div>
      )}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {buyBoxes.map((bb) => (
          <article
            key={bb.id}
            className="flex flex-col rounded-lg border border-grid bg-white p-5 transition-shadow hover:shadow-tile-hover"
          >
            <header>
              <h2 className="text-[16px] font-semibold leading-snug text-navy">
                {bb.name}
              </h2>
              <p className="mt-1.5 line-clamp-2 min-h-[2.6em] text-[13px] text-foreground/70">
                {bb.description ?? (
                  <span className="italic text-muted-2">No description.</span>
                )}
              </p>
            </header>

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

            <div className="mt-2 text-[11.5px] text-muted-foreground dq-mono">
              Updated {formatRelative(bb.updatedAt)}
            </div>

            <div className="mt-auto pt-5 flex flex-wrap items-center gap-2">
              <Link
                href={`/buy-boxes/${bb.id}/results`}
                className="h-8 inline-flex items-center rounded-md bg-teal px-3 text-[12.5px] font-semibold text-white hover:bg-teal-700"
              >
                Apply →
              </Link>
              <Link
                href={`/buy-boxes/${bb.id}/edit`}
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
        ))}
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
            <h2 className="text-[18px] font-semibold text-navy">Delete buy box?</h2>
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

function EmptyState() {
  return (
    <div className="mt-10 rounded-lg border border-dashed border-grid bg-white p-10 text-center">
      <h2 className="text-[18px] font-semibold text-navy">No buy boxes yet</h2>
      <p className="mt-2 mx-auto max-w-[40ch] text-[13.5px] text-foreground/70">
        A buy box is a saved set of criteria for identifying property managers
        that match your acquisition or partnership thesis.
      </p>
      <Link
        href="/buy-boxes/new"
        className="mt-5 inline-flex h-9 items-center rounded-md bg-teal px-4 text-[13.5px] font-semibold text-white hover:bg-teal-700"
      >
        Create your first buy box
      </Link>
    </div>
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
