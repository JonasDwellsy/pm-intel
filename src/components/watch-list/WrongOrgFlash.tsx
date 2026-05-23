"use client";

// v0.18 (PR #70, Phase 2) — Toast that appears on /watch-lists when
// the URL contains ?wrongOrg=<name>. Set by the redirect path in the
// detail-page server components when the user lands on a watch list
// URL that belongs to a different org they're a member of (typically
// because they just switched orgs while viewing the detail page).
//
// Why URL-query-param + local toast (not a global toast library)?
// Per Phase 2 discovery: there's no global toast library installed,
// and the existing convention is "each surface handles its own
// toast" (see WatchListEditor.tsx). This component matches that
// convention — mounted only on the /watch-lists page, reads the
// query param on mount, renders a styled toast, then strips the
// query param via router.replace so the toast doesn't re-fire on
// refresh or accidental URL sharing.
//
// Visual styling mirrors WatchListEditor's toast pattern: fixed
// position bottom-center, same colour ramp, same dismiss timing.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Auto-dismiss after this many ms. Matches WatchListEditor's toast
 *  timing. Slightly longer than the success-toast pattern because
 *  the message is longer + carries org context the user needs to
 *  read to understand the redirect. */
const DISMISS_AFTER_MS = 5000;

export function WrongOrgFlash(): React.ReactNode {
  const searchParams = useSearchParams();
  const router = useRouter();
  const wrongOrgParam = searchParams.get("wrongOrg");
  const [visible, setVisible] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (!wrongOrgParam) return;
    setOrgName(wrongOrgParam);
    setVisible(true);

    // Strip the query param so a refresh or share doesn't re-fire
    // the toast. router.replace is shallow — no server round-trip,
    // no scroll jump.
    router.replace("/watch-lists");

    const timeoutId = window.setTimeout(() => setVisible(false), DISMISS_AFTER_MS);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongOrgParam]);

  if (!visible || !orgName) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[80px] left-1/2 z-30 -translate-x-1/2 rounded-md bg-navy px-4 py-2.5 text-[13px] font-medium text-white shadow-lg max-w-[min(92vw,520px)]"
    >
      <span className="inline-flex items-center gap-2">
        <span aria-hidden>↩</span>
        <span>
          That Watch list isn&rsquo;t in your current organization. Switch
          to <span className="font-semibold">{orgName}</span> to view it.
        </span>
      </span>
    </div>
  );
}
