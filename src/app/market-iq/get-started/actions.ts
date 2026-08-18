"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID, getMarketIqMarket } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { marketIqJourneyEventData, marketIqMilestoneDedupeKey } from "@/lib/market-iq/journey-telemetry.server";
import { parseMarketIqBrandForm, parseMarketIqEditorialDefaultsForm } from "@/lib/market-iq/report/form-values";
import { parseMarketIqSetupScopeFormData } from "@/lib/market-iq/report/scope";
import { prisma } from "@/lib/prisma";

async function activationContext(marketId: string) {
  if (!marketIqPreviewEnabled()) throw new Error("Market IQ setup is unavailable.");
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId || !organizationId || !access.hasProduct || !getMarketIqMarket(marketId) || !isMarketEntitled(access.entitlement, marketId)) {
    throw new Error("Market IQ access is unavailable.");
  }
  return { organizationId, userId, capabilities: access.capabilities };
}

async function persistActivation(formData: FormData, complete: boolean) {
  const requestedMarketId = String(formData.get("marketId") ?? "").trim();
  const marketId = requestedMarketId ? getMarketIqMarket(requestedMarketId)?.id : CLEVELAND_MARKET_ID;
  if (!marketId) throw new Error("The selected Market IQ market is unavailable.");
  const { organizationId, userId, capabilities } = await activationContext(marketId);
  const brand = parseMarketIqBrandForm(formData);
  const editorialDefaults = parseMarketIqEditorialDefaultsForm(formData);
  const selection = parseMarketIqSetupScopeFormData(formData, marketId);
  if (complete && !selection.cities.length && !selection.zipCodes.length) throw new Error("Select at least one city or ZIP code.");
  if (complete && !selection.segments.length) throw new Error("Select at least one product segment.");
  const now = new Date();
  const requestedStep = Number(String(formData.get("nextStep") ?? "1"));
  const savedStep = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 3 ? requestedStep : 1;
  await prisma.$transaction([
    prisma.organizationBrandProfile.upsert({
      where: { organizationId },
      create: { organizationId, ...brand, ...editorialDefaults },
      update: { ...brand, ...editorialDefaults },
    }),
    prisma.marketIqWorkspacePreference.upsert({
      where: { organizationId },
      create: {
        organizationId,
        defaultMarketId: marketId,
        defaultCities: JSON.stringify(selection.cities),
        defaultZipCodes: JSON.stringify(selection.zipCodes),
        defaultSegments: JSON.stringify(selection.segments),
        onboardingCompletedAt: complete ? now : null,
      },
      update: {
        defaultMarketId: marketId,
        defaultCities: JSON.stringify(selection.cities),
        defaultZipCodes: JSON.stringify(selection.zipCodes),
        defaultSegments: JSON.stringify(selection.segments),
        ...(complete ? { onboardingCompletedAt: now } : {}),
      },
    }),
    prisma.marketIqMarketPreference.upsert({
      where: { organizationId_marketId: { organizationId, marketId } },
      create: {
        organizationId,
        marketId,
        cities: JSON.stringify(selection.cities),
        zipCodes: JSON.stringify(selection.zipCodes),
        segments: JSON.stringify(selection.segments),
        configuredAt: complete ? now : null,
      },
      update: {
        cities: JSON.stringify(selection.cities),
        zipCodes: JSON.stringify(selection.zipCodes),
        segments: JSON.stringify(selection.segments),
        ...(complete ? { configuredAt: now } : {}),
      },
    }),
    prisma.marketIqJourneyEvent.createMany({
      data: [marketIqJourneyEventData({
        organizationId,
        actorUserId: userId,
        eventKey: complete ? "workspace_setup_completed" : "workspace_setup_progress_saved",
        milestone: "setup",
        status: complete ? "completed" : "started",
        sourceRoute: "/market-iq/get-started",
        dedupeKey: complete
          ? marketIqMilestoneDedupeKey(organizationId, "setup")
          : `market-iq:${organizationId}:setup:step:${savedStep}`,
        metadata: { step: savedStep, marketId },
      })],
      skipDuplicates: true,
    }),
  ]);
  revalidatePath("/market-iq/get-started");
  revalidatePath(`/market-iq/report?market=${encodeURIComponent(marketId)}`);
  revalidatePath(`/market-iq/market?market=${encodeURIComponent(marketId)}`);
  return capabilities;
}

export async function saveMarketIqActivationProgress(formData: FormData): Promise<{ nextStep: number }> {
  await persistActivation(formData, false);
  const requested = Number(String(formData.get("nextStep") ?? "1"));
  const nextStep = Number.isInteger(requested) && requested >= 1 && requested <= 3 ? requested : 1;
  return { nextStep };
}

export async function completeMarketIqActivation(formData: FormData): Promise<void> {
  const capabilities = await persistActivation(formData, true);
  if (String(formData.get("sourceAvailable") ?? "1") !== "1") {
    redirect("/market-iq?activated=1&source=unavailable");
  }
  redirect(capabilities.publishClientReports ? "/market-iq/launch?activated=1" : "/market-iq?activated=1");
}
