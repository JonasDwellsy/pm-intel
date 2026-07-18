import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { listWatchListes, listMembers } from "@/lib/watch-list/store";
import { WatchListIndex } from "@/components/watch-list/WatchListIndex";
import { NewPickListButton } from "@/components/watch-list/NewPickListButton";
import { TemplateGrid } from "@/components/watch-list/TemplateGrid";
import { WrongOrgFlash } from "@/components/watch-list/WrongOrgFlash";
import { WelcomeFlash } from "@/components/watch-list/WelcomeFlash";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { viewerHasAnyMarketAccess } from "@/lib/auth/market-entitlements.server";
import { NoMarketsNotice } from "@/components/entitlements/NoMarketsNotice";
import { recordUsageEvent } from "@/lib/usage/record";
import { prisma } from "@/lib/prisma";

// /watch-lists — landing for the watch-list workspace.
//
// v0.13 (PR #50) — Clerk auth foundation. Middleware redirects
// anonymous visitors to /sign-in before they reach this component.
//
// v0.18 (PR #65, Phase 1) — Multi-tenancy. listWatchListes is scoped
// by the caller's active organizationId.
//
// v0.18 (PR #70, Phase 2) — Adds:
//   * <WrongOrgFlash> client toast that fires when redirected here
//     from a watch-list detail page in a different org.
//   * Conditional active-org name in the page header — only shown
//     when the caller's active org is NOT their personal workspace
//     (per Phase 2 design decision: Personal-org-only users see the
//     original clean copy; the disambiguation matters specifically
//     when there are multiple orgs).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watch Lists",
  robots: { index: false, follow: false },
};

export default async function WatchListesPage() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");
  const { organizationId } = await getActiveOrgContext();
  if (!organizationId) {
    redirect("/setup-workspace?from=/watch-lists");
  }

  // v0.24 — first-party usage capture (non-blocking). userId is
  // guaranteed here (anonymous redirected above). orgId is the Clerk org
  // id, consistent with every other capture site.
  recordUsageEvent({ userId, orgId, eventName: "watch_list_view" });

  // Entitlement gate: an org with zero market grants (a client member
  // invited before markets are provisioned, or a stray personal
  // workspace) can technically reach this auth-protected page, but the
  // builder + saved lists are useless — everything scopes to entitled
  // markets and comes back empty. Show a clear "no market access" state
  // instead of a functional-looking-but-empty shell. Admins / allMarkets
  // orgs bypass (resolveViewerEntitlement → ALL_MARKETS).
  if (!(await viewerHasAnyMarketAccess())) {
    return <NoMarketsNotice />;
  }

  // Pull the org row to determine whether it's the user's personal
  // org. Cheap indexed lookup; we already have organizationId.
  const orgRow = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, personalForUserId: true },
  });
  const isPersonalOrg = orgRow?.personalForUserId === userId;
  const teamOrgName = !isPersonalOrg ? orgRow?.name ?? null : null;

  // v0.18 (PR #71, Phase 3) — Welcome toast for newly-joined org
  // members. Written by the organizationInvitation.accepted webhook
  // (see src/app/api/clerk/webhook/route.ts). One-shot semantics:
  // present means "deliver welcome next time this user is active
  // here"; we delete inline and redirect with ?welcomeToOrg=<name>
  // so the WelcomeFlash client component picks it up.
  //
  // Only fires when the active org matches the pending welcome's
  // org (so a user with pending welcomes in multiple orgs sees them
  // one-at-a-time as they switch in). The redirect strips any
  // pre-existing query params except the new welcomeToOrg one —
  // intentional, since landing on /watch-lists with both
  // ?wrongOrg= and ?welcomeToOrg= would render two toasts and
  // the welcome takes priority.
  const pendingWelcome = await prisma.pendingWelcome.findUnique({
    where: {
      userId_organizationId: { userId, organizationId },
    },
    select: { id: true },
  });
  if (pendingWelcome && orgRow) {
    await prisma.pendingWelcome.delete({ where: { id: pendingWelcome.id } });
    redirect(
      `/watch-lists?welcomeToOrg=${encodeURIComponent(orgRow.name)}`
    );
  }

  const rows = await listWatchListes(userId, organizationId);
  const isEmpty = rows.length === 0;

  // v0.28 (Task 7 Step 1) — pin counts for EVERY row. The index card's
  // pinned/smart/hybrid label
  // and body now derive from content (criteria-presence + pin count,
  // see deriveListKind in @/lib/watch-list/kind), so a smart list with
  // pins attached needs its real count too — smart lists with none
  // simply come back 0. `rows` is already scoped by listWatchListes'
  // canViewList filter, so calling the no-authz listMembers() per row
  // here is safe (same reasoning as results/page.tsx's own
  // listMembers call).
  const pinnedCountEntries = await Promise.all(
    rows.map(async (r) => [r.id, (await listMembers(r.id)).length] as const)
  );
  const pinnedCounts: Record<string, number> = Object.fromEntries(
    pinnedCountEntries
  );

  return (
    <div className="bg-background">
      {/* v0.18 — Toasts. Both render conditionally based on URL
          query params; whichever fired its redirect on this load
          wins. */}
      <WrongOrgFlash />
      <WelcomeFlash />

      <div className="mx-auto max-w-[1180px] px-6 py-12">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
              {teamOrgName
                ? `Watch List · ${teamOrgName}`
                : "Watch List · v0.8"}
            </p>
            <h1 className="mt-2 text-[30px] font-semibold leading-[1.15] tracking-[-0.012em] text-navy sm:text-[36px]">
              Watch Lists
            </h1>
            <p className="mt-3 max-w-[60ch] text-[14.5px] text-foreground/80">
              {isEmpty
                ? teamOrgName
                  ? `A watch list is a saved set of criteria for tracking property managers that match a thesis. Clone one of the starter templates below — they're fully editable, and the result will be saved in ${teamOrgName}.`
                  : "A watch list is a saved set of criteria for tracking property managers that match a thesis. Clone one of the starter templates below — they're fully editable, and you can preview matches before saving."
                : "Saved sets of criteria that filter the operator universe down to the property managers that match your thesis. Each watch list pairs hard filters (required, excluded) with weighted preferences to produce a ranked fit score."}
            </p>
          </div>
          {!isEmpty && (
            <div className="flex shrink-0 items-center gap-2">
              {/* v0.28 (Task 7 Step 1) — "New pick list" alongside the
                  existing "New watch list" entry. A pick list has no
                  criteria to configure, so this skips the template
                  picker/editor entirely: name it, create it, land
                  straight on its (empty) results page where companies
                  get pinned in from any scorecard/market/search row. */}
              <NewPickListButton />
              <Link
                href="/watch-lists/new"
                className="h-9 inline-flex items-center rounded-md bg-teal px-4 text-[13.5px] font-semibold text-white hover:bg-teal-700"
              >
                + New watch list
              </Link>
            </div>
          )}
        </div>

        {isEmpty ? (
          <section className="mt-10">
            <p className="dq-eyebrow text-teal">Start from a template</p>
            <p className="mt-2 max-w-[60ch] text-[13.5px] text-foreground/75">
              Five named templates to choose from. Each clones into the editor
              with pre-populated criteria you can tweak before saving.
            </p>
            <div className="mt-6">
              <TemplateGrid />
            </div>
          </section>
        ) : (
          <WatchListIndex watchListes={rows} pinnedCounts={pinnedCounts} />
        )}
      </div>
    </div>
  );
}
