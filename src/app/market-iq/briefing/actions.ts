"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { buildMarketIqBriefingArchivePayload } from "@/lib/market-iq/weekly-briefing";
import { loadMarketIqWeeklyBriefing } from "@/lib/market-iq/weekly-briefing.server";
import { prisma } from "@/lib/prisma";

export async function freezeMarketIqWeeklyBriefing(): Promise<void> {
  if (!marketIqPreviewEnabled()) throw new Error("Market IQ is unavailable.");
  const [{ userId, organizationId }, access] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
  ]);
  if (!userId || !organizationId || !access.hasProduct) throw new Error("Market IQ briefing access is unavailable.");

  const loaded = await loadMarketIqWeeklyBriefing({
    organizationId,
    entitlement: access.entitlement,
    clientAdvisoryEnabled: access.capabilities.publishClientReports,
  });
  if (!loaded || loaded.briefing.marketCount === 0) throw new Error("No entitled markets are available for this briefing.");
  const payload = buildMarketIqBriefingArchivePayload(loaded.briefing, new Date());

  await prisma.marketIqBriefingSnapshot.upsert({
    where: { organizationId_weekOf: { organizationId, weekOf: payload.weekOf } },
    create: {
      organizationId,
      weekOf: payload.weekOf,
      payloadVersion: payload.version,
      payload: JSON.stringify(payload),
      sourcePeriods: JSON.stringify(payload.sourcePeriods),
      createdByUserId: userId,
    },
    update: {},
  });
  revalidatePath("/market-iq/briefing");
  redirect("/market-iq/briefing?saved=1");
}
