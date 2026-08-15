"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { marketIqClipped, marketIqValidEmail } from "@/lib/market-iq/report/form-values";
import { prisma } from "@/lib/prisma";

async function authorizedOrganizationId() {
  if (!marketIqPreviewEnabled()) return null;
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId || !organizationId || !access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) return null;
  return organizationId;
}

export async function saveMarketIqRecipient(formData: FormData): Promise<void> {
  const organizationId = await authorizedOrganizationId();
  const name = marketIqClipped(formData.get("name"), 120);
  const email = marketIqClipped(formData.get("email"), 254).toLowerCase();
  const kind = marketIqClipped(formData.get("kind"), 20);
  if (!organizationId || !name || !marketIqValidEmail(email) || !["client", "prospect"].includes(kind)) throw new Error("Enter a valid client or prospect.");
  await prisma.marketIqReportRecipient.upsert({
    where: { organizationId_email: { organizationId, email } },
    create: { organizationId, name, email, kind },
    update: { name, kind },
  });
  revalidatePath("/market-iq/distribution");
  redirect("/market-iq/distribution?saved=1");
}
