"use client";

// Client form for the admin Reported sizes tab. Search → pick a target →
// record what the operator told us, with a date and a source.
//
// The search results deliberately show OUR figures (observed / estimated /
// band) beside each hit, and the picked target repeats them above the input.
// The person typing "3,000" should see that we estimate 803, because that gap
// is the finding — it is the reason this tool exists, not an embarrassment to
// hide behind a separate screen.

import { useActionState, useState } from "react";
import type {
  ReportedSizeTarget,
  ReportedSizeEntry,
} from "@/lib/operators/reported-size.server";
import {
  REPORTED_SIZE_SOURCE_KINDS,
  SOURCE_KIND_LABELS,
  formatRatio,
  reportedVsEstimateRatio,
} from "@/lib/operators/reported-size";
import {
  saveReportedSize,
  deleteReportedSize,
  type ReportedSizeResult,
} from "./actions";

const fmt = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString() : "—";

/** UTC-safe YYYY-MM-DD. Dates are stored at UTC midnight, so formatting via
 *  the local locale would show the previous day west of GMT. */
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function ReportedSizeForm({
  search,
  entries,
  today,
}: {
  search: (q: string) => Promise<ReportedSizeTarget[]>;
  entries: ReportedSizeEntry[];
  /** Server-rendered YYYY-MM-DD, used as the as-of default and the max. */
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ReportedSizeTarget[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<ReportedSizeTarget | null>(null);
  const [units, setUnits] = useState("");

  const [saveState, saveAction] = useActionState<ReportedSizeResult | null, FormData>(
    saveReportedSize,
    null
  );
  const [deleteState, deleteAction] = useActionState<ReportedSizeResult | null, FormData>(
    deleteReportedSize,
    null
  );

  async function runSearch() {
    setHits(await search(query));
    setSearched(true);
    setSelected(null);
  }

  // Live gap readout as the admin types, so the comparison lands while they're
  // still looking at the number rather than after a round trip.
  const livePreview = (() => {
    const n = Number(units.replace(/[, ]/g, ""));
    if (!selected || !Number.isFinite(n) || n <= 0) return null;
    return formatRatio(reportedVsEstimateRatio(n, selected.estimatedUnits));
  })();

  return (
    <div className="space-y-8">
      <section>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Search operator name…"
            className="flex-1 border border-grid rounded px-3 py-2 text-[14px]"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            className="px-4 py-2 text-[14px] font-semibold text-white bg-navy rounded"
          >
            Search
          </button>
        </div>

        {searched && hits.length === 0 && (
          <p className="mt-3 text-[13px] text-grey-600">
            No operators matched. Search needs at least two characters.
          </p>
        )}

        {hits.length > 0 && (
          <ul className="mt-3 divide-y divide-grid border border-grid rounded">
            {hits.map((h) => (
              <li
                key={`${h.kind}:${h.key}`}
                className="flex items-center justify-between gap-4 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-[14px] font-medium text-navy">{h.name}</span>
                  <span className="ml-2 text-[12px] text-grey-600">
                    {h.kind === "canonical" ? "Group (all markets)" : h.context}
                  </span>
                  <div className="text-[12px] text-grey-600">
                    {fmt(h.observedUnits)} observed · we estimate{" "}
                    {h.estimatedBand ?? "—"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(h)}
                  className="shrink-0 text-[13px] font-semibold text-teal-700"
                >
                  Select
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <section className="border border-grid rounded p-4">
          <h2 className="text-[15px] font-semibold text-navy">
            {selected.name}
            <span className="ml-2 text-[12px] font-normal text-grey-600">
              {selected.kind === "canonical" ? "Group (all markets)" : selected.context}
            </span>
          </h2>
          <p className="mt-1 text-[13px] text-grey-600">
            We observe <strong>{fmt(selected.observedUnits)}</strong> units on-market and
            estimate <strong>{selected.estimatedBand ?? "—"}</strong> managed
            {selected.estimatedUnits !== null && (
              <> ({fmt(selected.estimatedUnits)} point)</>
            )}
            .
          </p>

          <form action={saveAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="targetKind" value={selected.kind} />
            <input type="hidden" name="targetKey" value={selected.key} />

            <label className="block">
              <span className="block text-[12px] font-semibold text-navy mb-1">
                Units the operator reports
              </span>
              <input
                name="reportedUnits"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                inputMode="numeric"
                placeholder="3000"
                className="w-full border border-grid rounded px-3 py-2 text-[14px]"
              />
              {livePreview && (
                <span className="mt-1 block text-[12px] text-teal-700">{livePreview}</span>
              )}
            </label>

            <label className="block">
              <span className="block text-[12px] font-semibold text-navy mb-1">
                As of
              </span>
              <input
                type="date"
                name="reportedAsOf"
                defaultValue={today}
                max={today}
                className="w-full border border-grid rounded px-3 py-2 text-[14px]"
              />
              <span className="mt-1 block text-[12px] text-grey-600">
                When they said it, not today — a count&rsquo;s age is part of its weight.
              </span>
            </label>

            <label className="block">
              <span className="block text-[12px] font-semibold text-navy mb-1">
                Source
              </span>
              <select
                name="sourceKind"
                defaultValue="ceo_call"
                className="w-full border border-grid rounded px-3 py-2 text-[14px]"
              >
                {REPORTED_SIZE_SOURCE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {SOURCE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-[12px] font-semibold text-navy mb-1">
                Note <span className="font-normal text-grey-600">(optional)</span>
              </span>
              <input
                name="sourceNote"
                placeholder="CEO on the intro call — &ldquo;about 3,000 on the platform&rdquo;"
                className="w-full border border-grid rounded px-3 py-2 text-[14px]"
              />
            </label>

            <div className="sm:col-span-2 flex items-center gap-3">
              <button
                type="submit"
                className="px-4 py-2 text-[14px] font-semibold text-white bg-navy rounded"
              >
                Record count
              </button>
              {saveState?.error && (
                <span className="text-[13px] text-bad">{saveState.error}</span>
              )}
              {saveState?.ok && (
                <span className="text-[13px] text-teal-700">{saveState.summary}</span>
              )}
            </div>
          </form>
        </section>
      )}

      <section>
        <h2 className="text-[15px] font-semibold text-navy mb-1">
          Recorded counts ({entries.length})
        </h2>
        <p className="text-[12px] text-grey-600 mb-3">
          Nothing here changes a scorecard, a size band, a cohort, or a rank. These
          are ground truth for checking the estimator, and a number fed into the
          estimator can no longer check it. Recalibration gets worthwhile at
          roughly fifteen.
        </p>
        {deleteState?.error && (
          <p className="text-[13px] text-bad mb-2">{deleteState.error}</p>
        )}
        {entries.length === 0 ? (
          <p className="text-[13px] text-grey-600">None recorded yet.</p>
        ) : (
          <table className="w-full border border-grid rounded text-[13px]">
            <thead>
              <tr className="bg-grey-50 text-left text-[11px] uppercase tracking-wider text-grey-600">
                <th className="px-3 py-2 font-semibold">Operator</th>
                <th className="px-3 py-2 font-semibold text-right">Reported</th>
                <th className="px-3 py-2 font-semibold text-right">We estimate</th>
                <th className="px-3 py-2 font-semibold text-right">Gap</th>
                <th className="px-3 py-2 font-semibold">As of</th>
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-grid">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2">
                    {/* A null name means the target was merged or removed after
                        the count was recorded. Say so rather than rendering a
                        blank cell — the row still holds a real number. */}
                    {e.name ?? (
                      <span className="text-grey-600">
                        {e.targetKey} <em>(no longer in the data)</em>
                      </span>
                    )}
                    {e.targetKind === "canonical" && (
                      <span className="ml-2 text-[11px] text-grey-600">group</span>
                    )}
                    {e.sourceNote && (
                      <div className="text-[12px] text-grey-600">{e.sourceNote}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(e.reportedUnits)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(e.estimatedUnits)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {e.ratio === null ? "—" : `${e.ratio.toFixed(1)}×`}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{ymd(e.reportedAsOf)}</td>
                  <td className="px-3 py-2">{SOURCE_KIND_LABELS[e.sourceKind] ?? e.sourceKind}</td>
                  <td className="px-3 py-2 text-right">
                    <form action={deleteAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <button type="submit" className="text-[12px] font-semibold text-bad">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
