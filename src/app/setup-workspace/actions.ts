"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgId } from "@/lib/auth/active-org";
import { marketIqDevelopmentPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

function safeMarketIqReturnTo(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/market-iq/distribution";
  if (!value.startsWith("/market-iq") || value.startsWith("//")) {
    return "/market-iq/distribution";
  }
  return value;
}

/**
 * Explicitly connect a Clerk development user to the one seeded, entitled
 * Cleveland pilot organization. This action cannot run in production, cannot
 * run with a production Clerk key, and fails closed unless the isolated
 * Preview database contains exactly one eligible organization.
 */
export async function activateMarketIqDevelopmentWorkspace(
  formData: FormData
): Promise<void> {
  const returnTo = safeMarketIqReturnTo(formData.get("returnTo"));
  if (!marketIqDevelopmentPreviewEnabled()) redirect("/setup-workspace");

  const { userId } = await auth();
  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
  }

  const existingOrganizationId = await getActiveOrgId();
  if (existingOrganizationId) redirect(returnTo);

  const eligibleOrganizations = await prisma.organization.findMany({
    where: {
      productAccess: { some: { productKey: "market_iq" } },
      marketIqReports: {
        some: { marketId: CLEVELAND_MARKET_ID, status: "published" },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true },
  });

  if (eligibleOrganizations.length !== 1) {
    redirect(
      `/setup-workspace?from=${encodeURIComponent(returnTo)}&activation=unavailable`
    );
  }

  const organizationId = eligibleOrganizations[0].id;
  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    create: {
      clerkMembershipId: `preview_market_iq:${userId}:${organizationId}`,
      organizationId,
      userId,
      role: "org:admin",
    },
    update: {
      clerkMembershipId: `preview_market_iq:${userId}:${organizationId}`,
      role: "org:admin",
    },
  });

  redirect(returnTo);
}
