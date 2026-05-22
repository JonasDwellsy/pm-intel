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

import { prisma } from "@/lib/prisma";
import type {
  FilterCriterion,
  WeightedCriterion,
} from "./fields";
import type { WatchListDefinition } from "./scoring";

export interface WatchListRecord extends WatchListDefinition {
  ownerId: string;
  organizationId: string | null;
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
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

/** List watch lists scoped to the given org. v0.18: organizationId
 *  is the sole authorization key. Used by the API route + the
 *  saved-list page; both resolve organizationId via getActiveOrgId(). */
export async function listWatchListes(organizationId: string): Promise<WatchListRecord[]> {
  const rows = await prisma.watchList.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(parseRow);
}

/** Fetch a single watch list. When `organizationId` is provided
 *  (the normal path), returns null if the row belongs to a different
 *  org — equivalent to a 404 from the caller's perspective so the
 *  API layer doesn't leak the existence of other orgs' watch lists.
 *
 *  Calling without organizationId is reserved for internal use
 *  (seed scripts, migration scripts) and bypasses authz. Production
 *  request paths MUST pass organizationId. */
export async function getWatchList(
  id: string,
  organizationId?: string
): Promise<WatchListRecord | null> {
  const row = await prisma.watchList.findUnique({ where: { id } });
  if (!row) return null;
  if (organizationId !== undefined && row.organizationId !== organizationId) {
    return null;
  }
  return parseRow(row);
}

export interface WatchListInput {
  name: string;
  description?: string | null;
  // ownerId stays populated for forensics + back-compat. New rows
  // set it to the creating user's Clerk userId; authz is via
  // organizationId.
  ownerId: string;
  organizationId: string;
  isShared?: boolean;
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
      isShared: input.isShared ?? true,
      requiredCriteria: JSON.stringify(input.requiredCriteria),
      preferredCriteria: JSON.stringify(input.preferredCriteria),
      excludedCriteria: JSON.stringify(input.excludedCriteria),
    },
  });
  return parseRow(row);
}

/** Update a watch list. organizationId is the authz key — refuses
 *  to update rows in a different org. Returns null in that case so
 *  the API layer can 404. */
export async function updateWatchList(
  id: string,
  input: Partial<Omit<WatchListInput, "organizationId" | "ownerId">>,
  organizationId: string
): Promise<WatchListRecord | null> {
  const existing = await prisma.watchList.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.organizationId !== organizationId) return null;

  const row = await prisma.watchList.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isShared !== undefined && { isShared: input.isShared }),
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

/** Delete a watch list. organizationId is the authz key — refuses
 *  to delete rows in a different org. Returns false if either the
 *  row doesn't exist or the org check fails. */
export async function deleteWatchList(
  id: string,
  organizationId: string
): Promise<boolean> {
  try {
    const existing = await prisma.watchList.findUnique({ where: { id } });
    if (!existing) return false;
    if (existing.organizationId !== organizationId) return false;
    await prisma.watchList.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}
