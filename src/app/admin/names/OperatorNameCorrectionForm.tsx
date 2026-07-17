"use client";

// v0.24 — client form for the admin Names tab. Search box → pick a hit
// (canonical group vs a single market's PM record are distinct rows, so the
// admin explicitly chooses per-market vs group scope) → correction form
// bound to saveCorrection. Active corrections table below with a drift
// indicator (the operator's current live name has since diverged from the
// corrected value, e.g. re-seeded from a source with a different name) and
// an Undo action.

import { useActionState, useState } from "react";
import type { OperatorHit, ActiveCorrection } from "@/lib/operators/name-correction.server";
import { saveCorrection, undoCorrection, type NameCorrectionResult } from "./actions";

export function OperatorNameCorrectionForm({
  search,
  active,
}: {
  search: (q: string) => Promise<OperatorHit[]>;
  active: ActiveCorrection[];
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<OperatorHit[]>([]);
  const [selected, setSelected] = useState<OperatorHit | null>(null);
  const [saveState, saveAction] = useActionState<NameCorrectionResult | null, FormData>(
    saveCorrection,
    null
  );
  const [undoState, undoAction] = useActionState<NameCorrectionResult | null, FormData>(
    undoCorrection,
    null
  );

  async function runSearch() {
    setHits(await search(query));
    setSelected(null);
  }

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

        {hits.length > 0 && (
          <ul className="mt-3 divide-y divide-grid border border-grid rounded">
            {hits.map((h) => (
              <li
                key={`${h.kind}:${h.key}`}
                className="flex items-center justify-between px-3 py-2"
              >
                <div>
                  <span className="text-[14px] font-medium text-navy">{h.currentName}</span>
                  <span className="ml-2 text-[12px] text-grey-600">
                    {h.kind === "canonical" ? "Group (all markets)" : h.context}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(h)}
                  className="text-[13px] font-semibold text-teal-700"
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
          <p className="text-[13px] text-grey-600 mb-2">
            Correcting{" "}
            {selected.kind === "canonical"
              ? "the group name (all markets)"
              : `this market's name (${selected.context})`}
          </p>
          <form action={saveAction} className="flex gap-2 items-center">
            <input type="hidden" name="targetKind" value={selected.kind} />
            <input type="hidden" name="targetKey" value={selected.key} />
            <input
              name="correctedName"
              defaultValue={selected.currentName}
              className="flex-1 border border-grid rounded px-3 py-2 text-[14px]"
            />
            <button
              type="submit"
              className="px-4 py-2 text-[14px] font-semibold text-white bg-teal-700 rounded"
            >
              Save
            </button>
          </form>
          {saveState?.error && (
            <p className="mt-2 text-[13px] text-red-600">{saveState.error}</p>
          )}
          {saveState?.summary && (
            <p className="mt-2 text-[13px] text-teal-700">{saveState.summary}</p>
          )}
        </section>
      )}

      <section>
        <h2 className="text-[15px] font-semibold text-navy mb-2">Active corrections</h2>
        {active.length === 0 ? (
          <p className="text-[13px] text-grey-600">None yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-grey-600 border-b border-grid">
                <th className="py-2">Original</th>
                <th>Corrected</th>
                <th>Target</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {active.map((c) => (
                <tr key={c.id} className="border-b border-grid">
                  <td className="py-2">{c.originalName}</td>
                  <td>
                    {c.correctedName}
                    {c.currentName !== null && c.currentName !== c.correctedName && (
                      <span className="ml-2 text-[11px] text-amber-600">⚠ drifted</span>
                    )}
                  </td>
                  <td className="text-grey-600">
                    {c.targetKind === "canonical" ? "Group" : "Market"} · {c.targetKey}
                  </td>
                  <td className="text-right">
                    <form action={undoAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="text-[13px] text-red-600">
                        Undo
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {undoState?.summary && (
          <p className="mt-2 text-[13px] text-teal-700">{undoState.summary}</p>
        )}
      </section>
    </div>
  );
}
