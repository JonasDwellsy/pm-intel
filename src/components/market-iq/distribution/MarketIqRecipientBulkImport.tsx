"use client";

import { useState } from "react";
import { bulkImportMarketIqRecipients } from "@/app/market-iq/distribution/actions";

type ImportRow = {
  name: string;
  email: string;
  kind: "client" | "prospect";
};

const MAX_ROWS = 1_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function normalizedHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function relationship(value: unknown, fallback: "client" | "prospect") {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.includes("prospect") || normalized.includes("lead") ? "prospect" : normalized.includes("client") || normalized.includes("owner") ? "client" : fallback;
}

export function MarketIqRecipientBulkImport() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [defaultKind, setDefaultKind] = useState<"client" | "prospect">("client");

  async function readFile(file: File | undefined) {
    setRows([]);
    setFileName(file?.name ?? "");
    setError("");
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("Choose a spreadsheet smaller than 2 MB.");
      return;
    }

    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, blankrows: false, defval: "" });
      const headers = (matrix[0] ?? []).map(normalizedHeader);
      const nameIndex = headers.findIndex((header) => ["name", "fullname", "recipientname", "contactname"].includes(header));
      const emailIndex = headers.findIndex((header) => ["email", "emailaddress", "recipientemail", "contactemail"].includes(header));
      const relationshipIndex = headers.findIndex((header) => ["relationship", "type", "kind", "audience"].includes(header));
      if (nameIndex < 0 || emailIndex < 0) {
        setError("The first row must include Name and Email columns. Relationship is optional.");
        return;
      }

      const seen = new Set<string>();
      const parsed: ImportRow[] = [];
      let invalid = 0;
      for (const record of matrix.slice(1)) {
        const name = String(record[nameIndex] ?? "").trim().slice(0, 120);
        const email = String(record[emailIndex] ?? "").trim().toLowerCase().slice(0, 254);
        if (!name && !email) continue;
        if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
          invalid += 1;
          continue;
        }
        if (seen.has(email)) continue;
        seen.add(email);
        parsed.push({ name, email, kind: relationshipIndex >= 0 ? relationship(record[relationshipIndex], defaultKind) : defaultKind });
        if (parsed.length >= MAX_ROWS) break;
      }
      setRows(parsed);
      if (!parsed.length) setError("No valid recipients were found in this file.");
      else if (invalid) setError(`${invalid} incomplete or invalid ${invalid === 1 ? "row was" : "rows were"} left out. Review the valid rows below before importing.`);
    } catch {
      setError("We could not read that file. Use an Excel workbook or CSV with Name and Email columns.");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="dq-eyebrow">Bulk import</p>
      <h2 className="dq-h2">Add a recipient list</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Upload an Excel or CSV file with Name and Email columns. An optional Relationship column can contain Client or Prospect.</p>
      <label className="mt-5 block text-sm font-semibold text-navy">Default relationship
        <select value={defaultKind} onChange={(event) => setDefaultKind(event.target.value as "client" | "prospect")} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal">
          <option value="client">Current client</option>
          <option value="prospect">Prospect</option>
        </select>
      </label>
      <label className="mt-4 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-teal-300 bg-teal-50 px-5 py-8 text-center">
        <span><strong className="block text-sm text-navy">Choose spreadsheet</strong><span className="mt-1 block text-xs text-slate-500">.xlsx, .xls, or .csv, up to 1,000 recipients</span></span>
        <input type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => void readFile(event.target.files?.[0])} />
      </label>
      {fileName && <p className="mt-3 text-xs font-semibold text-slate-600">{fileName}</p>}
      {error && <p className={`mt-3 rounded-lg px-3 py-2 text-xs leading-5 ${rows.length ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"}`}>{error}</p>}
      {rows.length > 0 && <form action={bulkImportMarketIqRecipients} className="mt-5">
        <input type="hidden" name="recipients" value={JSON.stringify(rows)} />
        <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Email</th><th className="px-3 py-2 font-semibold">Relationship</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.slice(0, 100).map((row) => <tr key={row.email}><td className="px-3 py-2 font-medium text-navy">{row.name}</td><td className="px-3 py-2 text-slate-500">{row.email}</td><td className="px-3 py-2 capitalize text-slate-500">{row.kind}</td></tr>)}</tbody></table>
        </div>
        {rows.length > 100 && <p className="mt-2 text-xs text-slate-500">Showing the first 100 of {rows.length} valid recipients.</p>}
        <p className="mt-3 text-xs leading-5 text-slate-500">Existing email addresses will be updated rather than duplicated. Bulk import never enrolls anyone in automatic monthly delivery.</p>
        <button className="mt-4 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white">Import {rows.length} {rows.length === 1 ? "recipient" : "recipients"}</button>
      </form>}
    </section>
  );
}
