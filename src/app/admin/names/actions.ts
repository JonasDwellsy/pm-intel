"use server";

// Live applier for the admin operator-name tool. saveCorrection writes the
// OperatorNameCorrection row (source of truth) AND patches the operator's
// live DB rows so the change shows on the next page load; seed.ts re-applies
// the row on every reseed for durability. undoCorrection reverses both.
//
// Auth: re-checks isAdminUser (server actions are directly callable).

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
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

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

/** Patch the live DB rows for a target to `name`. Returns the pre-patch
 *  display name (for capturing originalName). */
async function patchLiveName(
  targetKind: string,
  targetKey: string,
  name: string
): Promise<string | null> {
  if (targetKind === "pm") {
    const pm = await prisma.pM.findUnique({
      where: { slug: targetKey },
      select: { name: true, scorecardData: true },
    });
    if (!pm) return null;
    const patch = computePmNamePatch(pm, name);
    await prisma.pM.update({ where: { slug: targetKey }, data: patch });
    return pm.name;
  }
  // canonical: the group row + every member's alias.
  const canon = await prisma.canonicalOperator.findUnique({
    where: { canonicalSlug: targetKey },
    select: { canonicalName: true },
  });
  const members = await prisma.pM.findMany({
    where: { canonicalOperatorId: targetKey },
    select: { slug: true, scorecardData: true },
  });
  if (!canon && members.length === 0) return null;
  if (canon) {
    await prisma.canonicalOperator.update({
      where: { canonicalSlug: targetKey },
      data: { canonicalName: name },
    });
  }
  for (const m of members) {
    const patch = computeCanonicalMemberPatch(m, name);
    await prisma.pM.update({ where: { slug: m.slug }, data: patch });
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

  const priorName = await patchLiveName(targetKind, targetKey, correctedName);
  if (priorName === null) {
    return { ok: false, error: "Operator not found." };
  }

  // Upsert the source-of-truth row. On UPDATE, keep the first originalName
  // (don't overwrite with the already-corrected value).
  await prisma.operatorNameCorrection.upsert({
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

  // Restore the original name to the live rows, then drop the row.
  await patchLiveName(row.targetKind, row.targetKey, row.originalName);
  await prisma.operatorNameCorrection.delete({ where: { id } });

  revalidatePath("/admin/names");
  revalidatePath("/", "layout");
  return { ok: true, summary: `Restored "${row.originalName}".` };
}
