"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgId } from "@/lib/auth/active-org";
import { marketIqDevelopmentPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

const PREVIEW_PILOT_CLERK_ORG_ID = "preview_market_iq_cleveland_pilot";
const PREVIEW_PILOT_BRAND = {
  displayName: "Harborview Residential",
  logoUrl: null,
  primaryColor: "#173B57",
  accentColor: "#B96D3A",
  contactName: "Client Advisory Team",
  contactEmail: "advisory@example.com",
  contactPhone: null,
  websiteUrl: null,
};

function safeMarketIqReturnTo(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/market-iq/launch";
  if (!value.startsWith("/market-iq") || value.startsWith("//")) {
    return "/market-iq/launch";
  }
  return value;
}

/**
 * Explicitly connect a Clerk development user to the one isolated, entitled
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
      OR: [
        { allMarkets: true },
        { marketAccess: { some: { marketId: CLEVELAND_MARKET_ID } } },
      ],
      memberships: { some: {} },
      brandProfile: { isNot: null },
    },
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true },
  });

  if (eligibleOrganizations.length > 1) {
    redirect(
      `/setup-workspace?from=${encodeURIComponent(returnTo)}&activation=unavailable`
    );
  }

  const organizationId = await prisma.$transaction(async (tx) => {
    const organization = eligibleOrganizations[0] ?? await tx.organization.upsert({
      where: { clerkOrgId: PREVIEW_PILOT_CLERK_ORG_ID },
      create: {
        clerkOrgId: PREVIEW_PILOT_CLERK_ORG_ID,
        name: "Harborview Residential",
        slug: "harborview-residential-preview",
      },
      update: {},
      select: { id: true },
    });

    await tx.organizationProductAccess.upsert({
      where: {
        organizationId_productKey: {
          organizationId: organization.id,
          productKey: "market_iq",
        },
      },
      create: { organizationId: organization.id, productKey: "market_iq" },
      update: {},
    });
    await tx.organizationMarketAccess.upsert({
      where: {
        organizationId_marketId: {
          organizationId: organization.id,
          marketId: CLEVELAND_MARKET_ID,
        },
      },
      create: { organizationId: organization.id, marketId: CLEVELAND_MARKET_ID },
      update: {},
    });
    await tx.organizationBrandProfile.upsert({
      where: { organizationId: organization.id },
      create: {
        organizationId: organization.id,
        ...PREVIEW_PILOT_BRAND,
      },
      update: {},
    });

    await tx.organizationMembership.upsert({
      where: { userId_organizationId: { userId, organizationId: organization.id } },
      create: {
        clerkMembershipId: `preview_market_iq:${userId}:${organization.id}`,
        organizationId: organization.id,
        userId,
        role: "org:admin",
      },
      update: {
        clerkMembershipId: `preview_market_iq:${userId}:${organization.id}`,
        role: "org:admin",
      },
    });

    return organization.id;
  });

  if (!organizationId) redirect("/setup-workspace");

  redirect(returnTo);
}
