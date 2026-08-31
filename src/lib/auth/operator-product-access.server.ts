import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { cache } from "react";

import {
  dwellsyIqMemberHasProductAccess,
  dwellsyIqProductAccessMetadataUpdate,
  dwellsyIqProductInvitationMetadata,
} from "@/lib/auth/product-access";
import { resolveSiteUrl } from "@/lib/seo";

export const OPERATOR_IQ_PRODUCT_KEY = "operator-iq";

async function findOperatorIqMembership(organizationId: string, userId: string) {
  const client = await clerkClient();
  const memberships = await client.organizations.getOrganizationMembershipList({
    organizationId,
    userId: [userId],
    limit: 1,
  });
  return memberships.data[0] ?? null;
}

export const operatorIqMemberHasProductAccess = cache(async (
  organizationId: string,
  userId: string,
): Promise<boolean> => {
  const membership = await findOperatorIqMembership(organizationId, userId);
  return Boolean(membership && dwellsyIqMemberHasProductAccess(
    membership.publicMetadata,
    OPERATOR_IQ_PRODUCT_KEY,
  ));
});

export function operatorIqInvitationPublicMetadata() {
  return dwellsyIqProductInvitationMetadata(OPERATOR_IQ_PRODUCT_KEY);
}

export function operatorIqInvitationRedirectUrl() {
  return new URL("/watch-lists", resolveSiteUrl()).toString();
}

export async function loadOperatorIqProductMembers(organizationId: string) {
  const client = await clerkClient();
  const memberships = await client.organizations.getOrganizationMembershipList({
    organizationId,
    limit: 100,
    orderBy: "+first_name",
  });
  return memberships.data.map((membership) => {
    const user = membership.publicUserData;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
    return {
      userId: user?.userId ?? membership.id,
      name: name || user?.identifier || "Unnamed member",
      email: user?.identifier ?? "",
      role: membership.role,
      enabled: dwellsyIqMemberHasProductAccess(membership.publicMetadata, OPERATOR_IQ_PRODUCT_KEY),
    };
  });
}

export async function setOperatorIqMemberProductAccess(input: {
  organizationId: string;
  userId: string;
  enabled: boolean;
}) {
  const membership = await findOperatorIqMembership(input.organizationId, input.userId);
  if (!membership) throw new Error("The organization member could not be found.");
  const client = await clerkClient();
  await client.organizations.updateOrganizationMembershipMetadata({
    organizationId: input.organizationId,
    userId: input.userId,
    publicMetadata: dwellsyIqProductAccessMetadataUpdate(
      membership.publicMetadata,
      OPERATOR_IQ_PRODUCT_KEY,
      input.enabled,
    ),
  });
}
