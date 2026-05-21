// Database adapter for BuyBox rows. The DB stores criteria as
// JSON-encoded text columns (matching the project's existing
// JSON-as-String convention for scorecardData, marketIds, etc.);
// this module parses on read and stringifies on write so the API
// routes and apply() consume the typed shape directly.

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

/** Default owner placeholder until per-user auth lands. Every API
 *  call hardcodes this string so saved buy boxes show up for everyone
 *  in the org for MVP. When auth ships, swap to the authenticated
 *  user id and respect isShared at read time. */
export const DEFAULT_OWNER_ID = "shared";

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

export async function listBuyBoxes(): Promise<BuyBoxRecord[]> {
  const rows = await prisma.buyBox.findMany({ orderBy: { updatedAt: "desc" } });
  return rows.map(parseRow);
}

export async function getBuyBox(id: string): Promise<BuyBoxRecord | null> {
  const row = await prisma.buyBox.findUnique({ where: { id } });
  if (!row) return null;
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

export async function updateBuyBox(
  id: string,
  input: Partial<BuyBoxInput>
): Promise<BuyBoxRecord | null> {
  const existing = await prisma.buyBox.findUnique({ where: { id } });
  if (!existing) return null;

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

export async function deleteBuyBox(id: string): Promise<boolean> {
  try {
    await prisma.buyBox.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}
