import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { WatchListEditor, type EditorWatchList } from "@/components/watch-list/WatchListEditor";
import { listMarketOptions } from "@/lib/watch-list/editor-options";
import { getWatchList } from "@/lib/watch-list/store";
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
  const [record, marketOptions] = await Promise.all([
    getWatchList(id, organizationId),
    listMarketOptions(),
  ]);
  if (!record) {
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
