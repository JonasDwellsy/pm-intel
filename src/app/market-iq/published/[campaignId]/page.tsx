import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revokeMarketIqReport } from "@/app/market-iq/report/actions";
import { CopyMarketReportLink } from "@/components/market-iq/CopyMarketReportLink";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { parseMarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function dateLabel(value: Date | null) {
  return value?.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }) ?? "Not available";
}

function relationshipLabel(kind: string | null | undefined) {
  if (kind === "prospect") return "Prospective clients";
  if (kind === "client") return "Current clients";
  return "Client audience";
}

export default async function MarketIqPublishedPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access, route] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
    params,
  ]);
  if (!userId) notFound();
  if (!organizationId) redirect(`/setup-workspace?from=/market-iq/published/${route.campaignId}`);
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) {
    redirect("/market-iq/subscribe");
  }
  if (!access.capabilities.publishClientReports) redirect("/market-iq/subscribe?upgrade=client_advisory");

  const campaign = await prisma.marketIqDistributionCampaign.findFirst({
    where: { id: route.campaignId, organizationId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      report: {
        select: {
          id: true,
          publicToken: true,
          periodLabel: true,
          status: true,
          publishedAt: true,
          snapshot: true,
        },
      },
      recipients: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          recipient: { select: { name: true, email: true, kind: true, emailStatus: true } },
        },
      },
    },
  });
  if (!campaign) notFound();
  const snapshot = parseMarketIqReportSnapshot(campaign.report.snapshot);
  if (!snapshot) notFound();

  const reportPath = `/reports/market/${campaign.report.publicToken}`;
  const comparison = snapshot.editionComparison;
  const geographyCount = snapshot.scope.cities.length + snapshot.scope.zipCodes.length;
  const audience = relationshipLabel(snapshot.editorial?.audienceKind);
  const selectedRecipients = campaign.recipients.length;
  const activeRecipients = campaign.recipients.filter((row) => row.recipient.emailStatus === "active").length;
  const deliveredRecipients = campaign.recipients.filter((row) => ["sent", "already_sent"].includes(row.status)).length;
  const canDistribute = access.capabilities.manageRecipients;

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <nav className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq">Market IQ</Link><span>/</span><Link href="/market-iq/editions">Editions</Link><span>/</span><span>Published</span></nav>

    <header className="mt-6 overflow-hidden rounded-3xl bg-navy text-white shadow-sm">
      <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1fr_370px] lg:items-center lg:px-10 lg:py-10">
        <div><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-emerald-400 text-lg font-bold text-navy">✓</span><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Client edition published</p></div><h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Your market read is ready to share</h1><p className="mt-4 max-w-2xl text-base leading-7 text-white/70">The link below is a frozen record of the reviewed market evidence, your commentary, and your firm’s branding. No email has been sent.</p></div>
        <aside className="rounded-2xl border border-white/15 bg-white/10 p-6"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Published edition</p><p className="mt-2 text-lg font-semibold">{campaign.report.periodLabel}</p><p className="mt-2 text-sm text-white/65">Published {dateLabel(campaign.report.publishedAt)}</p><span className="mt-4 inline-flex rounded-full bg-emerald-300/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100">{campaign.report.status}</span></aside>
      </div>
    </header>

    <section className="mt-7 grid gap-6 lg:grid-cols-[1fr_380px]">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="dq-eyebrow">Permanent client link</p><h2 className="dq-h2">Review what your audience will see</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">This public page has no Market IQ application navigation. Your firm leads the page, with a small Market data by Dwellsy IQ credit.</p>
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="break-all font-mono text-xs leading-5 text-slate-600">{reportPath}</p><div className="mt-4 flex flex-wrap gap-3"><Link href={reportPath} target="_blank" className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Open client page</Link><CopyMarketReportLink path={reportPath} /><Link href="/market-iq/report" className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-navy">Create a revised edition</Link></div></div>
        <div className="mt-6 border-t border-slate-100 pt-5"><p className="text-xs font-semibold leading-5 text-slate-500">Published editions are immutable. If the evidence or wording needs to change, create a revised edition and revoke this link after reviewing the replacement.</p><form action={revokeMarketIqReport} className="mt-4"><input type="hidden" name="reportId" value={campaign.report.id} /><button className="rounded-md border border-rose-300 bg-white px-4 py-2 text-xs font-semibold text-rose-800">Revoke this client link</button></form></div>
      </article>

      <aside className="rounded-2xl border border-teal-200 bg-teal-50 p-6 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800">Next step</p><h2 className="mt-2 text-2xl font-semibold text-navy">Choose who should receive it</h2><p className="mt-3 text-sm leading-6 text-slate-700">The distribution draft is ready. Select recipients, inspect the exact email, then confirm each person separately.</p>
        {canDistribute ? <Link href={`/market-iq/distribution/${campaign.id}`} className="mt-6 block rounded-md bg-navy px-4 py-3 text-center text-sm font-semibold text-white">Review audience and email</Link> : <Link href="/market-iq/subscribe?upgrade=client_advisory" className="mt-6 block rounded-md bg-navy px-4 py-3 text-center text-sm font-semibold text-white">Add client distribution</Link>}
        <p className="mt-3 text-center text-xs leading-5 text-slate-600">Opening the distribution draft does not send anything.</p>
      </aside>
    </section>

    <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5 sm:px-8"><p className="dq-eyebrow">Edition receipt</p><h2 className="dq-h2">What was frozen at publication</h2></div>
      <div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4"><article className="bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Audience</p><p className="mt-2 text-lg font-semibold text-navy">{audience}</p></article><article className="bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Geographies</p><p className="mt-2 text-lg font-semibold text-navy">{geographyCount} selected</p><p className="mt-1 text-xs text-slate-500">{snapshot.scope.cities.length} cities · {snapshot.scope.zipCodes.length} ZIPs</p></article><article className="bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Segments</p><p className="mt-2 text-lg font-semibold text-navy">{snapshot.scope.segments.length} selected</p></article><article className="bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Included findings</p><p className="mt-2 text-lg font-semibold text-navy">{comparison?.findings.length ?? 0}</p></article></div>
      {comparison?.findings.length ? <div className="grid gap-3 border-t border-slate-200 p-6 sm:p-8 lg:grid-cols-2">{comparison.findings.map((finding) => <article key={finding.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">{finding.importance} priority</span><span className="text-[10px] uppercase text-slate-400">{finding.geographyType}</span></div><p className="mt-2 text-sm font-semibold leading-5 text-navy">{finding.headline}</p><p className="mt-2 text-xs leading-5 text-slate-500">{finding.detail}</p></article>)}</div> : <p className="border-t border-slate-200 px-6 py-5 text-sm text-slate-500 sm:px-8">This baseline edition has no prior-edition changes to summarize.</p>}
    </section>

    <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="dq-eyebrow">Distribution status</p><h2 className="dq-h2">Publication and delivery remain separate</h2><p className="mt-2 text-sm leading-6 text-slate-600">The campaign exists only as a draft until you choose an audience. Each initial send and retry still requires an explicit confirmation.</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">{campaign.status}</span></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3"><article className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-semibold text-navy">{selectedRecipients}</p><p className="mt-1 text-xs text-slate-500">selected recipients</p></article><article className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-semibold text-navy">{activeRecipients}</p><p className="mt-1 text-xs text-slate-500">active addresses</p></article><article className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-semibold text-navy">{deliveredRecipients}</p><p className="mt-1 text-xs text-slate-500">sent or previously sent</p></article></div>
      {campaign.recipients.length > 0 && <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">{campaign.recipients.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-navy">{row.recipient.name}</p><p className="mt-1 text-xs text-slate-500">{row.recipient.email} · {row.recipient.kind}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">{row.recipient.emailStatus === "suppressed" ? "suppressed" : row.status}</span></div>)}</div>}
    </section>
  </main>;
}
