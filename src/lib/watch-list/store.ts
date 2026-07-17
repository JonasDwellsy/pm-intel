// Database adapter for WatchList rows. The DB stores criteria as
// JSON-encoded text columns (matching the project's existing
// JSON-as-String convention for scorecardData, marketIds, etc.);
// this module parses on read and stringifies on write so the API
// routes and apply() consume the typed shape directly.
//
// History:
//   v0.8  (PR #45)  — model shipped as BuyBox with anonymous "shared"
//                     owner.
//   v0.13 (PR #50)  — per-user auth via Clerk; ownerId becomes the
//                     authorization key.
//   v0.15 (PR #54)  — model renamed BuyBox → WatchList.
//   v0.18 (PR #65)  — multi-tenancy: organizationId becomes the
//                     authorization key. ownerId is RETAINED on the
//                     row for forensics + back-compat but is NO
//                     LONGER consulted for authz. Every read/write
//                     filters by organizationId exclusively.
//
// SECURITY-CRITICAL: callers MUST pass the organizationId resolved
// by getActiveOrgId() (see src/lib/auth/active-org.ts). Passing a
// userId here is a tenancy boundary violation — the type signatures
// below catch it via the named-property pattern (no positional
// arguments that could be mistakenly swapped).
//
//   v0.26 (Task 2/3) — Manual-pin watch lists ("kind") + a per-list
//   visibility model that's finer-grained than plain org-scoping:
//   view = own OR shared-to-your-org; edit = own OR legacy-owned in
//   your org (see ./visibility for the pure predicates). Every read
//   and write below now takes BOTH userId and organizationId and
//   defers to canViewList/canEditList as the source of truth — the
//   DB `where` clauses only narrow the candidate set for efficiency.

import { prisma } from "@/lib/prisma";
import type {
  FilterCriterion,
  WeightedCriterion,
} from "./fields";
import type { WatchListDefinition } from "./scoring";
import { canViewList, canEditList } from "./visibility";

/** Valid values for the `kind` column — "criteria" (smart list, matches
 *  via requiredCriteria/preferredCriteria/excludedCriteria) or "pinned"
 *  (manual pick list, membership via WatchListMember rows). Exported so
 *  request-body validation (POST /api/watch-lists) checks untrusted
 *  input against the same source of truth as createWatchList's own
 *  default, instead of duplicating the two literals. */
export const WATCH_LIST_KINDS = ["criteria", "pinned"] as const;
export type WatchListKind = (typeof WATCH_LIST_KINDS)[number];

export interface WatchListRecord extends WatchListDefinition {
  ownerId: string;
  organizationId: string | null;
  isShared: boolean;
  kind: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Authorization context every read/write below requires: the
 *  authenticated Clerk userId (resolved via auth()) AND the caller's
 *  active organizationId (resolved via getActiveOrgId()). Both are
 *  needed — canViewList/canEditList consult ownerId-vs-userId AND
 *  organizationId-vs-isShared together. */
export interface WatchListAuthContext {
  userId: string;
  organizationId: string;
}

/** Pre-auth placeholder. Retained only so seed scripts and tests can
 *  create rows without a Clerk session. Real request-driven writes
 *  use the authenticated user id instead. */
export const DEFAULT_OWNER_ID = "shared";

/** Stamp for rows that existed BEFORE per-user auth shipped. The
 *  migration (20260521_clerk_owner_id_backfill) rewrites every
 *  pre-existing ownerId="shared" row to this value; no real user
 *  will ever match it, so the legacy rows stay queryable for
 *  forensics but never appear in any user's list. */
export const LEGACY_OWNER_ID = "legacy-pre-auth";

function parseRow(row: {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  organizationId: string | null;
  isShared: boolean;
  kind: string;
  requiredCriteria: string;
  preferredCriteria: string;
  excludedCriteria: string;
  createdAt: Date;
  updatedAt: Date;
}): WatchListRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.ownerId,
    organizationId: row.organizationId,
    isShared: row.isShared,
    kind: row.kind,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    requiredCriteria: safeParseJson<FilterCriterion[]>(row.requiredCriteria, []),
    preferredCriteria: safeParseJson<WeightedCriterion[]>(row.preferredCriteria, []),
    excludedCriteria: safeParseJson<FilterCriterion[]>(row.excludedCriteria, []),
  };
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T;
    return fallback;
  } catch {
    return fallback;
  }
}

/** List watch lists visible to `userId` in their active org: lists
 *  they own (any org) OR lists shared within the active org. v0.26:
 *  the DB `where` only narrows the candidate set for efficiency —
 *  canViewList is the source of truth, applied defensively as a
 *  post-filter in case the narrowing ever drifts from the predicate.
 *  Used by the API route + the saved-list page; both resolve
 *  organizationId via getActiveOrgId() and userId via auth(). */
