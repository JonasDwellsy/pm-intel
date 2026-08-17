"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { ensureRecurringMarketIqEditionDraft } from "@/lib/market-iq/report/recurring-edition.server";

export async function checkForRecurringMarketIqEdition(): Promise<void> {
  if (!marketIqPreviewEnabled()) throw new Error("Market IQ is unavailable.");
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId || !organizationId || !access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) {
    throw new Error("Market IQ edition access is unavailable.");
  }
  const result = await ensureRecurringMarketIqEditionDraft(organizationId);
  revalidatePath("/market-iq/editions");
  revalidatePath("/market-iq/launch");
  if (result.state === "draft_created" || result.state === "draft_exists") {
    redirect(`/market-iq/report?edition=draft&draftId=${result.draftId}`);
  }
  redirect(`/market-iq/editions?refresh=${result.state}`);
}
