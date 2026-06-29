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
import { isClerkAPIResponseError } from "@clerk/shared/error";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";

/** Extract a human-readable error message from a Clerk SDK throw.
 *  Clerk's API returns a structured { errors: [{ code, message, long_message }] }
 *  body; the SDK wraps it as ClerkAPIResponseError. Plain Error.message
 *  on those is just the HTTP status text ("Bad Request"), which is
 *  useless in the admin UI — pull the first error's longMessage if we
 *  have it, message otherwise. Falls back to err.message for non-Clerk
 *  errors (network, etc). */
function describeError(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    const first = err.errors[0];
    if (first) {
      return first.longMessage ?? first.message ?? "Clerk rejected the request.";
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

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
    return { ok: false, error: describeError(err) };
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
      role,
      // NOTE: inviterUserId intentionally omitted. With it, Clerk runs
      // a member-permission check on the inviter — fine for in-app
      // invites from someone who's already in the org, but a 403 trap
      // for admin-panel invites (the admin probably isn't a member of
      // every customer org). Omitting it treats this as an admin/SDK-
      // initiated invitation, which is the correct semantic here. The
      // "invited by" field in Clerk's UI ends up empty for these.
    });
    // The membership row gets created when the invitee accepts +
    // signs in (webhook fires organizationMembership.created). Until
    // then the invitation is pending in Clerk; we don't mirror those
    // into the DB for this MVP.
    revalidatePath(`/admin/organizations`);
    return { ok: true, email };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

export interface SetMarketAccessResult {
  ok: boolean;
  /** "all" or the number of markets granted, for the confirmation line. */
  summary?: string;
  error?: string;
}

/** Provision which markets an organization can access. Pure Prisma —
 *  market entitlements live entirely in our DB, never in Clerk.
 *
 *  Form fields:
 *    - orgId: local Organization id (hidden)
 *    - allMarkets: "on" when the "all current + future markets" toggle
 *      is checked; absent otherwise
 *    - marketIds: zero or more Market ids (checkbox group). Ignored when
 *      allMarkets is on.
 *
 *  Semantics: sets Organization.allMarkets, then REPLACES the org's
 *  OrganizationMarketAccess rows with the submitted set (delete-all +
 *  recreate inside a transaction so the grant set is exactly what the
 *  admin saw). Submitted ids are validated against real markets so a
 *  stale form can't write garbage grants. */
export async function setOrganizationMarketAccess(
  _prevState: SetMarketAccessResult | null,
  formData: FormData
): Promise<SetMarketAccessResult> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) {
    return { ok: false, error: "Not found." };
  }

  const orgId = formData.get("orgId");
  if (typeof orgId !== "string" || orgId.length === 0) {
    return { ok: false, error: "Organization id is missing." };
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, personalForUserId: true },
  });
  if (!org || org.personalForUserId !== null) {
    // Mirror the page-layer opacity: personal orgs aren't managed here.
    return { ok: false, error: "Not found." };
  }

  const allMarkets = formData.get("allMarkets") === "on";

  // Validate submitted ids against real markets so a stale form (e.g. a
  // market that was removed) can't persist a dangling grant.
  const submitted = formData
    .getAll("marketIds")
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const validIds = new Set(
    (
      await prisma.market.findMany({
        where: { id: { in: submitted } },
        select: { id: true },
      })
    ).map((m) => m.id)
  );
  const marketIds = [...new Set(submitted.filter((id) => validIds.has(id)))];

  try {
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: orgId },
        data: { allMarkets },
      }),
      prisma.organizationMarketAccess.deleteMany({
        where: { organizationId: orgId },
      }),
      // Only persist explicit grants when NOT all-markets — the flag
      // alone is the entitlement in that case, and stored rows would be
      // dead weight that drift from "all".
      ...(allMarkets || marketIds.length === 0
        ? []
        : [
            prisma.organizationMarketAccess.createMany({
              data: marketIds.map((marketId) => ({ organizationId: orgId, marketId })),
            }),
          ]),
    ]);
    revalidatePath(`/admin/organizations/${orgId}`);
    revalidatePath(`/admin/organizations`);
    return {
      ok: true,
      summary: allMarkets ? "all markets" : `${marketIds.length} markets`,
    };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}
