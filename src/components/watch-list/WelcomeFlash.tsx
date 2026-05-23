"use client";

// v0.18 (PR #71, Phase 3) — Welcome toast for newly-joined org
// members. Mirrors the pattern WrongOrgFlash uses: read a query
// param (here, ?welcomeToOrg=<orgName>), render a styled toast,
// strip the param via router.replace so a refresh doesn't re-fire.
//
// Trigger flow:
//   1. Admin invites a user via OrganizationProfile.
//   2. User accepts → organizationInvitation.accepted webhook
//      fires → PendingWelcome row written to DB.
//   3. User lands on /watch-lists for the first time after joining.
//   4. Server component detects the PendingWelcome row matches
//      the active org, deletes the row, and redirects with
//      ?welcomeToOrg=<urlEncodedName>.
//   5. This component reads the param and renders the toast.
//
// The 6-second auto-dismiss is intentionally longer than the
// WrongOrgFlash (5s) because the welcome message has more useful
// content the user might want to read — explaining the sharing
// model for org-owned watch lists.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const DISMISS_AFTER_MS = 6000;

export function WelcomeFlash(): React.ReactNode {
  const searchParams = useSearchParams();
  const router = useRouter();
  const welcomeOrgParam = searchParams.get("welcomeToOrg");
  const [visible, setVisible] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (!welcomeOrgParam) return;
    setOrgName(welcomeOrgParam);
    setVisible(true);

    // Strip the query param so refresh / accidental share doesn't
    // re-fire the toast. router.replace is shallow.
    router.replace("/watch-lists");

    const timeoutId = window.setTimeout(() => setVisible(false), DISMISS_AFTER_MS);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welcomeOrgParam]);

  if (!visible || !orgName) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[80px] left-1/2 z-30 -translate-x-1/2 rounded-md bg-good px-4 py-3 text-[13px] font-medium text-white shadow-lg max-w-[min(92vw,560px)]"
    >
      <span className="inline-flex items-start gap-2.5">
        <span aria-hidden className="text-[15px] leading-tight">
          👋
        </span>
        <span className="leading-[1.4]">
          You&rsquo;ve joined <span className="font-semibold">{orgName}</span>.
          Watch lists created here are shared with all members.
        </span>
      </span>
    </div>
  );
}
