import type { Metadata } from "next";
import { loadAllMergeCandidates } from "@/lib/operators/merge-candidates.server";
import { MergeClusterCard } from "@/components/admin/MergeClusterCard";

// v0.23 — Admin → Merges. Surfaces within-market operator fragmentation
// (same operator recorded as multiple records) for human review. Every
// merge is a manual decision; approved merges are queued and applied
// offline by the pipeline (pool listings + recompute). Auth: gated by
// src/app/admin/layout.tsx.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Operator merges",
};

export default async function AdminMergesPage() {
  const markets = await loadAllMergeCandidates();
  const totalClusters = markets.reduce((s, m) => s + m.clusters.length, 0);

  return (
    <div className="mx-auto max-w-[900px] px-6 pb-16">
      <header className="mb-6 mt-6">
        <h1 className="text-3xl font-bold text-navy">Operator merges</h1>
        <p className="mt-2 max-w-[640px] text-[13.5px] text-grey-600">
          Candidate duplicates — the same operator recorded as several records
          in one market. Pick the surviving operator and confirm the canonical
          name, then <strong>Merge</strong>, or <strong>Not a merge</strong> to
          dismiss. Nothing merges live: decisions are queued and applied in the
          next data pipeline run, which pools the listings and recomputes
          metrics, stars, and cohorts. Exact-name matches are high confidence;
          &ldquo;Possible&rdquo; are near-matches (e.g. an agent name appended)
          worth a closer look.
        </p>
      </header>

      {totalClusters === 0 ? (
        <p className="rounded-md border border-dashed border-grid bg-surface-soft px-4 py-10 text-center text-[14px] text-grey-600">
          No pending merge candidates. Every same-name cluster has been decided.
        </p>
      ) : (
        <>
          <p className="mb-6 text-[12.5px] text-grey-500">
            {totalClusters} candidate{totalClusters === 1 ? "" : "s"} across{" "}
            {markets.length} market{markets.length === 1 ? "" : "s"}.
          </p>
          <div className="space-y-10">
            {markets.map((m) => (
              <section key={m.marketId}>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-grey-600">
                  {m.marketName}{" "}
                  <span className="text-grey-400">
                    ({m.clusters.length})
                  </span>
                </h2>
                <div className="space-y-4">
                  {m.clusters.map((cluster) => (
                    <MergeClusterCard
                      key={`${m.marketId}:${cluster.clusterKey}`}
                      marketId={m.marketId}
                      cluster={cluster}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
