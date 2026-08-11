"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";
import { buildLaunchBriefingSnapshot } from "@/lib/portfolio-iq/launch-briefing.server";
import { parsePilotReview } from "@/lib/portfolio-iq/pilot-acceptance";

async function authorizedPortfolio(portfolioId: string, userId: string, organizationId: string) {
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({
    where: { id: portfolioId },
    include: { assets: { orderBy: { sortOrder: "asc" } } },
  });
  if (!portfolio || (portfolio.organizationId !== organizationId && !(portfolio.isSynthetic && isAdminUser(userId)))) {
    throw new Error("Portfolio not found.");
  }
  return portfolio;
}

export async function recordPilotAcceptanceReview(formData: FormData): Promise<void> {
  const { userId, organizationId } = await getActiveOrgContext();
  const portfolioId = String(formData.get("portfolioId") ?? "");
  const objectId = String(formData.get("objectId") ?? "");
  const parsed = parsePilotReview({
    objectType: formData.get("objectType"),
    response: formData.get("response"),
    note: formData.get("note"),
  });
  if (!userId || !organizationId || !portfolioId || !objectId || !parsed) throw new Error("Review response is incomplete.");

  const portfolio = await authorizedPortfolio(portfolioId, userId, organizationId);
  let assetId: string | null = null;
  if (parsed.objectType === "property" || parsed.objectType === "operator") {
    const asset = portfolio.assets.find((candidate) => candidate.id === objectId);
    if (!asset) throw new Error("Property not found.");
    assetId = asset.id;
  } else {
    const signal = await prisma.portfolioIqSignal.findFirst({ where: { id: objectId, portfolioId }, select: { id: true, assetId: true } });
    if (!signal) throw new Error("Finding not found.");
    assetId = signal.assetId;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.portfolioIqPilotAcceptance.upsert({
      where: { portfolioId },
      create: { portfolioId, organizationId: portfolio.organizationId, status: "in_progress", sessionStartedAt: now },
      update: {},
    });
    await tx.portfolioIqPilotReview.upsert({
      where: { portfolioId_objectType_objectId: { portfolioId, objectType: parsed.objectType, objectId } },
      create: { portfolioId, organizationId: portfolio.organizationId, objectType: parsed.objectType, objectId, response: parsed.response, note: parsed.note, reviewedBy: userId, reviewedAt: now },
      update: { response: parsed.response, note: parsed.note, reviewedBy: userId, reviewedAt: now },
    });
    if (parsed.response === "incorrect") {
      await tx.portfolioIqPilotCorrection.upsert({
        where: { portfolioId_objectType_objectId: { portfolioId, objectType: parsed.objectType, objectId } },
        create: { portfolioId, organizationId: portfolio.organizationId, assetId, objectType: parsed.objectType, objectId, issue: parsed.note as string, status: "open", assignedLane: "customer_success", createdBy: userId },
        update: { assetId, issue: parsed.note as string, status: "open", assignedLane: "customer_success", completedAt: null },
      });
    } else {
      await tx.portfolioIqPilotCorrection.updateMany({
        where: { portfolioId, objectType: parsed.objectType, objectId, status: { not: "complete" } },
        data: { status: "complete", completedAt: now },
      });
    }
  });

  revalidatePath("/portfolio-iq/acceptance");
  revalidatePath("/admin/portfolio-activation");
}

export async function finalizePilotAcceptance(formData: FormData): Promise<void> {
  const { userId, organizationId } = await getActiveOrgContext();
  const portfolioId = String(formData.get("portfolioId") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 1_500) || null;
  if (!userId || !organizationId || !portfolioId) throw new Error("Workspace not ready.");
  const [portfolio, snapshot] = await Promise.all([
    authorizedPortfolio(portfolioId, userId, organizationId),
    buildLaunchBriefingSnapshot({ organizationId, userId }),
  ]);
  if (!snapshot || snapshot.portfolio.id !== portfolioId) throw new Error("Launch baseline not found.");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.portfolioIqPilotAcceptance.upsert({
      where: { portfolioId },
      create: { portfolioId, organizationId: portfolio.organizationId, status: "accepted", sessionStartedAt: now, acceptedAt: now, acceptedBy: userId, note },
      update: { status: "accepted", acceptedAt: now, acceptedBy: userId, note },
    });
    await tx.portfolioIqLaunchBriefing.upsert({
      where: { portfolioId },
      create: { portfolioId, status: "approved", snapshot: JSON.stringify(snapshot), generatedAt: new Date(snapshot.generatedAt), approvedAt: now, approvedBy: userId },
      update: { status: "approved", snapshot: JSON.stringify(snapshot), generatedAt: new Date(snapshot.generatedAt), approvedAt: now, approvedBy: userId },
    });
    await tx.portfolioIqPortfolio.update({ where: { id: portfolioId }, data: { status: "ready" } });
    await tx.portfolioIqMonitoringSnapshot.upsert({
      where: { portfolioId_periodKey: { portfolioId, periodKey: "launch-baseline" } },
      create: { portfolioId, periodKey: "launch-baseline", snapshot: JSON.stringify(snapshot), sourceAvailableThrough: snapshot.sourceAvailableThrough, capturedAt: now, capturedBy: userId },
      update: { snapshot: JSON.stringify(snapshot), sourceAvailableThrough: snapshot.sourceAvailableThrough, capturedAt: now, capturedBy: userId },
    });
    await tx.portfolioIqDigestPreference.upsert({
      where: { portfolioId_userId: { portfolioId, userId } },
      create: { portfolioId, organizationId: portfolio.organizationId, userId, enabled: true, cadence: "weekly" },
      update: { enabled: true, cadence: "weekly" },
    });
    await tx.portfolioIqOwnerWatchItem.createMany({
      data: portfolio.assets.map((asset) => ({ portfolioId, organizationId: portfolio.organizationId, objectType: "property", objectKey: asset.id, label: asset.name, href: `/portfolio-iq/properties/${asset.slug}`, pinnedBy: userId })),
      skipDuplicates: true,
    });
    await tx.portfolioIqOnboardingRequest.updateMany({
      where: { organizationId: portfolio.organizationId },
      data: { portfolioId, status: "complete", completedAt: now },
    });
  });

  for (const path of ["/today", "/portfolio-iq", "/portfolio-iq/acceptance", "/portfolio-iq/launch-briefing", "/portfolio-iq/reports", "/portfolio-iq/watchlists", "/onboarding", "/admin/portfolio-activation"]) {
    revalidatePath(path);
  }
  redirect("/today?launch=complete");
}
