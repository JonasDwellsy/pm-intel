"use client";

// Buy Box editor — owns the entire form state (name, description,
// three criterion arrays) and orchestrates:
//
//   - Three stacked sections (REQUIRED / PREFERRED / EXCLUDED)
//     keyed by layer color (red / gold / gray) so users feel the
//     three-layer waterfall in the UI.
//   - Live preview: debounced 500ms POST /api/buy-boxes/preview
//     that drives the sticky bottom match-count strip + the
//     top-10 side panel.
//   - Save → POST /api/buy-boxes (create) or PUT /api/buy-boxes/[id]
//     (update). On create the parent router pushes us into edit
//     mode; on update we stay on page and flash a toast.
//   - Delete (edit mode) → confirm modal → DELETE → redirect to /buy-boxes.
//
// The component is self-contained: pages mount it with either an
// `initialBuyBox` (edit) or `null` (new) and pass through the market
// option list loaded server-side for the marketIds picker.

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  FilterCriterion,
  WeightedCriterion,
} from "@/lib/buy-box/fields";
import { FIELD_REGISTRY } from "@/lib/buy-box/fields";
import type { MarketOption } from "@/lib/buy-box/editor-options";
import { CriterionRow, type Layer } from "./CriterionRow";

export interface EditorBuyBox {
  id: string;
  name: string;
  description: string | null;
  requiredCriteria: FilterCriterion[];
  preferredCriteria: WeightedCriterion[];
  excludedCriteria: FilterCriterion[];
}

interface Props {
  /** null for /buy-boxes/new, populated for /buy-boxes/[id]/edit. */
  initial: EditorBuyBox | null;
  marketOptions: MarketOption[];
}

interface PreviewState {
  totalCandidates: number;
  matchedCount: number;
  scoreMin: number | null;
  scoreMax: number | null;
  topTen: Array<{ slug: string; name: string; market: string; fitScore: number }>;
}

