"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { organizationHasMarketIqAccess, resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { loadMarketIqReportComposer } from "@/lib/market-iq/report/composer.server";
import { buildEditionEnrollmentReadiness } from "@/lib/market-iq/report/edition-enrollment";
import { ensureRecurringMarketIqEditionDraft } from "@/lib/market-iq/report/recurring-edition.server";
import { marketIqSelectionFromPreference } from "@/lib/market-iq/workspace-preference";
import { prisma } from "@/lib/prisma";

export async function checkForRecurringMarketIqEdition(): Promise<void> {
  if (!marketIqPreviewEnabled()) throw new Error("Market IQ is unavailable.");
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId || !organizationId || !access.hasProduct || !access.capabilities.useRecurringEditions || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) {
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

export async function setMarketIqRecurringEnrollment(formData: FormData): Promise<void> {
  if (!marketIqPreviewEnabled()) throw new Error("Market IQ is unavailable.");
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  const hasCommercialAccess = Boolean(
    userId
    && organizationId
    && access.hasProduct
    && access.capabilities.useRecurringEditions
    && isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID),
  );
  if (!userId || !organizationId || !hasCommercialAccess) {
    throw new Error("Market IQ edition access is unavailable.");
  }
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const [organization, composer, organizationHasAccess] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { brandProfile: { select: { id: true } }, marketIqWorkspacePreference: true },
    }),
    loadMarketIqReportComposer(organizationId),
    organizationHasMarketIqAccess(organizationId, CLEVELAND_MARKET_ID),
  ]);
  const preference = organization?.marketIqWorkspacePreference ?? null;
  if (!preference) throw new Error("Complete Market IQ activation before changing recurring enrollment.");

  if (enabled) {
    const selection = marketIqSelectionFromPreference(preference);
    const readiness = buildEditionEnrollmentReadiness({
      hasCommercialAccess: organizationHasAccess,
      hasBrandProfile: Boolean(organization?.brandProfile),
      onboardingCompleted: Boolean(preference.onboardingCompletedAt),
      hasSavedGeography: selection.cities.length > 0 || selection.zipCodes.length > 0,
      hasSavedSegment: selection.segments.length > 0,
      sourceIsAuthoritative: composer?.preview.source === "dwellsy_trends",
      sourceAvailableThrough: composer?.preview.snapshot.scope.periodEnd ?? null,
      hasPublishedBaseline: Boolean(composer?.priorEdition),
      recurringEditionsEnabled: preference.recurringEditionsEnabled,
    });
    if (!readiness.prerequisitesPassed) {
      throw new Error(`Recurring editions cannot be enabled until these checks pass: ${readiness.blockers.map((check) => check.label).join(", ")}.`);
    }
  }

  await prisma.marketIqWorkspacePreference.update({
    where: { organizationId },
    data: enabled
      ? { recurringEditionsEnabled: true, recurringEnabledAt: new Date(), recurringEnabledByUserId: userId }
      : { recurringEditionsEnabled: false, recurringEnabledAt: null, recurringEnabledByUserId: null },
  });
  revalidatePath("/market-iq/editions");
  redirect(`/market-iq/editions?enrollment=${enabled ? "enabled" : "disabled"}`);
}
