"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { deliverMarketIqBriefingEmail } from "@/lib/market-iq/briefing-email.server";
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

function primaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  return user?.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress
    ?? user?.emailAddresses[0]?.emailAddress
    ?? null;
}

export async function updateMarketIqBriefingEmailPreference(formData: FormData): Promise<void> {
  if (!marketIqPreviewEnabled()) throw new Error("Market IQ is unavailable.");
  const [{ userId, organizationId }, access, user] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
    currentUser(),
  ]);
  const email = primaryEmail(user);
  if (!userId || !organizationId || !access.hasProduct || !email) throw new Error("A signed-in Market IQ email is required.");
  const enabled = formData.get("enabled") === "yes";
  await prisma.marketIqBriefingEmailPreference.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    create: { organizationId, userId, recipientEmail: email, enabled, enabledAt: enabled ? new Date() : null },
    update: { recipientEmail: email, enabled, enabledAt: enabled ? new Date() : null },
  });
  revalidatePath("/market-iq/briefing");
  redirect(`/market-iq/briefing?preference=${enabled ? "enabled" : "disabled"}`);
}

export async function sendLatestMarketIqBriefingToMe(): Promise<void> {
  if (!marketIqPreviewEnabled()) throw new Error("Market IQ is unavailable.");
  const [{ userId, organizationId }, access, user] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
    currentUser(),
  ]);
  const email = primaryEmail(user);
  if (!userId || !organizationId || !access.hasProduct || !email) throw new Error("Market IQ briefing access is unavailable.");
  const preference = await prisma.marketIqBriefingEmailPreference.updateMany({
    where: { organizationId, userId, enabled: true },
    data: { recipientEmail: email },
  });
  if (!preference.count) redirect("/market-iq/briefing?delivery=not_enabled");
  const snapshot = await prisma.marketIqBriefingSnapshot.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!snapshot) redirect("/market-iq/briefing?delivery=no_archive");
  const result = await deliverMarketIqBriefingEmail({
    organizationId,
    userId,
    snapshotId: snapshot.id,
    recipientName: user?.firstName,
  });
  revalidatePath("/market-iq/briefing");
  redirect(`/market-iq/briefing?delivery=${result.status}`);
}
