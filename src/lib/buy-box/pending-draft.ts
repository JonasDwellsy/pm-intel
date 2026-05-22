// Anonymous → authed save round-trip persistence.
//
// When an anonymous user clicks Save on /buy-boxes/new (template
// picker → editor), we redirect through /sign-in and Clerk drops
// them back at the same URL after auth. The URL only carries
// `?template=<slug>`, which restores the template defaults — any
// in-editor edits would be lost on the round-trip. This module
// snapshots the live editor state to sessionStorage before the
// redirect and replays it on the editor's next mount.
//
// Why sessionStorage and not localStorage / URL params:
//
//   - sessionStorage is scoped to the tab, so a draft never leaks
//     across browser windows or survives a tab close — matches the
//     ephemeral "I was about to save" intent.
//   - URL params can't hold the full criterion arrays without
//     exploding the link size; sessionStorage stores them straight.
//   - localStorage would persist across sessions and could shadow
//     real saved buy boxes weeks later.
//
// Safety rails:
//
//   - Each saved draft is namespaced by `templateSlug`. On hydrate
//     we refuse to apply a draft whose slug doesn't match the
//     current URL — prevents a leftover "Genstone" draft from
//     bleeding into a fresh "Evernest" editor.
//   - Drafts older than DRAFT_TTL_MS (30 min) are treated as stale
//     and discarded. Catches the edge case where the user signed in
//     yesterday and only now revisited a sign-in tab.
//   - The hydrate path clears the key on read so a page refresh
//     doesn't keep re-hydrating the same draft.

import type {
  FilterCriterion,
  WeightedCriterion,
} from "./fields";

export const PENDING_DRAFT_KEY = "dwellsy:pendingBuyBoxDraft";

/** 30 minutes. Long enough to cover sign-up + OTP delivery; short
 *  enough that a forgotten draft doesn't ambush a future session. */
export const DRAFT_TTL_MS = 30 * 60 * 1000;

export interface PendingDraft {
  /** Schema version so a future field-shape change can be detected
   *  and skipped without crashing the editor mount. */
  version: 1;
  /** Source template slug (or "blank"). Hydration refuses to apply
   *  a draft that doesn't match the current ?template= param so the
   *  user doesn't get a Genstone draft loaded into an Evernest editor. */
  templateSlug: string;
  name: string;
  description: string | null;
  requiredCriteria: FilterCriterion[];
  preferredCriteria: WeightedCriterion[];
  excludedCriteria: FilterCriterion[];
  /** Date.now() at write time. Used to expire stale drafts. */
  timestamp: number;
}

/** Minimal sessionStorage-shaped interface so this module is testable
 *  in Node where there's no real DOM. Browser code passes
 *  window.sessionStorage; tests pass a Map-backed mock. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function savePendingDraft(
  storage: StorageLike,
  draft: Omit<PendingDraft, "version" | "timestamp">
): void {
  const payload: PendingDraft = {
    ...draft,
    version: 1,
    timestamp: Date.now(),
  };
  try {
    storage.setItem(PENDING_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // Quota or private-mode failure — silently drop. Worst case the
    // user re-enters their edits; we don't want to abort the
    // sign-in redirect over storage failures.
  }
}

export interface LoadOptions {
  expectedTemplateSlug: string;
  /** Override clock for tests. Defaults to Date.now(). */
  now?: number;
  ttlMs?: number;
}

/**
 * Read + consume a pending draft. Returns the draft only when:
 *   - the key is present and parses cleanly
 *   - version matches
 *   - templateSlug matches `expectedTemplateSlug`
 *   - timestamp is within `ttlMs` of `now`
 *
 * On any of those failures (or success), the key is removed from
 * storage so refreshing the editor doesn't keep re-applying the
 * draft.
 */
export function consumePendingDraft(
  storage: StorageLike,
  options: LoadOptions
): PendingDraft | null {
  const raw = storage.getItem(PENDING_DRAFT_KEY);
  if (raw === null) return null;

  // Always clear on read, even if we end up rejecting the draft —
  // a malformed payload should not stick around forever, and a
  // slug-mismatch shouldn't perpetually shadow the new template.
  storage.removeItem(PENDING_DRAFT_KEY);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPendingDraft(parsed)) return null;
  if (parsed.templateSlug !== options.expectedTemplateSlug) return null;

  const now = options.now ?? Date.now();
  const ttl = options.ttlMs ?? DRAFT_TTL_MS;
  if (now - parsed.timestamp > ttl) return null;

  return parsed;
}

/** Belt-and-suspenders clear used by the editor on save success
 *  (the consume path also clears, but explicit clearing on save
 *  protects against the case where the user signed in, edited
 *  further, then saved without ever round-tripping through
 *  redirect). */
export function clearPendingDraft(storage: StorageLike): void {
  try {
    storage.removeItem(PENDING_DRAFT_KEY);
  } catch {
    // Same private-mode tolerance as savePendingDraft.
  }
}

function isPendingDraft(value: unknown): value is PendingDraft {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.templateSlug === "string" &&
    typeof v.name === "string" &&
    (v.description === null || typeof v.description === "string") &&
    Array.isArray(v.requiredCriteria) &&
    Array.isArray(v.preferredCriteria) &&
    Array.isArray(v.excludedCriteria) &&
    typeof v.timestamp === "number"
  );
}
