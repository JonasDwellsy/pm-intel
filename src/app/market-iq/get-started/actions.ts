"use server";

import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { parseMarketIqBrandForm } from "@/lib/market-iq/report/form-values";
import { parseMarketIqScopeFormData } from "@/lib/market-iq/report/scope";
import { prisma } from "@/lib/prisma";

export async function completeMarketIqActivation(formData: FormData): Promise<void> {
  if (!marketIqPreviewEnabled()) throw new Error("Market IQ setup is unavailable.");
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId || !organizationId || !access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) {
    throw new Error("Market IQ access is unavailable.");
  }
  const brand = parseMarketIqBrandForm(formData);
  const selection = parseMarketIqScopeFormData(formData);
  if (!selection.cities.length && !selection.zipCodes.length) throw new Error("Select at least one city or ZIP code.");
  if (!selection.segments.length) throw new Error("Select at least one product segment.");
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
        onboardingCompletedAt: now,
      },
      update: {
        defaultMarketId: CLEVELAND_MARKET_ID,
        defaultCities: JSON.stringify(selection.cities),
        defaultZipCodes: JSON.stringify(selection.zipCodes),
        defaultSegments: JSON.stringify(selection.segments),
        onboardingCompletedAt: now,
      },
    }),
  ]);
  redirect("/market-iq/editions?activated=1");
}
