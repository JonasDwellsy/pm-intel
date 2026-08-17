"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { ensureRecurringMarketIqEditionDraft } from "@/lib/market-iq/report/recurring-edition.server";
import { prisma } from "@/lib/prisma";

async function authorizedContext() {
  if (!marketIqPreviewEnabled()) throw new Error("Market IQ is unavailable.");
  const [{ userId, organizationId }, access] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
  ]);
  if (!userId || !organizationId || !access.hasProduct || !access.capabilities.useRecurringEditions || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) {
    throw new Error("Market IQ review access is unavailable.");
  }
  return { userId, organizationId };
}

function draftId(formData: FormData) {
  return String(formData.get("draftId") ?? "").trim().slice(0, 80);
}

export async function beginMarketIqDraftReview(formData: FormData): Promise<void> {
  const context = await authorizedContext();
  const id = draftId(formData);
  if (!id) throw new Error("Select a draft to review.");
  const draft = await prisma.marketIqEditionDraft.findFirst({
    where: { id, organizationId: context.organizationId, marketId: CLEVELAND_MARKET_ID, status: { in: ["ready", "reviewing"] } },
    select: { id: true, status: true },
  });
  if (!draft) throw new Error("This draft is no longer available for review.");
  if (draft.status === "ready") {
    await prisma.marketIqEditionDraft.update({
      where: { id: draft.id },
      data: { status: "reviewing", reviewStartedAt: new Date(), reviewStartedByUserId: context.userId },
    });
  }
  revalidatePath("/market-iq/review");
  revalidatePath("/market-iq/editions");
  redirect(`/market-iq/report?edition=draft&draftId=${draft.id}`);
}

export async function dismissMarketIqDraft(formData: FormData): Promise<void> {
  const context = await authorizedContext();
  const id = draftId(formData);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (!id || reason.length < 3) throw new Error("Choose a reason before dismissing this draft.");
  const result = await prisma.marketIqEditionDraft.updateMany({
    where: { id, organizationId: context.organizationId, marketId: CLEVELAND_MARKET_ID, status: { in: ["ready", "reviewing"] } },
    data: {
      status: "dismissed",
      reviewedAt: new Date(),
      dismissedAt: new Date(),
      dismissedByUserId: context.userId,
      dismissalReason: reason,
    },
  });
  if (result.count !== 1) throw new Error("This draft is no longer available to dismiss.");
  revalidatePath("/market-iq/review");
  revalidatePath("/market-iq/editions");
  redirect("/market-iq/review?draft=dismissed");
}

export async function retryMarketIqEditionCheck(): Promise<void> {
  const context = await authorizedContext();
  const result = await ensureRecurringMarketIqEditionDraft(context.organizationId);
  revalidatePath("/market-iq/review");
  revalidatePath("/market-iq/editions");
  if (result.state === "draft_created" || result.state === "draft_exists") {
    redirect(`/market-iq/review?check=${result.state}&draftId=${result.draftId}`);
  }
  redirect(`/market-iq/review?check=${result.state}`);
}
