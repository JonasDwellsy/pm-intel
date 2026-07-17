import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { WatchListEditor, type EditorWatchList } from "@/components/watch-list/WatchListEditor";
import { listMarketOptions } from "@/lib/watch-list/editor-options";
import { getWatchListWithCrossOrgCheck } from "@/lib/watch-list/store";
import { canEditList } from "@/lib/watch-list/visibility";
import { getActiveOrgId } from "@/lib/auth/active-org";

// /watch-lists/[id]/edit — server component loads the existing watch
// list and the market options, then hands both to the client editor
// for in-place editing.
//
// v0.13 (PR #50) — middleware requires an authed Clerk session.
// v0.18 (PR #65) — organizationId-scoped. Requesting a watch list
// from a different org renders the standard 404 (no existence leak);
// soft fallback to /setup-workspace when the personal org isn't
// provisioned yet.
//
// Fix 3 (final-review) — getWatchListWithCrossOrgCheck's "found" status
// only proves canViewList passed (own list, or shared-in-org), which is
// the read gate, not the write gate. Now that sharing is reachable
// (Fix 1), a view-only shared viewer could otherwise open this editor.
// canEditList (own list, or legacy-owned-in-org) is the correct gate
// here, same predicate every mutation route already enforces
// server-side — this just keeps the UI from offering an editor the
// API would refuse to save from. notFound() mirrors the existing
// no-existence-leak pattern used for the other refusal branches.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit watch list",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditWatchListPage({ params }: PageProps) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) notFound();
  const organizationId = await getActiveOrgId();
  if (!organizationId) {
    redirect(`/setup-workspace?from=/watch-lists/${id}/edit`);
  }
  const [access, marketOptions] = await Promise.all([
    getWatchListWithCrossOrgCheck({
      watchListId: id,
      userId,
      activeOrganizationId: organizationId,
    }),
    listMarketOptions(),
  ]);
  if (access.status === "not_found") notFound();
  if (access.status === "wrong_org") {
    // Caller IS a member of the watch list's owning org but their
    // active session is on a different org. Bounce them to /watch-lists
    // with a flash so they know why they didn't land on the editor.
    redirect(
      `/watch-lists?wrongOrg=${encodeURIComponent(access.ownerOrgName)}`
    );
  }
  const record = access.record;
  // Fix 3 (final-review) — a view-only shared viewer passes canViewList
  // (that's what "found" already proved) but must not reach the editor.
  // notFound() rather than a redirect: consistent with how this page
  // already treats not_found/refused-access cases, and avoids a flash
  // that would confirm the list's existence to a viewer who can't edit it.
  if (!canEditList(record, { userId, organizationId })) {
    notFound();
  }
  const initial: EditorWatchList = {
    id: record.id,
    name: record.name,
    description: record.description ?? null,
    requiredCriteria: record.requiredCriteria,
    preferredCriteria: record.preferredCriteria,
    excludedCriteria: record.excludedCriteria,
  };
  return <WatchListEditor initial={initial} marketOptions={marketOptions} />;
}
