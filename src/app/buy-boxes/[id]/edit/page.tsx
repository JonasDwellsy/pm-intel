import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { BuyBoxEditor, type EditorBuyBox } from "@/components/buy-box/BuyBoxEditor";
import { listMarketOptions } from "@/lib/buy-box/editor-options";
import { getBuyBox } from "@/lib/buy-box/store";

// /buy-boxes/[id]/edit — server component loads the existing buy
// box and the market options, then hands both to the client editor
// for in-place editing.
//
// v0.13 — middleware already requires an authed Clerk session.
// We scope getBuyBox by the current userId so requesting another
// user's buy box renders the standard 404 page (no existence leak).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit buy box",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditBuyBoxPage({ params }: PageProps) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) notFound();
  const [record, marketOptions] = await Promise.all([
    getBuyBox(id, userId),
    listMarketOptions(),
  ]);
  if (!record) {
    notFound();
  }
  const initial: EditorBuyBox = {
    id: record.id,
    name: record.name,
    description: record.description ?? null,
    requiredCriteria: record.requiredCriteria,
    preferredCriteria: record.preferredCriteria,
    excludedCriteria: record.excludedCriteria,
  };
  return <BuyBoxEditor initial={initial} marketOptions={marketOptions} />;
}
