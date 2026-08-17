"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { parseMarketIqBrandForm } from "@/lib/market-iq/report/form-values";
import { parseMarketIqScopeFormData } from "@/lib/market-iq/report/scope";
import { prisma } from "@/lib/prisma";

async function activationContext() {
  if (!marketIqPreviewEnabled()) throw new Error("Market IQ setup is unavailable.");
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId || !organizationId || !access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) {
    throw new Error("Market IQ access is unavailable.");
  }
  return { organizationId };
}

async function persistActivation(formData: FormData, complete: boolean) {
  const { organizationId } = await activationContext();
  const brand = parseMarketIqBrandForm(formData);
  const selection = parseMarketIqScopeFormData(formData);
  if (complete && !selection.cities.length && !selection.zipCodes.length) throw new Error("Select at least one city or ZIP code.");
  if (complete && !selection.segments.length) throw new Error("Select at least one product segment.");
  const now = new Date();
  await prisma.$transaction([
    prisma.organizationBrandProfile.upsert({
      where: { organizationId },
      create: { organizationId, ...brand },
      update: brand,
    }),
    prisma.marketIqWorkspacePreference.upsert({
      where: { organizationId },
      create: {
        organizationId,
        defaultMarketId: CLEVELAND_MARKET_ID,
        defaultCities: JSON.stringify(selection.cities),
        defaultZipCodes: JSON.stringify(selection.zipCodes),
        defaultSegments: JSON.stringify(selection.segments),
        onboardingCompletedAt: complete ? now : null,
      },
      update: {
        defaultMarketId: CLEVELAND_MARKET_ID,
        defaultCities: JSON.stringify(selection.cities),
        defaultZipCodes: JSON.stringify(selection.zipCodes),
        defaultSegments: JSON.stringify(selection.segments),
        ...(complete ? { onboardingCompletedAt: now } : {}),
      },
    }),
  ]);
  revalidatePath("/market-iq/get-started");
  revalidatePath("/market-iq/report");
}

export async function saveMarketIqActivationProgress(formData: FormData): Promise<void> {
  await persistActivation(formData, false);
  const requested = Number(String(formData.get("nextStep") ?? "1"));
  const nextStep = Number.isInteger(requested) && requested >= 1 && requested <= 3 ? requested : 1;
  redirect(`/market-iq/get-started?saved=1&step=${nextStep}`);
}

export async function completeMarketIqActivation(formData: FormData): Promise<void> {
  await persistActivation(formData, true);
  redirect("/market-iq/launch?activated=1");
}
