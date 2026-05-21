import type { Metadata } from "next";
import Link from "next/link";
import { listBuyBoxes } from "@/lib/buy-box/store";
import { BuyBoxList } from "@/components/buy-box/BuyBoxList";

// /buy-boxes — landing for the buy-box workspace.
// PR 2 replaces the PR 1 debug table with a card grid + actions
// (Edit / Duplicate / Delete / Apply), a real empty state, and a
// link into the editor.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buy Boxes",
  robots: { index: false, follow: false },
};

export default async function BuyBoxesPage() {
  const rows = await listBuyBoxes();

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-[1180px] px-6 py-12">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
              Buy Box · v0.8
            </p>
            <h1 className="mt-2 text-[30px] font-semibold leading-[1.15] tracking-[-0.012em] text-navy sm:text-[36px]">
              Buy Boxes
            </h1>
            <p className="mt-3 max-w-[60ch] text-[14.5px] text-foreground/80">
              Saved sets of criteria that filter the operator universe down to the
              property managers that match your thesis. Each buy box pairs hard
              filters (required, excluded) with weighted preferences to produce a
              ranked fit score.
            </p>
          </div>
          {rows.length > 0 && (
            <Link
              href="/buy-boxes/new"
              className="shrink-0 h-9 inline-flex items-center rounded-md bg-teal px-4 text-[13.5px] font-semibold text-white hover:bg-teal-700"
            >
              + New buy box
            </Link>
          )}
        </div>

        <BuyBoxList buyBoxes={rows} />
      </div>
    </div>
  );
}