export async function listWatchListes(
  userId: string,
  organizationId: string
): Promise<WatchListRecord[]> {
  const rows = await prisma.watchList.findMany({
    where: { OR: [{ ownerId: userId }, { organizationId, isShared: true }] },
    orderBy: { updatedAt: "desc" },
  });
  return rows
    .map(parseRow)
    .filter((r) => canViewList(r, { userId, organizationId }));
}

/** Lists SHARED to an org (org-visible content, no ownerId match). Used by
 *  the digest content pass, which is org-scoped (not per-recipient). */
export async function listSharedForOrg(organizationId: string): Promise<WatchListRecord[]> {
  const rows = await prisma.watchList.findMany({
    where: { organizationId, isShared: true },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(parseRow);
}

/** Fetch a single watch list. Returns null unless `canViewList`
 *  passes for the given ctx — equivalent to a 404 from the caller's
 *  perspective so the API layer doesn't leak the existence of
 *  another user's private list or another org's watch lists. */
export async function getWatchList(
  id: string,
  ctx: WatchListAuthContext
): Promise<WatchListRecord | null> {
  const row = await prisma.watchList.findUnique({ where: { id } });
  if (!row) return null;
  const record = parseRow(row);
  if (!canViewList(record, ctx)) return null;
  return record;
}

export interface WatchListInput {
  name: string;
  description?: string | null;
  // ownerId stays populated for forensics + back-compat. New rows
  // set it to the creating user's Clerk userId; authz is via
  // canViewList/canEditList (see ./visibility), not organizationId
  // alone.
  ownerId: string;
  organizationId: string;
  isShared?: boolean;
  // v0.26 — "criteria" (smart list, default) | "pinned" (manual pick
  // list). Optional on both create and update; create defaults to
  // "criteria" so pre-existing callers are unaffected.
  kind?: string;
  requiredCriteria: FilterCriterion[];
  preferredCriteria: WeightedCriterion[];
  excludedCriteria: FilterCriterion[];
}

export async function createWatchList(input: WatchListInput): Promise<WatchListRecord> {
  const row = await prisma.watchList.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      ownerId: input.ownerId,
      organizationId: input.organizationId,
      isShared: input.isShared ?? false,
      kind: input.kind ?? "criteria",
      requiredCriteria: JSON.stringify(input.requiredCriteria),
      preferredCriteria: JSON.stringify(input.preferredCriteria),
      excludedCriteria: JSON.stringify(input.excludedCriteria),
    },
  });
  return parseRow(row);
}

/** Update a watch list. Fetches the existing row and refuses unless
 *  `canEditList` passes for the given ctx (own list, or a legacy-
 *  owned list in your org) — returns null in either the not-found or
 *  the refused case so the API layer can 404 without distinguishing
 *  them (no existence leak). */
export async function updateWatchList(
  id: string,
  input: Partial<Omit<WatchListInput, "organizationId" | "ownerId">>,
  ctx: WatchListAuthContext
): Promise<WatchListRecord | null> {
  const existing = await prisma.watchList.findUnique({ where: { id } });
  if (!existing) return null;
  if (!canEditList(parseRow(existing), ctx)) return null;

  const row = await prisma.watchList.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isShared !== undefined && { isShared: input.isShared }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.requiredCriteria !== undefined && {
        requiredCriteria: JSON.stringify(input.requiredCriteria),
      }),
      ...(input.preferredCriteria !== undefined && {
        preferredCriteria: JSON.stringify(input.preferredCriteria),
      }),
      ...(input.excludedCriteria !== undefined && {
        excludedCriteria: JSON.stringify(input.excludedCriteria),
      }),
    },
  });
  return parseRow(row);
}

/** Delete a watch list. Refuses unless `canEditList` passes for the
 *  given ctx. Returns false when the row doesn't exist OR the edit
 *  check fails — same no-existence-leak shape as updateWatchList. */
