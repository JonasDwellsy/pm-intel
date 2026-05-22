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
import { useAuth } from "@clerk/nextjs";
import type {
  FilterCriterion,
  WeightedCriterion,
} from "@/lib/buy-box/fields";
import { FIELD_REGISTRY } from "@/lib/buy-box/fields";
import { isCriterionComplete } from "@/lib/buy-box/validation";
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

/** Optional starter shape for the create flow — when the user picks
 *  a template from the v0.10 picker, the page hands these values in
 *  to seed the editor state. Save still treats this as a new buy
 *  box (initial = null), so the deep clone the templates module
 *  returns becomes the editable draft without polluting the
 *  underlying template definitions. */
export interface StarterDraft {
  name: string;
  description?: string | null;
  requiredCriteria: FilterCriterion[];
  preferredCriteria: WeightedCriterion[];
  excludedCriteria: FilterCriterion[];
}

interface Props {
  /** null for /buy-boxes/new, populated for /buy-boxes/[id]/edit. */
  initial: EditorBuyBox | null;
  /** Optional seed for create-mode (template clone). Ignored when
   *  initial is set. */
  starterDraft?: StarterDraft;
  marketOptions: MarketOption[];
}

interface PreviewState {
  totalCandidates: number;
  matchedCount: number;
  scoreMin: number | null;
  scoreMax: number | null;
  topTen: Array<{ slug: string; name: string; market: string; fitScore: number }>;
}

export function BuyBoxEditor({ initial, starterDraft, marketOptions }: Props) {
  const router = useRouter();
  const isEdit = initial !== null;
  // Auth state. Editing existing buy boxes is already protected by
  // middleware (server-side); the editor itself runs in /buy-boxes/new
  // which stays anonymous-friendly per the PR #45 discovery path.
  // When an anon user clicks Save we bounce them through /sign-in
  // with redirect_url=<current path+query> so Clerk drops them back
  // here with the template state intact. isLoaded guards against
  // flashing the wrong button copy during initial hydration.
  const { isSignedIn, isLoaded: authLoaded } = useAuth();

  // Seed state from `initial` (edit mode), falling back to
  // `starterDraft` (template-clone mode), falling back to empty.
  // `initial` always wins so editing an existing buy box ignores
  // any drift from the new-flow path.
  const [name, setName] = React.useState(
    initial?.name ?? starterDraft?.name ?? ""
  );
  const [description, setDescription] = React.useState(
    initial?.description ?? starterDraft?.description ?? ""
  );
  const [required, setRequired] = React.useState<FilterCriterion[]>(
    initial?.requiredCriteria ?? starterDraft?.requiredCriteria ?? []
  );
  const [preferred, setPreferred] = React.useState<WeightedCriterion[]>(
    initial?.preferredCriteria ?? starterDraft?.preferredCriteria ?? []
  );
  const [excluded, setExcluded] = React.useState<FilterCriterion[]>(
    initial?.excludedCriteria ?? starterDraft?.excludedCriteria ?? []
  );

  const [saving, setSaving] = React.useState(false);
  /** Brief "Saved ✓" flash on the save button after a successful save
   *  (Issue 1 — v0.8.3). Lives separately from `saving` so the button
   *  copy can revert to "Save changes" after 1.5s without depending on
   *  the next render cycle. */
  const [justSaved, setJustSaved] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [toast, setToast] = React.useState<{ kind: "success" | "error"; msg: string } | null>(null);
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
  // Issue 2/5 (v0.8.3): block save when any criterion row is
  // incomplete (e.g. the user added a row but hasn't entered a
  // value yet). The same isCriterionComplete() the evaluator uses
  // to silently skip rows in the live preview powers the gate.
  const totalCriteria = required.length + preferred.length + excluded.length;
  const allCriteria: FilterCriterion[] = React.useMemo(
    () => [...required, ...preferred, ...excluded],
    [required, preferred, excluded]
  );
  const incompleteCount = allCriteria.filter((c) => !isCriterionComplete(c)).length;
  const validation: string | null =
    name.trim().length < 3
      ? "Name must be at least 3 characters."
      : totalCriteria === 0
      ? "Add at least one criterion."
      : incompleteCount > 0
      ? `Finish entering ${incompleteCount} criterion${incompleteCount === 1 ? "" : "s"} before saving.`
      : null;

  // ── Save handler ──────────────────────────────────────────────
  async function handleSave() {
    if (validation) {
      setError(validation);
      return;
    }
    // Anonymous-user → sign-in roundtrip. The template-clone path on
    // /buy-boxes/new stays public, but Save requires a real account.
    // We round-trip through Clerk's /sign-in with redirect_url back
    // to the current path + search so the user lands on the same
    // template-loaded draft after auth and can hit Save again. Any
    // in-editor edits to criteria don't survive the roundtrip — the
    // URL only preserves the ?template=… slug — which is the v0.13
    // scope limit.
    if (authLoaded && !isSignedIn) {
      const redirectTarget =
        window.location.pathname + window.location.search;
      router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectTarget)}`);
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
        flashSavedState();
        showToast("success", "Buy box saved.");
        router.refresh();
      } else {
        const res = await fetch(`/api/buy-boxes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Create failed: ${res.status}`);
        const data = (await res.json()) as { buyBox: { id: string } };
        // Flash the saved state + toast briefly before the route push
        // so the user sees the feedback even though we're about to
        // navigate away from /new.
        flashSavedState();
        showToast("success", "Buy box created.");
        router.push(`/buy-boxes/${data.buyBox.id}/edit`);
        router.refresh();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed.";
      setError(msg);
      showToast("error", msg);
    } finally {
      setSaving(false);
    }
  }

  /** Briefly show "Saved ✓" on the Save button. Revert after 1.5s. */
  function flashSavedState() {
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
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

  function showToast(kind: "success" | "error", msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 3000);
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
              className={
                "h-9 inline-flex items-center gap-1.5 rounded-md px-4 text-[13.5px] font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed " +
                (justSaved ? "bg-good" : "bg-teal hover:bg-teal-700")
              }
            >
              {saving ? (
                <>
                  <Spinner />
                  <span>Saving…</span>
                </>
              ) : justSaved ? (
                <>
                  <CheckIcon />
                  <span>Saved</span>
                </>
              ) : authLoaded && !isSignedIn && !isEdit ? (
                // Telegraph that anon save bounces through sign-in.
                // Edit mode is reached via a protected route so the
                // user is guaranteed signed in there — the swap only
                // applies to /buy-boxes/new (template-clone path).
                <span>Sign in to save</span>
              ) : (
                <span>{isEdit ? "Save changes" : "Create buy box"}</span>
              )}
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

      {/* Toast — success (navy) vs error (red) variants */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={
            "fixed bottom-[80px] left-1/2 z-30 -translate-x-1/2 rounded-md px-4 py-2 text-[13px] font-medium text-white shadow-lg " +
            (toast.kind === "success" ? "bg-good" : "bg-bad")
          }
        >
          <span className="inline-flex items-center gap-1.5">
            {toast.kind === "success" ? <CheckIcon /> : null}
            {toast.msg}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── tiny icons ─────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      aria-hidden
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
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
