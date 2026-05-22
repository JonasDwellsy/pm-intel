"use client";

// v0.17 — Bridge from Clerk's session state into PostHog identity.
//
// Sits inside <ClerkProvider> (so useUser() has session context) and
// inside <PostHogProvider> (so initAnalytics() has already run). On
// every render where Clerk's session is loaded:
//
//   - signed-in  → posthog.identify(userId). Stitches all prior
//     anonymous events on this browser to the Clerk userId.
//   - signed-out → posthog.reset(). Clears the previous identity so
//     a shared browser doesn't carry one user's distinct_id into the
//     next visitor's session.
//
// We DELIBERATELY do not pass email / name / phone to identify().
// Only the opaque Clerk userId is ever sent. See PRIVACY.md.
//
// The `previousId` ref guards against double-firing identify() on
// every router transition — PostHog's identify() is idempotent but
// each call writes a $identify event, which is noise we can avoid.

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { identifyAnalyticsUser, resetAnalyticsUser } from "@/lib/analytics";

export function ClerkIdentify(): null {
  const { isLoaded, isSignedIn, user } = useUser();
  const previousId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return; // wait for Clerk to resolve before deciding

    const currentId = isSignedIn && user ? user.id : null;
    if (currentId === previousId.current) return; // no change → skip

    if (currentId) {
      identifyAnalyticsUser(currentId);
    } else if (previousId.current) {
      // Only reset if we previously had an identity; avoids resetting
      // on cold load when the user was never signed in to begin with.
      resetAnalyticsUser();
    }
    previousId.current = currentId;
  }, [isLoaded, isSignedIn, user]);

  return null;
}
