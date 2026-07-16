import { searchOperators, loadActiveCorrections } from "@/lib/operators/name-correction.server";
import { OperatorNameCorrectionForm } from "./OperatorNameCorrectionForm";

// v0.24 — Admin → Names. Corrects an operator's display name (typo, casing,
// DBA cleanup) without touching the underlying pipeline data or slugs — the
// live DB rows are patched immediately and the correction is recorded so
// seed.ts re-applies it on every reseed. Auth: gated by
// src/app/admin/layout.tsx.

export const dynamic = "force-dynamic";

export default async function AdminNamesPage() {
  const active = await loadActiveCorrections();

  // Server action wrapper so the client component can search without its own
  // route handler. Returns hits for a query string.
  async function search(query: string) {
    "use server";
    return searchOperators(query);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-16">
      <h1 className="text-[20px] font-semibold text-navy mb-1">Operator names</h1>
      <p className="text-[13px] text-grey-600 mb-6">
        Correct a display name. Changes are live immediately and persist across
        data refreshes. URLs never change. Search autocomplete and PDFs update
        on the next full data refresh.
      </p>
      <OperatorNameCorrectionForm search={search} active={active} />
    </div>
  );
}
