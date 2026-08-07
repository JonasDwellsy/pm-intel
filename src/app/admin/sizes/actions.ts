"use server";

// Write path for the admin reported-size tool.
//
// Unlike the name-correction tool this patches NOTHING live: the row is the
// whole deliverable. Reported counts are ground truth for calibrating the size
// estimator, and a number fed into the estimator can no longer validate it.
// See the model doc in prisma/schema.prisma.
//
// Auth: re-checks isAdminUser, since server actions are directly callable.

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";
import { parseReportedSizeInput } from "@/lib/operators/reported-size";

export interface ReportedSizeResult {
  ok: boolean;
  summary?: string;
  error?: string;
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

export async function saveReportedSize(
  _prev: ReportedSizeResult | null,
  formData: FormData
): Promise<ReportedSizeResult> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) return { ok: false, error: "Not found." };

  const targetKind = str(formData.get("targetKind"));
  const targetKey = str(formData.get("targetKey"));
  if (targetKind !== "pm" && targetKind !== "canonical") {
    return { ok: false, error: "Bad target." };
  }
  if (!targetKey) return { ok: false, error: "Pick an operator first." };

  const parsed = parseReportedSizeInput({
    reportedUnits: str(formData.get("reportedUnits")),
    reportedAsOf: str(formData.get("reportedAsOf")),
    sourceKind: str(formData.get("sourceKind")),
    sourceNote: str(formData.get("sourceNote")),
    now: new Date(),
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // Confirm the target still exists. A stale picker result (operator merged
  // away since the page loaded) would otherwise persist a row pointing at
  // nothing, which is worse than a visible error — the calibration would
  // silently carry a count it can never match to an estimate.
  const exists =
    targetKind === "pm"
      ? await prisma.pM.findUnique({ where: { slug: targetKey }, select: { slug: true } })
      : await prisma.canonicalOperator.findUnique({
          where: { canonicalSlug: targetKey },
          select: { canonicalSlug: true },
        });
  if (!exists) return { ok: false, error: "That operator no longer exists — search again." };

  await prisma.operatorReportedSize.upsert({
    where: { targetKind_targetKey: { targetKind, targetKey } },
    create: {
      targetKind,
      targetKey,
      ...parsed.value,
      decidedByUserId: userId,
    },
    update: { ...parsed.value, decidedByUserId: userId },
  });

  revalidatePath("/admin/sizes");
  return {
    ok: true,
    summary: `Recorded ${parsed.value.reportedUnits.toLocaleString()} units.`,
  };
}

export async function deleteReportedSize(
  _prev: ReportedSizeResult | null,
  formData: FormData
): Promise<ReportedSizeResult> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) return { ok: false, error: "Not found." };

  const id = str(formData.get("id"));
  if (!id) return { ok: false, error: "Missing id." };

  try {
    await prisma.operatorReportedSize.delete({ where: { id } });
  } catch (err) {
    // P2025 = already gone (a double-submit, or another admin's tab).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, error: "Already removed." };
    }
    throw err;
  }

  revalidatePath("/admin/sizes");
  return { ok: true, summary: "Removed." };
}
