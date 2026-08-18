import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";
import { EligibilityRunButton } from "./EligibilityRunButton";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  would_send: "bg-emerald-50 text-emerald-800",
  already_sent: "bg-sky-50 text-sky-800",
  excluded: "bg-slate-100 text-slate-700",
  no_archive: "bg-amber-50 text-amber-900",
  in_progress: "bg-blue-50 text-blue-800",
  retry_requires_click: "bg-rose-50 text-rose-800",
};

function dateTime(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }) : "Not completed";
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function maskEmail(value: string) {
  const [name, domain] = value.split("@");
  if (!domain) return value;
  return `${name.slice(0, 2)}${name.length > 2 ? "•••" : ""}@${domain}`;
}

export default async function MarketIqBriefingEmailRunsPage() {
  if (!marketIqPreviewEnabled()) notFound();
  const { userId } = await getActiveOrgContext();
  if (!isAdminUser(userId)) notFound();

  const runs = await prisma.marketIqBriefingEmailRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 25,
    include: {
      items: {
        orderBy: [{ status: "asc" }, { organizationId: "asc" }, { userId: "asc" }],
        include: { organization: { select: { name: true, brandProfile: { select: { displayName: true } } } } },
      },
    },
  });
  const latest = runs[0] ?? null;
  const latestItems = latest?.items ?? [];
  const statusCounts = new Map<string, number>();
  latestItems.forEach((item) => statusCounts.set(item.status, (statusCounts.get(item.status) ?? 0) + 1));

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq/internal/readiness">Internal diagnostics</Link><span>/</span><Link href="/market-iq/internal/admin">Market IQ admin</Link><span>/</span><span>Briefing email checks</span></nav>
    <header className="mt-6 grid gap-7 border-b border-grid pb-9 lg:grid-cols-[1fr_360px] lg:items-end"><div><p className="dq-eyebrow">Dwellsy internal</p><h1 className="dq-h1">Briefing email eligibility</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">See which opted-in users have a new frozen Market IQ briefing and why any user would be skipped. This scheduler remains dry-run only.</p></div><aside className="rounded-2xl bg-navy p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Safety boundary</p><p className="mt-3 text-xl font-semibold">No automatic delivery</p><p className="mt-2 text-sm leading-6 text-white/70">Running a check writes audit records only. It cannot call SendGrid or retry a failed message.</p></aside></header>

    <section className="mt-8 grid gap-4 sm:grid-cols-3"><Metric label="Opted-in candidates" value={latest?.candidateCount ?? 0} /><Metric label="Would receive new briefing" value={latest?.eligibleCount ?? 0} /><Metric label="Skipped safely" value={latest?.skippedCount ?? 0} /></section>

    <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Latest run</p><h2 className="dq-h2">{latest ? `${latest.triggerKind === "manual" ? "Manual" : "Scheduled"} check · ${dateTime(latest.completedAt ?? latest.startedAt)}` : "No eligibility check recorded"}</h2>{latest && <div className="mt-5 flex flex-wrap gap-2">{[...statusCounts.entries()].map(([status, count]) => <span key={status} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-700"}`}>{count} {statusLabel(status)}</span>)}</div>}{latest?.error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{latest.error}</p>}</div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-6"><p className="dq-eyebrow">Manual verification</p><h2 className="dq-h2">Check now</h2><p className="mt-2 mb-5 text-sm leading-6 text-slate-600">Evaluate all opted-in users against the latest frozen briefing. This action never sends an email.</p><EligibilityRunButton /></div></section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-5"><p className="dq-eyebrow">Latest run detail</p><h2 className="dq-h2">Candidate decisions</h2></div><div className="divide-y divide-slate-100">{latestItems.map((item) => <article key={item.id} className="grid gap-4 px-6 py-5 lg:grid-cols-[1.2fr_190px_1.6fr] lg:items-start"><div><p className="font-semibold text-navy">{item.organization.brandProfile?.displayName ?? item.organization.name}</p><p className="mt-1 text-xs text-slate-500">{maskEmail(item.recipientEmail)} · user {item.userId}</p></div><span className={`w-fit rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider ${STATUS_STYLE[item.status] ?? "bg-slate-100 text-slate-700"}`}>{statusLabel(item.status)}</span><p className="text-sm leading-6 text-slate-600">{item.detail}</p></article>)}{latestItems.length === 0 && <p className="px-6 py-8 text-sm text-slate-600">No opted-in users were evaluated in the latest run.</p>}</div></section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-5"><p className="dq-eyebrow">Run history</p><h2 className="dq-h2">Scheduler audit trail</h2></div><div className="divide-y divide-slate-100">{runs.map((run) => <article key={run.id} className="grid gap-3 px-6 py-4 sm:grid-cols-[1fr_120px_120px_120px] sm:items-center"><div><p className="text-sm font-semibold capitalize text-navy">{run.triggerKind} · {run.status}</p><p className="mt-1 text-xs text-slate-500">{dateTime(run.completedAt ?? run.startedAt)} · dry run</p></div><p className="text-sm text-slate-600"><b className="text-navy">{run.candidateCount}</b> candidates</p><p className="text-sm text-slate-600"><b className="text-navy">{run.eligibleCount}</b> eligible</p><p className="text-sm text-slate-600"><b className="text-navy">{run.skippedCount}</b> skipped</p></article>)}{runs.length === 0 && <p className="px-6 py-8 text-sm text-slate-600">The scheduler has not run yet.</p>}</div></section>
  </main>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold text-navy">{value}</p></article>;
}