export function BuyBoxEditor({ initial, marketOptions }: Props) {
  const router = useRouter();
  const isEdit = initial !== null;

  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [required, setRequired] = React.useState<FilterCriterion[]>(
    initial?.requiredCriteria ?? []
  );
  const [preferred, setPreferred] = React.useState<WeightedCriterion[]>(
    initial?.preferredCriteria ?? []
  );
  const [excluded, setExcluded] = React.useState<FilterCriterion[]>(
    initial?.excludedCriteria ?? []
  );

  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showPreviewPanel, setShowPreviewPanel] = React.useState(false);

  const [preview, setPreview] = React.useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  // ── Live preview (debounced 500ms) ────────────────────────────
  React.useEffect(() => {
    const handle = window.setTimeout(async () => {
      // Don't bother previewing an empty buy box.
      if (required.length === 0 && preferred.length === 0 && excluded.length === 0) {
        setPreview(null);
        return;
      }
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/buy-boxes/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requiredCriteria: required,
            preferredCriteria: preferred,
            excludedCriteria: excluded,
          }),
        });
        if (res.ok) {
          setPreview((await res.json()) as PreviewState);
        }
      } catch {
        // Silent — the preview is a non-blocking nicety.
      } finally {
        setPreviewLoading(false);
      }
    }, 500);
    return () => window.clearTimeout(handle);
  }, [required, preferred, excluded]);

  // ── Validation ────────────────────────────────────────────────
  const totalCriteria = required.length + preferred.length + excluded.length;
  const validation: string | null =
    name.trim().length < 3
      ? "Name must be at least 3 characters."
      : totalCriteria === 0
      ? "Add at least one criterion."
      : null;

  // ── Save handler ──────────────────────────────────────────────
  async function handleSave() {
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        requiredCriteria: required,
        preferredCriteria: preferred,
        excludedCriteria: excluded,
      };
      if (isEdit && initial) {
        const res = await fetch(`/api/buy-boxes/${initial.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Update failed: ${res.status}`);
        flashToast("Saved.");
        router.refresh();
      } else {
        const res = await fetch(`/api/buy-boxes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Create failed: ${res.status}`);
        const data = (await res.json()) as { buyBox: { id: string } };
        router.push(`/buy-boxes/${data.buyBox.id}/edit`);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete handler ────────────────────────────────────────────
  async function handleDelete() {
    if (!isEdit || !initial) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/buy-boxes/${initial.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      router.push("/buy-boxes");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  function flashToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  // ── Add-criterion factories ───────────────────────────────────
  function addRequired() {
    const def = defaultCriterion();
    setRequired((rs) => [...rs, def]);
  }
  function addPreferred() {
    const def = defaultCriterion();
    setPreferred((ps) => [...ps, { ...def, weight: 0.2 }]);
  }
  function addExcluded() {
    const def = defaultCriterion();
    setExcluded((es) => [...es, def]);
  }

  return (
    <div className="bg-background pb-32">
      <div className="mx-auto max-w-[1080px] px-6 py-10">
        {/* Header */}
        <div className="flex items-baseline justify-between">
          <div>
            <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
              Buy Box · v0.8 editor
            </p>
            <h1 className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.012em] text-navy">
              {isEdit ? "Edit buy box" : "New buy box"}
            </h1>
          </div>
          <Link
            href="/buy-boxes"
            className="text-[13px] font-medium text-teal hover:text-teal-700 hover:underline"
          >
            ← Back to list
          </Link>
        </div>

        {/* Name + description */}
        <div className="mt-8 rounded-lg border border-grid bg-white p-6">
          <div>
            <label className="dq-field-label">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SFR Independent — Phoenix growth"
              className="mt-1.5 h-10 w-full rounded-md border border-grid bg-white px-3 text-[14px] text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
          </div>
          <div className="mt-5">
            <label className="dq-field-label">Description</label>
            <textarea
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional — describe what this buy box targets."
              className="mt-1.5 w-full rounded-md border border-grid bg-white px-3 py-2 text-[14px] text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
          </div>
        </div>

        {/* REQUIRED — hard filter, red */}
        <Section
          title="Required"
          eyebrowColor="text-bad"
          dotColor="bg-bad"
          description="Hard filters. Operators that miss any required criterion are excluded entirely."
          onAdd={addRequired}
          count={required.length}
        >
          {required.map((c, i) => (
            <CriterionRow
              key={`req-${i}`}
              layer="required"
              criterion={c}
              marketOptions={marketOptions}
              onChange={(next) =>
                setRequired((rs) => rs.map((x, j) => (i === j ? (next as FilterCriterion) : x)))
              }
              onRemove={() => setRequired((rs) => rs.filter((_, j) => j !== i))}
            />
          ))}
          {required.length === 0 && <EmptyHint layer="required" />}
        </Section>

        {/* PREFERRED — weighted, gold */}
        <Section
          title="Preferred"
          eyebrowColor="text-orange-700"
          dotColor="bg-orange"
          description="Weighted preferences. Each contributes to the 0–100 fit score; weights normalize automatically."
          onAdd={addPreferred}
          count={preferred.length}
        >
          {preferred.map((c, i) => (
            <CriterionRow
              key={`pref-${i}`}
              layer="preferred"
              criterion={c}
              marketOptions={marketOptions}
              onChange={(next) =>
                setPreferred((ps) =>
                  ps.map((x, j) => (i === j ? (next as WeightedCriterion) : x))
                )
              }
              onRemove={() => setPreferred((ps) => ps.filter((_, j) => j !== i))}
            />
          ))}
          {preferred.length === 0 && <EmptyHint layer="preferred" />}
        </Section>

        {/* EXCLUDED — veto, gray */}
        <Section
          title="Excluded"
          eyebrowColor="text-muted-foreground"
          dotColor="bg-muted-2"
          description="Veto rules. Any match here removes the operator entirely, regardless of fit elsewhere."
          onAdd={addExcluded}
          count={excluded.length}
        >
          {excluded.map((c, i) => (
            <CriterionRow
              key={`exc-${i}`}
              layer="excluded"
              criterion={c}
              marketOptions={marketOptions}
              onChange={(next) =>
                setExcluded((es) =>
                  es.map((x, j) => (i === j ? (next as FilterCriterion) : x))
                )
              }
              onRemove={() => setExcluded((es) => es.filter((_, j) => j !== i))}
            />
          ))}
          {excluded.length === 0 && <EmptyHint layer="excluded" />}
        </Section>

        {error && (
          <div className="mt-6 rounded-md border border-bad/40 bg-rose-soft px-4 py-2.5 text-[13px] text-bad">
            {error}
          </div>
        )}
      </div>

      {/* Top-10 preview panel — slides up from the strip */}
      {showPreviewPanel && preview && preview.topTen.length > 0 && (
        <div className="fixed bottom-[64px] left-1/2 z-30 -translate-x-1/2 w-[min(960px,calc(100%-3rem))] max-h-[50vh] overflow-y-auto rounded-t-lg border border-grid border-b-0 bg-white shadow-lg">
          <div className="sticky top-0 flex items-center justify-between border-b border-grid bg-white px-5 py-3">
            <h2 className="text-[14px] font-semibold text-navy">
              Top {preview.topTen.length} matches
            </h2>
            <button
              type="button"
              onClick={() => setShowPreviewPanel(false)}
              className="text-[12px] text-muted-foreground hover:text-navy"
            >
              Close
            </button>
          </div>
          <table className="dq-table w-full">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Market</th>
                <th className="text-right">Fit</th>
              </tr>
            </thead>
            <tbody>
              {preview.topTen.map((t) => (
                <tr key={t.slug}>
                  <td className="font-semibold text-navy">{t.name}</td>
                  <td className="text-[13px] text-foreground/80">{t.market}</td>
                  <td className="dq-mono text-right">{t.fitScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sticky bottom strip */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-grid bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-5">
            <MatchStat preview={preview} loading={previewLoading} />
            {preview && preview.matchedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowPreviewPanel((v) => !v)}
                className="text-[12.5px] font-medium text-teal hover:text-teal-700 hover:underline"
              >
                {showPreviewPanel ? "Hide top 10" : "Preview top 10"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEdit && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={saving || deleting}
                className="h-9 rounded-md border border-bad/40 bg-white px-3.5 text-[13.5px] font-medium text-bad hover:bg-rose-soft disabled:opacity-50"
              >
                Delete
              </button>
            )}
            <Link
              href="/buy-boxes"
              className="h-9 inline-flex items-center rounded-md border border-grid bg-white px-3.5 text-[13.5px] font-medium text-navy hover:bg-surface-soft"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || deleting || validation !== null}
              className="h-9 rounded-md bg-teal px-4 text-[13.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create buy box"}
            </button>
          </div>
        </div>
        {validation && (
          <div className="mx-auto max-w-[1080px] px-6 pb-2 text-[12px] text-muted-foreground">
            {validation}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-navy/40 backdrop-blur-sm"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div
            className="w-[420px] rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[18px] font-semibold text-navy">Delete buy box?</h2>
            <p className="mt-2 text-[13.5px] text-foreground/80">
              This will permanently remove{" "}
              <span className="font-semibold">{initial?.name}</span>. This action
              can&rsquo;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="h-9 rounded-md border border-grid bg-white px-3.5 text-[13.5px] font-medium text-navy hover:bg-surface-soft"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="h-9 rounded-md bg-bad px-3.5 text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[80px] left-1/2 z-30 -translate-x-1/2 rounded-md bg-navy px-4 py-2 text-[13px] font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────

function Section({
  title,
  eyebrowColor,
  dotColor,
  description,
  onAdd,
  count,
  children,
}: {
  title: string;
  eyebrowColor: string;
  dotColor: string;
  description: string;
  onAdd: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-lg border border-grid bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-block size-2 rounded-full ${dotColor}`} />
            <h2 className={`dq-eyebrow ${eyebrowColor}`}>{title}</h2>
            <span className="dq-mono text-[11px] text-muted-foreground">
              ({count})
            </span>
          </div>
          <p className="mt-2 max-w-[60ch] text-[13px] text-foreground/70">
            {description}
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="h-8 shrink-0 rounded-md border border-grid bg-white px-3 text-[13px] font-medium text-teal hover:border-teal hover:bg-teal-soft"
        >
          + Add criterion
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-2">{children}</div>
    </section>
  );
}

function EmptyHint({ layer }: { layer: Layer }) {
  const labels: Record<Layer, string> = {
    required: "No required criteria yet.",
    preferred: "No preferred criteria yet.",
    excluded: "No excluded criteria yet.",
  };
  return (
    <div className="rounded-md border border-dashed border-grid bg-surface-soft px-4 py-3 text-[12.5px] italic text-muted-foreground">
      {labels[layer]}
    </div>
  );
}

function MatchStat({
  preview,
  loading,
}: {
  preview: PreviewState | null;
  loading: boolean;
}) {
  if (preview === null) {
    return (
      <div className="text-[12.5px] text-muted-foreground">
        Add a criterion to preview matches.
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-3 text-[13px]">
      <span className="dq-mono text-[18px] font-semibold text-navy tabular-nums">
        {preview.matchedCount}
      </span>
      <span className="text-muted-foreground">
        of {preview.totalCandidates} operators match
      </span>
      {preview.scoreMin !== null && preview.scoreMax !== null && (
        <span className="text-muted-foreground">
          · scores{" "}
          <span className="dq-mono text-navy">
            {preview.scoreMin}–{preview.scoreMax}
          </span>
        </span>
      )}
      {loading && <span className="text-[11px] text-muted-foreground">updating…</span>}
    </div>
  );
}

// ─── factory ────────────────────────────────────────────────────

function defaultCriterion(): FilterCriterion {
  // Pick a sensible default field so the first row renders something
  // useful (and so the operator+value drop into a valid state).
  const fieldId = "quadrant7Cell";
  const entry = FIELD_REGISTRY[fieldId];
  const op = entry.validOperators[0];
  return { field: fieldId, operator: op, value: "" };
}
