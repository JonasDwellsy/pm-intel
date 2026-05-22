import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { applyWatchList } from "@/lib/watch-list/apply";
import { getWatchList } from "@/lib/watch-list/store";
import { computeChangesForDetailView } from "@/lib/watch-list/changes";
import type { OperatorChange } from "@/lib/watch-list/change-detection";
import { prisma } from "@/lib/prisma";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";

// v0.16 — Detail view behind the "X operators moved since your last
// visit" banner on /watch-lists/[id]/results.
//
// Table-style: one row per change, grouped by operator. Operator
// name links back to the operator's scorecard page. The /changes
// route is read-only — it does NOT write a new WatchListView row
// (acknowledgement of the banner is owned by /results). It uses
// computeChangesForDetailView() to diff against the second-most-
// recent view, which is the same baseline the banner used.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watch List changes",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WatchListChangesPage({ params }: PageProps) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) notFound();
  const watchList = await getWatchList(id, userId);
  if (!watchList) notFound();

  const applied = await applyWatchList({
    id: watchList.id,
    name: watchList.name,
    description: watchList.description,
    requiredCriteria: watchList.requiredCriteria,
    preferredCriteria: watchList.preferredCriteria,
    excludedCriteria: watchList.excludedCriteria,
  });

  const matchedPmSlugs = applied.results.map((r) => r.pmSlug);
  const { changesByOperator, firstVisit } = await computeChangesForDetailView({
    userId,
    watchListId: watchList.id,
    matchedPmSlugs,
  });

  // Resolve display names + scorecard hrefs for every changed operator.
  // Tiny round-trip but keeps the page self-contained — applied.results
  // carries pmSlug + marketId but we want operator name + scorecard URL.
  const changedSlugs = Array.from(changesByOperator.keys());
  const operatorMeta = changedSlugs.length === 0
    ? []
    : await prisma.pM.findMany({
        where: { slug: { in: changedSlugs } },
        select: {
          slug: true,
          name: true,
          market: { select: { city: true, state: true } },
        },
      });
  const metaBySlug = new Map(
    operatorMeta.map((pm) => [
      pm.slug,
      {
        name: pm.name,
        href: `/property-managers/${stateCodeToSlug(pm.market.state)}/${citySlug(pm.market.city)}/${pm.slug}`,
      },
    ])
  );

  // Build a flat list of {operator, change} pairs for the table,
  // ordered alphabetically by operator name so the page is stable
  // across re-renders. Within an operator, changes appear in the
  // order diffSnapshots emits them (which is itself deterministic).
  type Row = {
    pmSlug: string;
    operatorName: string;
    operatorHref: string;
    change: OperatorChange;
  };
  const rows: Row[] = [];
  for (const [pmSlug, changes] of changesByOperator) {
    const meta = metaBySlug.get(pmSlug);
    if (!meta) continue;
    for (const change of changes) {
      rows.push({
        pmSlug,
        operatorName: meta.name,
        operatorHref: meta.href,
        change,
      });
    }
  }
  rows.sort((a, b) =>
    a.operatorName.localeCompare(b.operatorName)
  );

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-[1180px] px-6 py-10">
        <Link
          href={`/watch-lists/${watchList.id}/results`}
          className="text-[12.5px] font-medium text-teal hover:text-teal-700 hover:underline"
        >
          ← Back to results
        </Link>

        <header className="mt-4">
          <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
            Watch List Changes
          </p>
          <h1 className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.012em] text-navy sm:text-[34px]">
            {watchList.name}
          </h1>
          <p className="mt-3 text-[14.5px] text-foreground/80">
            {firstVisit
              ? "No baseline yet — this is your first visit. Changes will appear here after the next monthly data refresh."
              : rows.length === 0
                ? "No changes detected against your prior visit."
                : `${changesByOperator.size} operator${changesByOperator.size === 1 ? "" : "s"} moved · ${rows.length} change${rows.length === 1 ? "" : "s"} total.`}
          </p>
        </header>

        {rows.length > 0 && (
          <div className="mt-8 overflow-hidden rounded-md border border-grid bg-white">
            <table className="w-full text-left text-[13.5px]">
              <thead className="border-b border-grid bg-surface-soft">
                <tr>
                  <th className="px-4 py-2.5 font-semibold text-navy">
                    Operator
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-navy">
                    Change
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-navy">
                    Before → After
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={`${row.pmSlug}-${i}`}
                    className="border-b border-grid-soft last:border-b-0 hover:bg-surface-soft/60"
                  >
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={row.operatorHref}
                        className="font-medium text-teal hover:text-teal-700 hover:underline"
                      >
                        {row.operatorName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top text-foreground/85">
                      {describeChangeType(row.change)}
                    </td>
                    <td className="px-4 py-3 align-top text-foreground/70 dq-mono">
                      {describeBeforeAfter(row.change)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Human-readable change label — left column of the table. */
function describeChangeType(change: OperatorChange): string {
  switch (change.type) {
    case "star":
      return `Star · ${metricLabel(change.metric)}`;
    case "portfolio_band":
      return "Portfolio · confidence tier";
    case "portfolio_size":
      return "Portfolio · size";
    case "market_added":
      return "Market · entered";
    case "market_dropped":
      return "Market · exited";
    case "submarket_added":
      return "Submarket · entered";
    case "submarket_dropped":
      return "Submarket · exited";
    case "concession_transition":
      return change.direction === "appeared"
        ? "Concession use · appeared"
        : "Concession use · cleared";
    case "concession_shift":
      return "Concession use · shifted";
    case "eligibility_flip":
      return change.direction === "entered"
        ? "Eligibility · entered ranking"
        : "Eligibility · exited ranking";
  }
}

/** Before → After rendering — right column of the table. Uses the
 *  same en-dash separator the live scorecard's "vs cohort" lines
 *  use for visual continuity. */
function describeBeforeAfter(change: OperatorChange): string {
  switch (change.type) {
    case "star":
      return `${starLabel(change.before)} → ${starLabel(change.after)}`;
    case "portfolio_band":
      return `${change.before ?? "—"} → ${change.after ?? "—"}`;
    case "portfolio_size": {
      const sign = change.pctChange > 0 ? "+" : "";
      return `${change.before ?? "—"} → ${change.after ?? "—"} units (${sign}${(change.pctChange * 100).toFixed(0)}%)`;
    }
    case "market_added":
    case "market_dropped":
      return change.marketId;
    case "submarket_added":
    case "submarket_dropped":
      return change.submarketSlug;
    case "concession_transition":
      return change.direction === "appeared"
        ? `none → ${formatRate(change.after)}`
        : `${formatRate(change.before)} → none`;
    case "concession_shift": {
      const sign = change.deltaPp > 0 ? "+" : "";
      return `${formatRate(change.before)} → ${formatRate(change.after)} (${sign}${change.deltaPp.toFixed(1)}pp)`;
    }
    case "eligibility_flip":
      return change.direction === "entered" ? "below → ranked" : "ranked → below";
  }
}

function metricLabel(metric: string): string {
  switch (metric) {
    case "leaseUp":
      return "Lease-up Speed";
    case "tenancy":
      return "Tenant Retention";
    case "rentPerformance":
      return "Rent Performance";
    case "marketingDiscipline":
      return "Marketing Discipline";
    case "inventoryTransparency":
      return "Inventory Transparency";
    default:
      return metric;
  }
}

function starLabel(s: "gold" | "silver" | null): string {
  if (s === "gold") return "Gold ★";
  if (s === "silver") return "Silver ☆";
  return "no star";
}

function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}
