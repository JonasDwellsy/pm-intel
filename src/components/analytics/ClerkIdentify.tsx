"use client";

// v0.17 — Bridge from Clerk's session state into PostHog identity.
// v0.18 (PR #70, Phase 2) — extended to bind Clerk's active
// Organization as a PostHog "group" so we can run group-level
// analytics (watch lists per org, retention per org, etc.).
//
// Sits inside <ClerkProvider> (so useUser()/useOrganization() have
// session context) and inside <PostHogProvider> (so initAnalytics()
// has already run). Two parallel sync paths:
//
//   USER IDENTITY (v0.17 behaviour, unchanged)
//   - signed-in  → posthog.identify(userId)
//   - signed-out → posthog.reset()
//
//   ORG GROUP BINDING (v0.18, new)
//   - active org present  → posthog.group('organization', orgId, { name })
//   - no active org       → posthog.resetGroups()
//   - signed-out          → posthog.resetGroups() (alongside reset())
//                           so a fresh anonymous session doesn't
//                           inherit the previous user's org tag
//
// We DELIBERATELY pass NO email/name/phone to identify(). The org
// name IS passed to group() because group-level analytics is
// useless without it; org names are user-supplied at signup
// ("{firstName}'s Workspace" by default) and roughly equivalent to
// the user-supplied data already in Clerk's dashboard. See PRIVACY.md.
//
// The previousId / previousOrgId refs guard against re-firing the
// identify+group calls on every router transition — PostHog's
// API is idempotent but each call writes a $identify or $group_set
// event, which is noise we can avoid.

import { useEffect, useRef } from "react";
import { useUser, useOrganization } from "@clerk/nextjs";
import {
  identifyAnalyticsUser,
  resetAnalyticsUser,
  identifyAnalyticsOrg,
  resetAnalyticsOrg,
} from "@/lib/analytics";

export function ClerkIdentify(): null {
  const { isLoaded: userLoaded, isSignedIn, user } = useUser();
  const { isLoaded: orgLoaded, organization } = useOrganization();
  const previousUserId = useRef<string | null>(null);
  const previousOrgId = useRef<string | null>(null);

  // User identity sync. Same shape as v0.17.
  useEffect(() => {
    if (!userLoaded) return;

    const currentId = isSignedIn && user ? user.id : null;
    if (currentId === previousUserId.current) return;

    if (currentId) {
      identifyAnalyticsUser(currentId);
    } else if (previousUserId.current) {
      // Signing out — reset both user identity AND org group binding
      // (the previous user's org context shouldn't carry over to a
      // fresh anonymous session on the same browser).
      resetAnalyticsUser();
      resetAnalyticsOrg();
      previousOrgId.current = null;
    }
    previousUserId.current = currentId;
  }, [userLoaded, isSignedIn, user]);

  // Org group binding. Fires independently of user identity changes
  // — switching orgs (without signing out) re-binds the group without
  // re-identifying the user. Switching to Personal org or leaving an
  // org re-binds to the Personal org instead.
  //
  // useOrganization() returns null when the active session has no
  // active org claim. After Phase 1 + Phase 2, every signed-in user
  // has a Personal org and Clerk's <OrganizationSwitcher> can default
  // to it, so `organization` is null only in two transient states:
  //   1. Right after signup, before the user.created webhook
  //      provisions the Personal org.
  //   2. While the org switcher is mid-transition.
  // We don't fire group() with null/undefined values.
  useEffect(() => {
    if (!userLoaded || !orgLoaded) return;

    const currentOrgId = isSignedIn && organization ? organization.id : null;
    if (currentOrgId === previousOrgId.current) return;

    if (currentOrgId && organization) {
      identifyAnalyticsOrg(currentOrgId, organization.name);
    } else if (previousOrgId.current) {
      // User switched away from an org without a new one being
      // active (rare — e.g. leaving an org, or session reset).
      // Drop the group binding so events stop attributing to the
      // old org.
      resetAnalyticsOrg();
    }
    previousOrgId.current = currentOrgId;
  }, [userLoaded, orgLoaded, isSignedIn, organization]);

  return null;
}
