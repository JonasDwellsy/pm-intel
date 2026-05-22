// Database adapter for BuyBox rows. The DB stores criteria as
// JSON-encoded text columns (matching the project's existing
// JSON-as-String convention for scorecardData, marketIds, etc.);
// this module parses on read and stringifies on write so the API
// routes and apply() consume the typed shape directly.
//
// v0.13 (PR #50) — per-user auth. listBuyBoxes / getBuyBox now
// REQUIRE an ownerId; callers (the API routes + the saved-list
// page) pass the authenticated Clerk user id from auth(). getBuyBox
// returns null when the row exists but belongs to a different user
// so the API layer can 404 without leaking the existence of other
// users' buy boxes. Pre-auth rows that previously carried
// ownerId="shared" were re-stamped with LEGACY_OWNER_ID by the
// migration; no real user will ever match it.

import { prisma } from "@/lib/prisma";
import type {
  FilterCriterion,
  WeightedCriterion,
} from "./fields";
import type { BuyBoxDefinition } from "./scoring";

export interface BuyBoxRecord extends BuyBoxDefinition {
  ownerId: string;
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
  isShared: boolean;
  requiredCriteria: string;
  preferredCriteria: string;
  excludedCriteria: string;
  createdAt: Date;
  updatedAt: Date;
}): BuyBoxRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.ownerId,
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

/** List buy boxes owned by `ownerId`. Used by the API route + the
 *  saved-list page; both authenticate the caller and pass the
 *  Clerk user id straight through. */
export async function listBuyBoxes(ownerId: string): Promise<BuyBoxRecord[]> {
  const rows = await prisma.buyBox.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(parseRow);
}

/** Fetch a single buy box. When `ownerId` is provided, returns null
 *  if the row belongs to a different user — equivalent to a 404 from
 *  the caller's perspective, so the API layer doesn't leak the
 *  existence of other users' buy boxes. */
export async function getBuyBox(
  id: string,
  ownerId?: string
): Promise<BuyBoxRecord | null> {
  const row = await prisma.buyBox.findUnique({ where: { id } });
  if (!row) return null;
  if (ownerId !== undefined && row.ownerId !== ownerId) return null;
  return parseRow(row);
}

export interface BuyBoxInput {
  name: string;
  description?: string | null;
  ownerId?: string;
  isShared?: boolean;
  requiredCriteria: FilterCriterion[];
  preferredCriteria: WeightedCriterion[];
  excludedCriteria: FilterCriterion[];
}

export async function createBuyBox(input: BuyBoxInput): Promise<BuyBoxRecord> {
  const row = await prisma.buyBox.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      ownerId: input.ownerId ?? DEFAULT_OWNER_ID,
      isShared: input.isShared ?? true,
      requiredCriteria: JSON.stringify(input.requiredCriteria),
      preferredCriteria: JSON.stringify(input.preferredCriteria),
      excludedCriteria: JSON.stringify(input.excludedCriteria),
    },
  });
  return parseRow(row);
}

/** Update a buy box. When `ownerId` is provided, refuses to update
 *  rows that belong to a different user — returns null in that case
 *  so the API layer can 404. */
export async function updateBuyBox(
  id: string,
  input: Partial<BuyBoxInput>,
  ownerId?: string
): Promise<BuyBoxRecord | null> {
  const existing = await prisma.buyBox.findUnique({ where: { id } });
  if (!existing) return null;
  if (ownerId !== undefined && existing.ownerId !== ownerId) return null;

  const row = await prisma.buyBox.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.ownerId !== undefined && { ownerId: input.ownerId }),
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

/** Delete a buy box. When `ownerId` is provided, refuses to delete
 *  rows that belong to a different user. Returns false if either the
 *  row doesn't exist or the owner check fails. */
export async function deleteBuyBox(
  id: string,
  ownerId?: string
): Promise<boolean> {
  try {
    if (ownerId !== undefined) {
      const existing = await prisma.buyBox.findUnique({ where: { id } });
      if (!existing) return false;
      if (existing.ownerId !== ownerId) return false;
    }
    await prisma.buyBox.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}
