"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  operatorIqInvitationPublicMetadata,
  operatorIqInvitationRedirectUrl,
  setOperatorIqMemberProductAccess,
} from "@/lib/auth/operator-product-access.server";

export async function inviteOperatorIqOrganizationMemberAction(formData: FormData) {
  const session = await auth();
  if (!session.userId || !session.orgId || session.orgRole !== "org:admin") throw new Error("Organization administrator access is required.");
  const emailAddress = z.string().email().parse(String(formData.get("email") ?? "").trim());
  const role = z.enum(["org:member", "org:admin"]).parse(String(formData.get("role") ?? "org:member"));
  const client = await clerkClient();
  await client.organizations.createOrganizationInvitation({
    organizationId: session.orgId,
    inviterUserId: session.userId,
    emailAddress,
    role,
    publicMetadata: operatorIqInvitationPublicMetadata(),
    redirectUrl: operatorIqInvitationRedirectUrl(),
  });
  revalidatePath("/organization");
  redirect("/organization?invited=1");
}

export async function updateOperatorIqMemberProductAccessAction(formData: FormData) {
  const session = await auth();
  if (!session.userId || !session.orgId || session.orgRole !== "org:admin") throw new Error("Organization administrator access is required.");
  const userId = z.string().min(1).max(255).parse(String(formData.get("userId") ?? ""));
  const enabled = z.enum(["true", "false"]).parse(String(formData.get("enabled") ?? "")) === "true";
  if (!enabled && userId === session.userId) throw new Error("You cannot remove your own Dwellsy IQ Markets access.");
  await setOperatorIqMemberProductAccess({ organizationId: session.orgId, userId, enabled });
  revalidatePath("/organization");
}