export async function deleteWatchList(
  id: string,
  ctx: WatchListAuthContext
): Promise<boolean> {
  try {
    const existing = await prisma.watchList.findUnique({ where: { id } });
    if (!existing) return false;
    if (!canEditList(parseRow(existing), ctx)) return false;
    await prisma.watchList.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/** v0.18 (PR #70, Phase 2) — Tri-state fetch for the detail-page
 *  graceful-handling path on org switch.
 *
 *  Distinguishes three cases that getWatchList() collapses into a
 *  single `null`:
 *
 *    1. "found"      — watch list IS in caller's active org AND
 *                      canViewList() passes (own list, or a list
 *                      shared within the org). Render.
 *    2. "wrong_org"  — watch list is in a DIFFERENT org that the
 *                      caller IS A MEMBER OF. Detail pages redirect
 *                      to /watch-lists?wrongOrg=<name> and show a
 *                      flash. Caller has access SOMEWHERE, just not
 *                      in their currently-active session.
 *    3. "not_found"  — watch list doesn't exist, exists in an org
 *                      the caller has no membership in, OR exists in
 *                      the caller's active org but is a TEAMMATE'S
 *                      PRIVATE list (canViewList fails). notFound().
 *                      This branch preserves the no-existence-leak
 *                      property for both random URL guessers AND
 *                      teammates guessing at each other's private
 *                      list ids.
 *
 *  v0.26 (Task 3, SECURITY): the "row is in caller's active org" test
 *  alone used to be sufficient for "found" — that's the leak this
 *  gate closes. A private list (isShared: false) owned by a
 *  different user in the SAME org must fall through to not_found,
 *  same as a cross-org list with no membership. The membership check
 *  further down (case 2 vs 3) is unchanged and still critical: without
 *  it, a random URL guesser could learn that a watch list ID exists by
 *  observing the redirect+flash. We only redirect when the caller
 *  is provably a member of the owning org. */
export type WatchListAccessResult =
  | { status: "found"; record: WatchListRecord }
  | { status: "wrong_org"; ownerOrgName: string }
  | { status: "not_found" };

/** List the pinned members of a watch list (manual-pick "kind":
 *  "pinned" lists). No authz here — this is a read helper; callers
 *  that expose it to a request MUST gate access themselves (e.g. via
 *  getWatchList/canViewList) before calling this, same pattern as
 *  every other unauthenticated helper in this module. */
export async function listMembers(
  watchListId: string
): Promise<{ memberKey: string; addedByUserId: string; createdAt: Date }[]> {
  const rows = await prisma.watchListMember.findMany({
    where: { watchListId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    memberKey: row.memberKey,
    addedByUserId: row.addedByUserId,
    createdAt: row.createdAt,
  }));
}

/** Add a pinned member to a watch list. Refuses unless `canEditList`
 *  passes for the given ctx — same no-existence-leak boolean-refusal
 *  shape as updateWatchList/deleteWatchList (the API layer 404s on
 *  false without distinguishing "not found" from "not authorized").
 *  Upserts on the (watchListId, memberKey) compound unique so a
 *  repeat pin of the same company is a no-op, not a duplicate row or
 *  a thrown unique-constraint error. */
export async function addMember(
  watchListId: string,
  memberKey: string,
  ctx: WatchListAuthContext
): Promise<boolean> {
  const existing = await prisma.watchList.findUnique({ where: { id: watchListId } });
  if (!existing) return false;
  if (!canEditList(parseRow(existing), ctx)) return false;

  await prisma.watchListMember.upsert({
    where: { watchListId_memberKey: { watchListId, memberKey } },
    create: { watchListId, memberKey, addedByUserId: ctx.userId },
    update: {},
  });
  return true;
}

/** Remove a pinned member from a watch list. Refuses unless
 *  `canEditList` passes for the given ctx. Tolerates the member
 *  already being absent (deleteMany's count can be 0) — the caller
 *  asked for the row to be gone, and it is, so this still reports
 *  success as long as they were authorized to ask. */
export async function removeMember(
  watchListId: string,
  memberKey: string,
  ctx: WatchListAuthContext
): Promise<boolean> {
  const existing = await prisma.watchList.findUnique({ where: { id: watchListId } });
  if (!existing) return false;
  if (!canEditList(parseRow(existing), ctx)) return false;

  await prisma.watchListMember.deleteMany({ where: { watchListId, memberKey } });
  return true;
}

export async function getWatchListWithCrossOrgCheck(args: {
  watchListId: string;
  userId: string;
  activeOrganizationId: string;
}): Promise<WatchListAccessResult> {
  const { watchListId, userId, activeOrganizationId } = args;
  const row = await prisma.watchList.findUnique({
    where: { id: watchListId },
  });
  if (!row) {
    return { status: "not_found" };
  }

  // Happy path — watch list is in the caller's active org. Still
  // gated by canViewList: a private (isShared: false) list owned by
  // someone else in this same org must NOT be exposed just because
  // it happens to share the caller's active organizationId.
  if (row.organizationId === activeOrganizationId) {
    const record = parseRow(row);
    if (!canViewList(record, { userId, organizationId: activeOrganizationId })) {
      return { status: "not_found" };
    }
    return { status: "found", record };
  }

  // Watch list is in a different org. Determine: is the caller a
  // member of that org? If yes, this is a "wrong org" scenario
  // (likely user just switched orgs). If no, treat as not_found
  // to avoid the existence leak.
  //
  // Defensive: if the watch list has no organizationId at all
  // (legacy sentinel rows from pre-Phase-1 data), it cannot belong
  // to any caller — treat as not_found.
  if (!row.organizationId) {
    return { status: "not_found" };
  }
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId,
      organizationId: row.organizationId,
    },
    select: {
      organization: { select: { name: true } },
    },
  });
  if (!membership) {
    return { status: "not_found" };
  }
  return {
    status: "wrong_org",
    ownerOrgName: membership.organization.name,
  };
}
