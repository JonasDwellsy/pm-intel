"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Recipient = { id: string; name: string; email: string; kind: string; sends: Array<{ deliveryStatus: string; sentAt: Date | null; deliveredAt: Date | null; report: { periodLabel: string } }> };
type Report = { id: string; periodLabel: string; publishedAt: Date | null; publicToken: string };

function dateLabel(value: Date | null) {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Not sent";
}

export function MarketIqRecipientDirectory({ recipients, reports }: { recipients: Recipient[]; reports: Report[] }) {
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [reportId, setReportId] = useState(reports[0]?.id ?? "");
  const visible = useMemo(() => recipients.filter((recipient) => (kind === "all" || recipient.kind === kind) && `${recipient.name} ${recipient.email}`.toLowerCase().includes(query.toLowerCase())), [recipients, kind, query]);
  const report = reports.find((item) => item.id === reportId) ?? null;
  return <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5 sm:p-6"><p className="dq-eyebrow">Recipient directory</p><h2 className="dq-h2">Clients and prospects</h2><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" className="rounded-md border border-slate-300 px-3 py-2.5 text-sm" /><select value={kind} onChange={(event) => setKind(event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="all">All relationships</option><option value="client">Current clients</option><option value="prospect">Prospects</option></select></div></div>
      <div className="divide-y divide-slate-100">{visible.map((recipient) => { const latest = recipient.sends[0]; return <article key={recipient.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-navy">{recipient.name}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">{recipient.kind}</span></div><p className="mt-1 truncate text-sm text-slate-500">{recipient.email}</p>{latest && <p className="mt-2 text-[11px] text-slate-400">Latest: {latest.report.periodLabel} · {latest.deliveredAt ? "delivered" : latest.deliveryStatus} · {dateLabel(latest.deliveredAt ?? latest.sentAt)}</p>}</div><span className="rounded-full bg-surface-soft px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{latest ? latest.deliveryStatus : "not sent"}</span></div></article>; })}{visible.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No recipients match this view.</p>}</div>
    </div>
    <aside className="h-fit rounded-2xl bg-navy p-6 text-white xl:sticky xl:top-6"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">Distribution</p><h2 className="mt-2 text-2xl font-semibold">Choose what to share</h2><label className="mt-6 block text-xs font-bold uppercase tracking-wider text-white/70">Published report<select value={reportId} onChange={(event) => setReportId(event.target.value)} className="mt-2 w-full rounded-md border border-white/20 bg-white px-3 py-3 text-sm font-normal normal-case text-navy"><option value="" disabled>Choose a report</option>{reports.map((item) => <option key={item.id} value={item.id}>{item.periodLabel}</option>)}</select></label><div className="mt-5 rounded-xl bg-white/10 p-4"><p className="text-3xl font-semibold">{recipients.length}</p><p className="mt-1 text-xs text-white/70">saved recipients</p></div>{report && <div className="mt-5 grid gap-2"><Link href={`/reports/market/${report.publicToken}`} target="_blank" className="rounded-md bg-white px-4 py-3 text-center text-sm font-semibold text-navy">Review client view</Link><Link href={`/market-iq/report?published=${report.id}`} className="rounded-md border border-white/25 px-4 py-3 text-center text-sm font-semibold text-white">Open report controls</Link></div>}<p className="mt-5 text-xs leading-5 text-white/60">The directory and delivery history are centralized here. Report controls retain the deliberate confirmation before any email is sent.</p></aside>
  </section>;
}
