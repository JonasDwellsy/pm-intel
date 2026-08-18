"use client";

import { useMemo, useState } from "react";
import { setMarketIqRecipientRecurringApproval } from "@/app/market-iq/distribution/actions";

type Recipient = { id: string; name: string; email: string; kind: string; recurringDeliveryApprovedAt: Date | null; sends: Array<{ deliveryStatus: string; sentAt: Date | null; deliveredAt: Date | null; report: { periodLabel: string } }> };

function dateLabel(value: Date | null) {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Not sent";
}

export function MarketIqRecipientDirectory({ recipients }: { recipients: Recipient[] }) {
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => recipients.filter((recipient) => (kind === "all" || recipient.kind === kind) && `${recipient.name} ${recipient.email}`.toLowerCase().includes(query.toLowerCase())), [recipients, kind, query]);
  return <section>
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5 sm:p-6"><p className="dq-eyebrow">Recipient directory</p><h2 className="dq-h2">Clients and prospects</h2><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" className="rounded-md border border-slate-300 px-3 py-2.5 text-sm" /><select value={kind} onChange={(event) => setKind(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="all">All relationships</option><option value="client">Current clients</option><option value="prospect">Prospects</option></select></div></div>
      <div className="divide-y divide-slate-100">{visible.map((recipient) => { const latest = recipient.sends[0]; const recurring = Boolean(recipient.recurringDeliveryApprovedAt); return <article key={recipient.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-navy">{recipient.name}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">{recipient.kind}</span>{recurring && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-teal-700">Monthly delivery</span>}</div><p className="mt-1 truncate text-sm text-slate-500">{recipient.email}</p>{latest && <p className="mt-2 text-[11px] text-slate-400">Latest: {latest.report.periodLabel} · {latest.deliveredAt ? "delivered" : latest.deliveryStatus} · {dateLabel(latest.deliveredAt ?? latest.sentAt)}</p>}</div><span className="rounded-full bg-surface-soft px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{latest ? latest.deliveryStatus : "not sent"}</span></div><form action={setMarketIqRecipientRecurringApproval} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><input type="hidden" name="recipientId" value={recipient.id} /><input type="hidden" name="approve" value={recurring ? "0" : "1"} />{recurring ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-5 text-slate-600">Approved for automatic monthly editions.</p><button className="text-xs font-semibold text-slate-600 underline underline-offset-2">Remove from monthly delivery</button></div> : <label className="flex items-start gap-3 text-xs leading-5 text-slate-600"><input type="checkbox" name="confirmation" value={recipient.id} required className="mt-1" /><span>I approve automatic monthly delivery to this person. <button className="ml-1 font-semibold text-teal-700 underline underline-offset-2">Add to monthly delivery</button></span></label>}</form></article>; })}{visible.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No recipients match this view.</p>}</div>
    </div>
  </section>;
}
