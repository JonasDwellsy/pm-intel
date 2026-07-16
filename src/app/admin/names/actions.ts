"use server";

// Live applier for the admin operator-name tool. saveCorrection writes the
// OperatorNameCorrection row (source of truth) AND patches the operator's
// live DB rows so the change shows on the next page load; seed.ts re-applies
// the row on every reseed for durability. undoCorrection reverses both.
//
// Auth: re-checks isAdminUser (server actions are directly callable).

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";
import {
  computePmNamePatch,
  computeCanonicalMemberPatch,
} from "@/lib/operators/name-correction";

export interface NameCorrectionResult {
  ok: boolean;
  summary?: string;
  error?: string;
}

const NOT_FOUND = "NOT_FOUND";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

/** Patch the live DB rows for a target to `name`. Returns the pre-patch
 *  display name (for capturing originalName). All queries run against the
 *  passed transaction client so callers can compose this with other writes
 *  atomically. */
async function patchLiveName(
  tx: Prisma.TransactionClient,
  targetKind: string,
  targetKey: string,
  name: string
): Promise<string | null> {
  if (targetKind === "pm") {
    const pm = await tx.pM.findUnique({
      where: { slug: targetKey },
      select: { name: true, scorecardData: true },
    });
    if (!pm) return null;
    const patch = computePmNamePatch(pm, name);
    await tx.pM.update({ where: { slug: targetKey }, data: patch });
    return pm.name;
  }
  // canonical: the group row + every member's alias.
  const canon = await tx.canonicalOperator.findUnique({
    where: { canonicalSlug: targetKey },
    select: { canonicalName: true },
  });
  const members = await tx.pM.findMany({
    where: { canonicalOperatorId: targetKey },
    select: { slug: true, scorecardData: true },
  });
  if (!canon && members.length === 0) return null;
  if (canon) {
    await tx.canonicalOperator.update({
      where: { canonicalSlug: targetKey },
      data: { canonicalName: name },
    });
  }
  for (const m of members) {
    const patch = computeCanonicalMemberPatch(m, name);
    await tx.pM.update({ where: { slug: m.slug }, data: patch });
  }
  return canon?.canonicalName ?? null;
}

export async function saveCorrection(
  _prev: NameCorrectionResult | null,
  formData: FormData
): Promise<NameCorrectionResult> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) return { ok: false, error: "Not found." };

  const targetKind = str(formData.get("targetKind"));
  const targetKey = str(formData.get("targetKey"));
  const correctedName = str(formData.get("correctedName")).trim();
  if (targetKind !== "pm" && targetKind !== "canonical") {
    return { ok: false, error: "Bad target." };
  }
  if (!targetKey) return { ok: false, error: "Missing operator." };
  if (!correctedName) return { ok: false, error: "Corrected name is required." };

  try {
    await prisma.$transaction(async (tx) => {
      const priorName = await patchLiveName(tx, targetKind, targetKey, correctedName);
      if (priorName === null) {
        throw new Error(NOT_FOUND);
      }

      // Upsert the source-of-truth row. On UPDATE, keep the first originalName
      // (don't overwrite with the already-corrected value).
      await tx.operatorNameCorrection.upsert({
        where: { targetKind_targetKey: { targetKind, targetKey } },
        create: {
          targetKind,
          targetKey,
          correctedName,
          originalName: priorName,
          decidedByUserId: userId,
        },
        update: { correctedName, decidedByUserId: userId },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === NOT_FOUND) {
      return { ok: false, error: "Operator not found." };
    }
    throw err;
  }

  revalidatePath("/admin/names");
  revalidatePath("/", "layout"); // operator/market/scorecard pages
  return { ok: true, summary: `Renamed to "${correctedName}".` };
}

export async function undoCorrection(
  _prev: NameCorrectionResult | null,
  formData: FormData
): Promise<NameCorrectionResult> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) return { ok: false, error: "Not found." };

  const id = str(formData.get("id"));
  if (!id) return { ok: false, error: "Missing correction id." };

  const row = await prisma.operatorNameCorrection.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Already removed." };

  // Restore the original name to the live rows, then drop the row. A
  // concurrent double-undo can still race between the findUnique above and
  // this delete — Prisma throws P2025 (record to delete not found) in that
  // case, which we turn into the same friendly message rather than a 500.
  try {
    await prisma.$transaction(async (tx) => {
      await patchLiveName(tx, row.targetKind, row.targetKey, row.originalName);
      await tx.operatorNameCorrection.delete({ where: { id } });
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return { ok: false, error: "Already removed." };
    }
    throw err;
  }

  revalidatePath("/admin/names");
  revalidatePath("/", "layout");
  return { ok: true, summary: `Restored "${row.originalName}".` };
}
