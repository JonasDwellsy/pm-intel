"use client";

import { useState } from "react";

export function MarketIqTrendImporter() {
  const [payload, setPayload] = useState("");
  const [status, setStatus] = useState("Ready for an authoritative Dwellsy IQ snapshot.");

  async function submit() {
    setStatus("Importing…");
    try {
      const parsed = JSON.parse(payload);
      const response = await fetch("/api/market-iq/import/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const result = await response.json();
      setStatus(response.ok ? `Imported ${result.recordCount ?? 0} trend observations.` : result.error ?? "Import failed.");
    } catch {
      setStatus("The snapshot is not valid JSON.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <p className="dq-eyebrow">Market IQ administration</p>
      <h1 className="dq-h1">Import rent trends</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        This preview-only utility accepts normalized output from Dwellsy IQ Rent Trends. It does not accept historical listing records.
      </p>
      <label className="mt-8 block text-sm font-semibold text-navy" htmlFor="trend-payload">Trend snapshot JSON</label>
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
