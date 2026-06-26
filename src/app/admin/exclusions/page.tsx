// v0.6.4 Patch 9 (Phase A) — Admin → Exclusions.
//
// Read-only visibility into the curated hard-exclusion denylist
// (src/data/excluded_operators.json). Operators on this list are dropped
// at the pipeline's row stage — no operator formed, no scorecard, not
// searchable, not counted — regardless of their source company_type.
// It's the safety net for data-source artifacts (marketing / listing
// software) the source classifier mislabels as a real operator.
//
// This page is the human-visible window into that list. Editing is still
// a code change (edit the JSON + re-run the pipeline) — by design, since
// excluding an operator is a high-consequence, reviewable action; the
// admin surface is for awareness, not one-click removal.
//
// Auth: gated by src/app/admin/layout.tsx.

import type { Metadata } from "next";
import excludedOperators from "@/data/excluded_operators.json";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // robots noindex inherited from src/app/admin/layout.tsx
  title: "Admin · Exclusions",
};

interface ExcludedEntry {
  normalizedName: string;
  displayName?: string;
  reason?: string;
  addedOn?: string;
}

export default function AdminExclusionsPage() {
  const entries = (excludedOperators as { excluded?: ExcludedEntry[] })
    .excluded ?? [];

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-12">
      <header className="mb-6 mt-6">
        <h1 className="text-3xl font-bold text-navy">Exclusions</h1>
        <p className="text-[14px] text-grey-600 mt-2 leading-relaxed max-w-[720px]">
          Curated hard-exclusion denylist. Operators here are dropped at the
          data-pipeline stage &mdash; no scorecard, not searchable, not
          ranked, not counted &mdash; regardless of the company type the
          source data assigns them. This is the safety net for data-source
          artifacts (marketing / listing-syndication software) that the
          source classifier mislabels as a real operator.
        </p>
        <p className="text-[13px] text-grey-500 mt-2 leading-relaxed max-w-[720px]">
          Companies typed{" "}
          <code className="text-[12px] bg-surface-soft px-1 py-0.5 rounded border border-grid">
            Property Management Software
          </code>{" "}
          or{" "}
          <code className="text-[12px] bg-surface-soft px-1 py-0.5 rounded border border-grid">
            Syndication Service
          </code>{" "}
          are already excluded automatically by type; this list catches the
          stragglers that are mislabeled. To add or remove an entry, edit{" "}
          <code className="text-[12px] bg-surface-soft px-1 py-0.5 rounded border border-grid">
            src/data/excluded_operators.json
          </code>{" "}
          and re-run the pipeline &mdash; excluding an operator is a
          reviewable code change by design.
        </p>
      </header>

      <section>
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600 mb-3">
          {entries.length}{" "}
          {entries.length === 1 ? "excluded operator" : "excluded operators"}
        </h2>

        {entries.length === 0 ? (
          <p className="rounded-md border border-grid border-dashed bg-surface-soft px-4 py-8 text-center text-[14px] text-grey-600">
            No operators on the denylist.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-grid">
                  <th className="text-left px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider">
                    Operator
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider">
                    Added
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.normalizedName} className="border-b border-grid">
                    <td className="px-3 py-3 text-navy font-medium align-top">
                      {e.displayName ?? e.normalizedName}
                      <div className="font-mono text-[12px] text-grey-500">
                        {e.normalizedName}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-grey-600 align-top max-w-[560px]">
                      {e.reason ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-grey-600 align-top whitespace-nowrap">
                      {e.addedOn ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
