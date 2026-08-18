"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";

export type WorkspaceSupportResult = { ok: boolean; message?: string; error?: string };

const STATUSES = new Set(["open", "monitoring", "resolved"]);

function text(value: FormDataEntryValue | null, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export async function updateMarketIqWorkspaceSupport(
  _previous: WorkspaceSupportResult | null,
  formData: FormData,
): Promise<WorkspaceSupportResult> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) return { ok: false, error: "Not found." };

  const organizationId = text(formData.get("organizationId"), 100);
  const status = text(formData.get("status"), 20);
  const assignedTo = text(formData.get("assignedTo"), 120) || null;
  const note = text(formData.get("note"), 2000) || null;
  const followUpRaw = text(formData.get("followUpAt"), 20);
  const followUpAt = followUpRaw ? new Date(`${followUpRaw}T12:00:00.000Z`) : null;

  if (!organizationId || !STATUSES.has(status)) return { ok: false, error: "Choose a valid workspace status." };
  if (followUpAt && Number.isNaN(followUpAt.getTime())) return { ok: false, error: "Enter a valid follow-up date." };

  const organization = await prisma.organization.findFirst({ where: { id: organizationId, personalForUserId: null }, select: { id: true } });
  if (!organization) return { ok: false, error: "Workspace not found." };

  const previous = await prisma.marketIqWorkspaceSupportState.findUnique({ where: { organizationId } });
  const now = new Date();
  const action = !previous ? "opened" : previous.status === "resolved" && status !== "resolved" ? "reopened" : status === "resolved" ? "resolved" : status === "monitoring" ? "monitoring" : note ? "note" : "updated";

  await prisma.$transaction(async (tx) => {
    const state = await tx.marketIqWorkspaceSupportState.upsert({
      where: { organizationId },
      create: {
        organizationId,
        status,
        assignedTo,
        followUpAt,
        latestNote: note,
        updatedByUserId: userId,
        resolvedAt: status === "resolved" ? now : null,
      },
      update: {
        status,
        assignedTo,
        followUpAt,
        latestNote: note ?? previous?.latestNote ?? null,
        updatedByUserId: userId,
        resolvedAt: status === "resolved" ? previous?.resolvedAt ?? now : null,
      },
    });
    await tx.marketIqWorkspaceSupportEvent.create({
      data: {
        organizationId,
        supportStateId: state.id,
        action,
        fromStatus: previous?.status ?? null,
        toStatus: status,
        assignedTo,
        followUpAt,
        note,
        actorUserId: userId,
      },
    });
  });

  revalidatePath("/market-iq/internal/admin");
  revalidatePath(`/market-iq/internal/admin/${organizationId}`);
  return { ok: true, message: "Support record updated." };
}
