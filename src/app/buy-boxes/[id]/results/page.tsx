import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { applyBuyBox } from "@/lib/buy-box/apply";
import { getBuyBox } from "@/lib/buy-box/store";
import { projectResultsForView } from "@/lib/buy-box/results-view";
import { ResultsTable } from "@/components/buy-box/ResultsTable";
import { ReRunButton } from "@/components/buy-box/ReRunButton";
import { MethodologyDisclosure } from "@/components/buy-box/MethodologyDisclosure";

// /buy-boxes/[id]/results — v0.9 default view is operator-level
// rollup (one row per canonical operator with members aggregated).
// The page generates BOTH projections server-side and hands them
// to the client table, which switches via a localStorage-persisted
// "Operator view" / "Market view" toggle.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buy Box results",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BuyBoxResultsPage({ params }: PageProps) {
  const { id } = await params;
  const buyBox = await getBuyBox(id);
  if (!buyBox) notFound();

  const applied = await applyBuyBox({
    id: buyBox.id,
    name: buyBox.name,
    description: buyBox.description,
    requiredCriteria: buyBox.requiredCriteria,
    preferredCriteria: buyBox.preferredCriteria,
    excludedCriteria: buyBox.excludedCriteria,
  });

  const { marketRows, operatorRows, summary } = projectResultsForView({
    marketResults: applied.results,
    operatorResults: applied.operatorResults,
    buyBoxId: buyBox.id,
    totalCandidates: applied.totalCandidates,
    totalOperators: applied.totalOperators,
    matchedCount: applied.matchedCount,
    matchedOperatorCount: applied.matchedOperatorCount,
    generatedAt: applied.generatedAt,
  });

  // Headline counts/score range default to the operator-view numbers
  // since that's the view we show first; the table switches to
  // market numbers when the user toggles.
  const headlineMatched = summary.matchedOperatorCount;
  const headlineTotal = summary.totalOperators;
  const scoreMin = summary.scoreMinOperator;
  const scoreMax = summary.scoreMaxOperator;

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-[1280px] px-6 py-10">
        <Link
          href="/buy-boxes"
          className="text-[12.5px] font-medium text-teal hover:text-teal-700 hover:underline"
        >
          ← All buy boxes
        </Link>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
              Buy Box Results
            </p>
            <h1 className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.012em] text-navy sm:text-[34px]">
              {buyBox.name}
            </h1>
            <p className="mt-3 text-[14.5px] text-foreground/80">
              <span className="dq-mono text-navy tabular-nums">
                {headlineMatched}
              </span>{" "}
              of{" "}
              <span className="dq-mono text-navy tabular-nums">
                {headlineTotal}
              </span>{" "}
              operators match this buy box
              {scoreMin !== null && scoreMax !== null && (
                <>
                  {" · fit score range "}
                  <span className="dq-mono text-navy tabular-nums">
                    {scoreMin}–{scoreMax}
                  </span>
                </>
              )}
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              <span className="dq-mono tabular-nums">
                {summary.matchedCount}
              </span>{" "}
              market-level rows when broken out by PM-market pair (toggle
              below).
            </p>
            {buyBox.description && (
              <p className="mt-2 max-w-[80ch] text-[13.5px] text-foreground/70">
                {buyBox.description}
              </p>
            )}
            <div className="mt-3">
              <MethodologyDisclosure />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/buy-boxes/${buyBox.id}/edit`}
              className="h-9 inline-flex items-center rounded-md border border-grid bg-white px-3.5 text-[13px] font-medium text-navy hover:bg-surface-soft"
            >
              Edit Buy Box
            </Link>
            <ReRunButton />
          </div>
        </header>

        {headlineMatched === 0 && summary.matchedCount === 0 ? (
          <EmptyMatches buyBoxId={buyBox.id} />
        ) : (
          <ResultsTable
            operatorRows={operatorRows}
            marketRows={marketRows}
            required={buyBox.requiredCriteria}
            preferred={buyBox.preferredCriteria}
            excluded={buyBox.excludedCriteria}
          />
        )}

        <p className="mt-8 text-[11.5px] text-muted-foreground dq-mono">
          Generated {new Date(summary.generatedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function EmptyMatches({ buyBoxId }: { buyBoxId: string }) {
  return (
    <div className="mt-10 rounded-lg border border-dashed border-grid bg-white p-10 text-center">
      <h2 className="text-[18px] font-semibold text-navy">
        No operators match this buy box
      </h2>
      <p className="mt-2 mx-auto max-w-[48ch] text-[13.5px] text-foreground/70">
        Your required criteria may be too narrow, or an excluded rule may be
        vetoing the entire universe. Loosen a required criterion or remove an
        excluded rule to see results.
      </p>
      <Link
        href={`/buy-boxes/${buyBoxId}/edit`}
        className="mt-5 inline-flex h-9 items-center rounded-md bg-teal px-4 text-[13.5px] font-semibold text-white hover:bg-teal-700"
      >
        Edit Buy Box
      </Link>
    </div>
  );
}
