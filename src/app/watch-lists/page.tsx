import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { listWatchListes } from "@/lib/watch-list/store";
import { WatchListIndex } from "@/components/watch-list/WatchListIndex";
import { TemplateGrid } from "@/components/watch-list/TemplateGrid";
import { WrongOrgFlash } from "@/components/watch-list/WrongOrgFlash";
import { getActiveOrgContext } from "@/lib/auth/active-org";
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
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { organizationId } = await getActiveOrgContext();
  if (!organizationId) {
    redirect("/setup-workspace?from=/watch-lists");
  }

  // Pull the org row to determine whether it's the user's personal
  // org. Cheap indexed lookup; we already have organizationId.
  const orgRow = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, personalForUserId: true },
  });
  const isPersonalOrg = orgRow?.personalForUserId === userId;
  const teamOrgName = !isPersonalOrg ? orgRow?.name ?? null : null;

  const rows = await listWatchListes(organizationId);
  const isEmpty = rows.length === 0;

  return (
    <div className="bg-background">
      {/* v0.18 — toast that fires when the URL carries ?wrongOrg=<name>.
          Lives at top of the tree so it overlays regardless of scroll
          position. */}
      <WrongOrgFlash />

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
            <Link
              href="/watch-lists/new"
              className="shrink-0 h-9 inline-flex items-center rounded-md bg-teal px-4 text-[13.5px] font-semibold text-white hover:bg-teal-700"
            >
              + New watch list
            </Link>
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
          <WatchListIndex watchListes={rows} />
        )}
      </div>
    </div>
  );
}
