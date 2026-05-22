import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { listWatchListes } from "@/lib/watch-list/store";
import { WatchListIndex } from "@/components/watch-list/WatchListIndex";
import { TemplateGrid } from "@/components/watch-list/TemplateGrid";

// /watch-lists — landing for the watch-list workspace.
//
// v0.13 — Clerk auth foundation (PR #50). This route is protected
// by middleware; anonymous visitors get redirected to /sign-in
// before they ever reach the page component. Inside, we pull the
// authenticated user id from auth() and scope the list query so
// each user only sees their own saved watch lists. A signed-in user
// with zero saved boxes still gets the inline template picker (the
// PR #45 acquirer-positioning empty state) so they can clone a
// starter without an extra navigation.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watch Lists",
  robots: { index: false, follow: false },
};

export default async function WatchListesPage() {
  // userId is guaranteed by middleware — auth.protect() would have
  // bounced anonymous requests before they reached this handler.
  // The non-null assertion-equivalent (|| "" then bail) keeps TS
  // happy without a noisy throw.
  const { userId } = await auth();
  const rows = userId ? await listWatchListes(userId) : [];
  const isEmpty = rows.length === 0;

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-[1180px] px-6 py-12">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
              Watch List · v0.8
            </p>
            <h1 className="mt-2 text-[30px] font-semibold leading-[1.15] tracking-[-0.012em] text-navy sm:text-[36px]">
              Watch Lists
            </h1>
            <p className="mt-3 max-w-[60ch] text-[14.5px] text-foreground/80">
              {isEmpty
                ? "A watch list is a saved set of criteria for identifying property managers that match your acquisition or partnership thesis. Clone one of the starter templates below — they're fully editable, and you can preview matches before saving."
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
              Five named acquisition theses to choose from. Each clones into
              the editor with pre-populated criteria you can tweak before
              saving.
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
