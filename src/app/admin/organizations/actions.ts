"use server";

// v0.21 — Server actions for /admin/organizations.
//
// Separated from the page component so the page stays a server-
// rendered read while the mutations are explicit POST endpoints
// (server actions are POST-only under the hood).
//
// Auth: each action re-checks isAdminUser even though the layout
// already gated /admin/*. Defense in depth — server actions are
// callable from any client-side fetch, and the layout's gate only
// runs on the page render path, not on direct action invocations.

import { revalidatePath } from "next/cache";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth/is-admin";

export interface CreateOrganizationResult {
  ok: boolean;
  /** New Clerk organization id on success. */
  clerkOrgId?: string;
  /** Human-readable error to surface in the form. Empty on success. */
  error?: string;
}

/** Create a new team/enterprise organization in Clerk. The webhook
 *  mirror at /api/clerk/webhook will populate the local Organization
 *  row; we don't write to Prisma here so the webhook stays the single
 *  source of truth for org rows.
 *
 *  Form fields:
 *    - name: organization display name (required, trimmed, 1-256 chars)
 *
 *  The calling admin becomes the initial Clerk-side admin of the new
 *  org (Clerk requires every org to have at least one admin at
 *  creation). To hand off, invite the customer's primary contact and
 *  optionally remove yourself once they've signed in. */
export async function createOrganization(
  _prevState: CreateOrganizationResult | null,
  formData: FormData
): Promise<CreateOrganizationResult> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) {
    // Use the same opacity the page layer uses — don't acknowledge
    // route existence to non-admins.
    return { ok: false, error: "Not found." };
  }

  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (name.length === 0) {
    return { ok: false, error: "Organization name is required." };
  }
  if (name.length > 256) {
    return { ok: false, error: "Organization name must be 256 characters or fewer." };
  }

  try {
    const client = await clerkClient();
    const org = await client.organizations.createOrganization({
      name,
      createdBy: userId,
      // Intentionally NOT setting privateMetadata.isPersonal — the
      // webhook handler leaves personalForUserId null for team orgs,
      // which is how /admin/organizations distinguishes them.
    });
    revalidatePath("/admin/organizations");
    return { ok: true, clerkOrgId: org.id };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error creating org.";
    return { ok: false, error: message };
  }
}

export interface InviteUserResult {
  ok: boolean;
  /** Email of the invited user on success — surface for confirmation. */
  email?: string;
  error?: string;
}

// Loose email check — server-side belt for the form's HTML5 type=email.
// We don't try to enforce RFC-correct addresses here; Clerk does its
// own validation and will reject malformed ones with a friendly error
// that we forward to the form.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Invite a user to an existing Clerk organization. The invitee
 *  receives a Clerk-templated email with a sign-up / sign-in link
 *  scoped to that org; clicking it lands them in the workspace once
 *  they complete OTP auth.
 *
 *  Form fields:
 *    - clerkOrgId: Clerk organization id (hidden field, comes from URL)
 *    - email: invitee email address
 *    - role: "org:admin" or "org:member" (Clerk's role slug format)
 */
export async function inviteUserToOrganization(
  _prevState: InviteUserResult | null,
  formData: FormData
): Promise<InviteUserResult> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) {
    return { ok: false, error: "Not found." };
  }

  const clerkOrgId = formData.get("clerkOrgId");
  const emailRaw = formData.get("email");
  const role = formData.get("role");

  if (typeof clerkOrgId !== "string" || clerkOrgId.length === 0) {
    return { ok: false, error: "Organization id is missing." };
  }
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (role !== "org:admin" && role !== "org:member") {
    return { ok: false, error: "Pick a role." };
  }

  try {
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: clerkOrgId,
      emailAddress: email,
      inviterUserId: userId,
      role,
    });
    // The membership row gets created when the invitee accepts +
    // signs in (webhook fires organizationMembership.created). Until
    // then the invitation is pending in Clerk; we don't mirror those
    // into the DB for this MVP.
    revalidatePath(`/admin/organizations`);
    return { ok: true, email };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error sending invitation.";
    return { ok: false, error: message };
  }
}
