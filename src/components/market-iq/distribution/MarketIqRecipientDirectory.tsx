"use client";

import { useMemo, useState } from "react";
import { setMarketIqRecipientRecurringApproval } from "@/app/market-iq/distribution/actions";

type Recipient = {
  id: string;
  name: string;
  companyName: string | null;
  email: string;
  kind: string;
  recurringDeliveryApprovedAt: Date | null;
};

export function MarketIqRecipientDirectory({ recipients }: { recipients: Recipient[] }) {
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => recipients.filter((recipient) => {
    const matchesKind = kind === "all" || recipient.kind === kind;
    const searchable = `${recipient.name} ${recipient.companyName ?? ""} ${recipient.email}`.toLowerCase();
    return matchesKind && searchable.includes(query.toLowerCase());
  }), [recipients, kind, query]);

  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 p-5 sm:p-6">
      <p className="dq-eyebrow">Recipient directory</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="dq-h2">Clients and prospects</h2><p className="mt-2 text-sm text-slate-500">Check Monthly only for people who should receive recurring editions. Delivery history lives in Sharing.</p></div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, company, or email" className="rounded-md border border-slate-300 px-3 py-2.5 text-sm" /><select value={kind} onChange={(event) => setKind(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="all">All relationships</option><option value="client">Current clients</option><option value="prospect">Prospects</option></select></div>
    </div>
    <div className="hidden grid-cols-[minmax(220px,1.5fr)_minmax(160px,1fr)_130px_100px] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 md:grid"><span>Recipient</span><span>Company</span><span>Relationship</span><span className="text-center">Monthly</span></div>
    <div className="divide-y divide-slate-100">{visible.map((recipient) => {
      const recurring = Boolean(recipient.recurringDeliveryApprovedAt);
      return <article key={recipient.id} className="grid gap-4 p-5 md:grid-cols-[minmax(220px,1.5fr)_minmax(160px,1fr)_130px_100px] md:items-center md:px-6">
        <div className="min-w-0"><p className="font-semibold text-navy">{recipient.name}</p><p className="mt-1 truncate text-sm text-slate-500">{recipient.email}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">Company</p><p className="mt-1 text-sm text-slate-600 md:mt-0">{recipient.companyName || <span className="text-slate-400">Not provided</span>}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">Relationship</p><span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600 md:mt-0">{recipient.kind === "client" ? "Client" : "Prospect"}</span></div>
        <form action={setMarketIqRecipientRecurringApproval} className="flex items-center gap-2 md:justify-center">
          <input type="hidden" name="recipientId" value={recipient.id} />
          <input type="hidden" name="confirmation" value={recipient.id} />
          <input
            type="checkbox"
            name="approve"
            value="1"
            defaultChecked={recurring}
            aria-label={`${recurring ? "Remove" : "Add"} ${recipient.name} ${recurring ? "from" : "to"} monthly delivery`}
            title={`${recurring ? "Remove from" : "Add to"} monthly delivery`}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className="h-4 w-4 rounded border-slate-300 text-teal-700"
          />
          <span className="text-xs text-slate-500 md:sr-only">Monthly delivery</span>
        </form>
      </article>;
    })}{visible.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No recipients match this view.</p>}</div>
  </section>;
}
