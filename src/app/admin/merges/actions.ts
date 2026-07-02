"use server";

// v0.23 — server action for the admin operator-merge tool. One action,
// button-driven: the submitted `decision` field ("merge" | "dismiss")
// selects the branch. Human decisions only — this records intent; the
// offline pipeline is the single applier (pools listings + recomputes).
//
// Auth: re-checks isAdminUser (defense in depth — server actions are
// callable directly, not only via the gated page render).

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";

export interface MergeDecisionResult {
  ok: boolean;
  /** Confirmation line on success. */
  summary?: string;
  error?: string;
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

export async function decideCluster(
  _prev: MergeDecisionResult | null,
  formData: FormData
): Promise<MergeDecisionResult> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) {
    return { ok: false, error: "Not found." };
  }

  const marketId = str(formData.get("marketId"));
  const clusterKey = str(formData.get("clusterKey"));
  const decision = str(formData.get("decision"));
  if (!marketId || !clusterKey) {
    return { ok: false, error: "Missing cluster identity." };
  }

  const memberSlugs = formData
    .getAll("memberSlugs")
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (decision === "dismiss") {
    await prisma.operatorMergeDecision.upsert({
      where: { marketId_clusterKey: { marketId, clusterKey } },
      create: {
        marketId,
        clusterKey,
        decision: "dismiss",
        memberSlugs: JSON.stringify(memberSlugs),
        decidedByUserId: userId,
      },
      update: {
        decision: "dismiss",
        canonicalName: null,
        survivorSlug: null,
        memberSlugs: JSON.stringify(memberSlugs),
        decidedByUserId: userId,
      },
    });
    revalidatePath("/admin/merges");
    return { ok: true, summary: "Dismissed — won't resurface." };
  }

  if (decision === "merge") {
    const canonicalName = str(formData.get("canonicalName")).trim();
    const survivorSlug = str(formData.get("survivorSlug"));
    if (memberSlugs.length < 2) {
      return { ok: false, error: "A merge needs at least two operators." };
    }
    if (!canonicalName) {
      return { ok: false, error: "Canonical name is required." };
    }
    if (!survivorSlug || !memberSlugs.includes(survivorSlug)) {
      return { ok: false, error: "Pick the surviving operator." };
    }
    await prisma.operatorMergeDecision.upsert({
      where: { marketId_clusterKey: { marketId, clusterKey } },
      create: {
        marketId,
        clusterKey,
        decision: "merge",
        canonicalName,
        survivorSlug,
        memberSlugs: JSON.stringify(memberSlugs),
        decidedByUserId: userId,
      },
      update: {
        decision: "merge",
        canonicalName,
        survivorSlug,
        memberSlugs: JSON.stringify(memberSlugs),
        decidedByUserId: userId,
      },
    });
    revalidatePath("/admin/merges");
    return {
      ok: true,
      summary: `Queued merge → "${canonicalName}" (${memberSlugs.length} records).`,
    };
  }

  return { ok: false, error: "Unknown decision." };
}
