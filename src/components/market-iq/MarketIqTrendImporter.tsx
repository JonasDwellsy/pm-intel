"use client";

import { useState } from "react";

export function MarketIqTrendImporter() {
  const [payload, setPayload] = useState("");
  const [status, setStatus] = useState("Ready for an authoritative Dwellsy IQ snapshot.");

  async function submit() {
    setStatus("Importing…");
    try {
      const parsed = JSON.parse(payload);
      const snapshots = Array.isArray(parsed) ? parsed : [parsed];
      let imported = 0;
      for (let index = 0; index < snapshots.length; index += 1) {
        setStatus(`Importing geography ${index + 1} of ${snapshots.length}…`);
        const response = await fetch("/api/market-iq/import/trends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshots[index]),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? `Import failed at geography ${index + 1}.`);
        imported += result.recordCount ?? 0;
      }
      setStatus(`Imported ${imported.toLocaleString()} trend observations across ${snapshots.length} geographies.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The snapshot is not valid JSON.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <p className="dq-eyebrow">Market IQ administration</p>
      <h1 className="dq-h1">Import rent trends</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        This preview-only utility accepts normalized output from Dwellsy IQ Rent Trends. It does not accept historical listing records.
      </p>
      <label className="mt-8 block text-sm font-semibold text-navy" htmlFor="trend-file">Trend snapshot file</label>
      <input
        id="trend-file"
        type="file"
        accept="application/json,.json"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setPayload(await file.text());
          setStatus(`Loaded ${file.name}. Review the JSON, then import it.`);
        }}
        className="mt-2 block w-full rounded-lg border border-grid bg-white p-3 text-sm"
      />
      <label className="mt-6 block text-sm font-semibold text-navy" htmlFor="trend-payload">Trend snapshot JSON</label>
      <textarea
        id="trend-payload"
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        className="mt-2 min-h-64 w-full rounded-lg border border-grid bg-white p-4 font-mono text-xs"
        spellCheck={false}
      />
      <div className="mt-4 flex items-center gap-4">
        <button type="button" onClick={submit} className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">
          Import snapshot
        </button>
        <p role="status" className="text-sm text-muted-foreground">{status}</p>
      </div>
    </main>
  );
}
