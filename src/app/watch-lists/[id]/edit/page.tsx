import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { WatchListEditor, type EditorWatchList } from "@/components/watch-list/WatchListEditor";
import { listMarketOptions } from "@/lib/watch-list/editor-options";
import { getWatchList } from "@/lib/watch-list/store";

// /watch-lists/[id]/edit — server component loads the existing buy
// box and the market options, then hands both to the client editor
// for in-place editing.
//
// v0.13 — middleware already requires an authed Clerk session.
// We scope getWatchList by the current userId so requesting another
// user's watch list renders the standard 404 page (no existence leak).

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
  const [record, marketOptions] = await Promise.all([
    getWatchList(id, userId),
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
