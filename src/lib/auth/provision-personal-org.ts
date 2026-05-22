// v0.18 (PR #65) — Phase 1 multi-tenancy: provision a Personal
// Organization for a Clerk user.
//
// Shared by two call paths:
//   1. user.created webhook (src/app/api/clerk/webhook/route.ts) —
//      provisions immediately after signup so most users never see
//      the workspace-setup page.
//   2. /setup-workspace page — soft-fallback retry when path #1
//      failed (Clerk API hiccup, plan misconfiguration, etc.).
//
// Both paths converge on this single function so the idempotency
// logic + the privateMetadata marker live in one place.
//
// Idempotency: the function checks Clerk for an existing personal
// org (via privateMetadata.isPersonal === true) BEFORE creating.
// Re-invocations after a successful first run are safe no-ops.
// This is important because the webhook may retry on transient
// failure, and the setup-workspace page polls.
//
// Source-of-truth pattern: the personal-org marker lives in Clerk's
// private_metadata, NOT in our DB. Reasons:
//   - Webhook deliveries are async; "did this user already get a
//     personal org" needs to be answerable from Clerk's side, before
//     our DB row exists.
//   - Our DB row gets the personalForUserId column via the
//     organization.created webhook handler reading the same
//     privateMetadata marker. Single source.

import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

export interface ProvisionResult {
  status: "created" | "already_exists" | "failed";
  clerkOrgId?: string;
  error?: string;
}

/** Create a Personal Organization for the given Clerk user, OR
 *  detect that one already exists and no-op. Returns the Clerk org
 *  id either way (or a "failed" status + error message on hard
 *  failure). */
export async function provisionPersonalOrgForUser(
  userId: string
): Promise<ProvisionResult> {
  const client = await clerkClient();

  // Idempotency check #1: does the user already have a Clerk
  // organization marked as their personal one? List their
  // memberships and look for our marker.
  try {
    const existingMemberships =
      await client.users.getOrganizationMembershipList({ userId });
    const personal = existingMemberships.data.find((m) => {
      const meta = m.organization.privateMetadata as
        | { isPersonal?: boolean }
        | undefined;
      return meta?.isPersonal === true;
    });
    if (personal) {
      return {
        status: "already_exists",
        clerkOrgId: personal.organization.id,
      };
    }
  } catch (err) {
    // If we can't read memberships, fall through to creation. Better
    // to risk a duplicate than to fail outright. Clerk's uniqueness
    // constraints will catch genuine duplicates server-side.
    console.warn(
      `[provision-personal-org] could not check existing memberships for ${userId}; proceeding to create`,
      err
    );
  }

  // Pull the user's name for the org display label. Fall back to
  // "Personal" when first/last names aren't set (email-OTP signups
  // often don't have names populated yet).
  let displayName = "Personal";
  try {
    const user = await client.users.getUser(userId);
    const first = user.firstName?.trim();
    if (first) {
      displayName = `${first}'s Workspace`;
    }
  } catch (err) {
    console.warn(
      `[provision-personal-org] could not fetch user ${userId} for naming; using "Personal"`,
      err
    );
  }

  try {
    const org = await client.organizations.createOrganization({
      name: displayName,
      createdBy: userId,
      // Marker: this org is the user's auto-provisioned personal
      // workspace. The organization.created webhook handler reads
      // these fields to set personalForUserId on our DB row.
      privateMetadata: {
        isPersonal: true,
        forUserId: userId,
      },
    });
    return { status: "created", clerkOrgId: org.id };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
