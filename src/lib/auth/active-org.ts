// v0.18 (PR #65) — Multi-tenancy Phase 1.
//
// `getActiveOrgId()` is the single helper that every authorization-
// sensitive query routes through to resolve the user's active
// organization. Returns the Organization.id (our DB row id, NOT
// Clerk's org id) so downstream Prisma queries can filter directly.
//
// Phase 1 logic:
//   1. If the Clerk session carries an active orgId (set by the
//      org switcher in Phase 2+), look up our mirror row and
//      return its DB id.
//   2. Otherwise fall back to the user's auto-provisioned personal
//      org (one per Clerk user, created at signup via the
//      user.created webhook). Lookup is a single indexed read on
//      Organization.personalForUserId.
//   3. If neither path resolves (new user whose signup-time org
//      provisioning failed), return null. Callers redirect such
//      users to /setup-workspace which retries provisioning in the
//      background.
//
// SECURITY-CRITICAL: every Prisma query that reads or writes a
// user-scoped resource (currently only WatchList) MUST filter by
// the result of this helper. Any query that doesn't is a tenancy
// boundary violation.

import "server-only";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export interface ActiveOrgContext {
  /** Authenticated Clerk userId, or null when no session. */
  userId: string | null;
  /** Our Organization.id (DB row id), or null when the user has no
   *  resolvable org yet. Callers should treat null as "user needs
   *  workspace setup" — redirect to /setup-workspace. */
  organizationId: string | null;
  /** Clerk's org id, or null when no active session or no personal
   *  org exists yet. Surfaced for analytics/debugging; authz uses
   *  the DB-row organizationId above. */
  clerkOrgId: string | null;
  /** "org:admin" | "org:member" when the active session is in an
   *  org, otherwise null. Reserved for Phase 2 role-gated UI. */
  role: string | null;
}

/** Single source of truth for "which org is the request running in".
 *  Server-only — imports prisma. */
export async function getActiveOrgContext(): Promise<ActiveOrgContext> {
  const session = await auth();
  const userId = session.userId;
  if (!userId) {
    return { userId: null, organizationId: null, clerkOrgId: null, role: null };
  }

  // Path 1: Clerk session has an active org (set by the org
  // switcher in Phase 2+). Look up our mirror row by clerkOrgId.
  // We trust the Clerk-provided orgId because the session JWT is
  // signed by Clerk — middleware already verified it.
  if (session.orgId) {
    const row = await prisma.organization.findUnique({
      where: { clerkOrgId: session.orgId },
      select: { id: true },
    });
    if (row) {
      return {
        userId,
        organizationId: row.id,
        clerkOrgId: session.orgId,
        role: session.orgRole ?? null,
      };
    }
    // Session claims an orgId we don't mirror yet — could happen
    // during the race between Clerk's organization.created webhook
    // firing and our handler upserting the row. Fall through to
    // personal-org lookup so the request doesn't hard-fail.
  }

  // Path 2: fall back to the user's personal org. One @unique
  // indexed lookup.
  const personal = await prisma.organization.findUnique({
    where: { personalForUserId: userId },
    select: { id: true, clerkOrgId: true },
  });
  if (personal) {
    return {
      userId,
      organizationId: personal.id,
      clerkOrgId: personal.clerkOrgId,
      role: "org:admin", // user is always admin of their personal org
    };
  }

  // Path 3: no personal org yet. Soft-fallback — caller should
  // redirect to /setup-workspace which retries provisioning.
  return { userId, organizationId: null, clerkOrgId: null, role: null };
}

/** Convenience: just the organizationId. Use this when you don't
 *  need userId/role context. Returns null when the user has no
 *  resolvable org — callers should treat null as a redirect signal. */
export async function getActiveOrgId(): Promise<string | null> {
  const { organizationId } = await getActiveOrgContext();
  return organizationId;
}
