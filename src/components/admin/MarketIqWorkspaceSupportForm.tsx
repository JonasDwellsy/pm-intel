"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateMarketIqWorkspaceSupport, type WorkspaceSupportResult } from "@/app/market-iq/internal/admin/support-actions";

type SupportState = {
  status: string;
  assignedTo: string | null;
  followUpAt: string | null;
  latestNote: string | null;
} | null;

function SaveButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save support update"}</button>;
}

export function MarketIqWorkspaceSupportForm({ organizationId, supportState }: { organizationId: string; supportState: SupportState }) {
  const [result, action] = useActionState<WorkspaceSupportResult | null, FormData>(updateMarketIqWorkspaceSupport, null);
  return <form action={action} className="rounded-2xl border border-slate-200 bg-white p-6">
    <input type="hidden" name="organizationId" value={organizationId} />
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status<select name="status" defaultValue={supportState?.status ?? "open"} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-navy"><option value="open">Open</option><option value="monitoring">Monitoring</option><option value="resolved">Resolved</option></select></label>
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Internal owner<input name="assignedTo" maxLength={120} defaultValue={supportState?.assignedTo ?? ""} placeholder="Person or team" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-navy" /></label>
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Follow-up date<input type="date" name="followUpAt" defaultValue={supportState?.followUpAt?.slice(0, 10) ?? ""} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-navy" /></label>
      <div className="rounded-md bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500"><strong className="text-navy">Private workspace record.</strong> Staff assignments and notes never appear in PM or recipient reports.</div>
    </div>
    <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500">Internal note<textarea name="note" maxLength={2000} rows={4} placeholder="What happened, what was decided, or what should happen next?" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-navy" /></label>
    {supportState?.latestNote && <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600"><strong className="text-navy">Latest note:</strong> {supportState.latestNote}</p>}
    <div className="mt-4 flex items-center gap-3"><SaveButton />{result && <p className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}>{result.message ?? result.error}</p>}</div>
  </form>;
}
