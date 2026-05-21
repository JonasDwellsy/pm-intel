import type { Metadata } from "next";
import Link from "next/link";
import { listBuyBoxes } from "@/lib/buy-box/store";
import { BuyBoxList } from "@/components/buy-box/BuyBoxList";
import { TemplateGrid } from "@/components/buy-box/TemplateGrid";

// /buy-boxes — landing for the buy-box workspace.
//
// v0.12 acquirer-positioning update: when no saved buy boxes
// exist (anonymous user OR signed-in user with an empty list)
// the page renders the template picker inline as the empty
// state. Keeps the URL stable for sharing — no client-side
// redirect, no auth gate. The template picker / editor / preview
// path stay anonymous-friendly; only the save action requires
// auth.
//
// PR #45 doesn't introduce auth gating at this layer — the
// existing org-wide shared owner convention means everyone sees
// the same list today. Once per-user auth lands, the loader
// gets scoped to the authenticated user and the "no saved buy
// boxes yet" branch naturally covers logged-in fresh accounts.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buy Boxes",
  robots: { index: false, follow: false },
};

export default async function BuyBoxesPage() {
  const rows = await listBuyBoxes();
  const isEmpty = rows.length === 0;

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
              {isEmpty
                ? "A buy box is a saved set of criteria for identifying property managers that match your acquisition or partnership thesis. Clone one of the starter templates below — they're fully editable, and you can preview matches before saving."
                : "Saved sets of criteria that filter the operator universe down to the property managers that match your thesis. Each buy box pairs hard filters (required, excluded) with weighted preferences to produce a ranked fit score."}
            </p>
          </div>
          {!isEmpty && (
            <Link
              href="/buy-boxes/new"
              className="shrink-0 h-9 inline-flex items-center rounded-md bg-teal px-4 text-[13.5px] font-semibold text-white hover:bg-teal-700"
            >
              + New buy box
            </Link>
          )}
        </div>

        {isEmpty ? (
          <section className="mt-10">
            <p className="dq-eyebrow text-teal">Start from a template</p>
            <p className="mt-2 max-w-[60ch] text-[13.5px] text-foreground/75">
              Five named acquisition theses to choose from. Each clones into
              the editor with pre-populated criteria you can tweak before
              saving.
            </p>
            <div className="mt-6">
              <TemplateGrid />
            </div>
          </section>
        ) : (
          <BuyBoxList buyBoxes={rows} />
        )}
      </div>
    </div>
  );
}
