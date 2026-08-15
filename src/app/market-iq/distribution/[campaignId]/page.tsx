import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveMarketIqCampaignAudience, setMarketIqRecipientSuppression } from "@/app/market-iq/distribution/actions";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { buildMarketIqReportEmail } from "@/lib/market-iq/report/email";
import { parseMarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function reportBaseUrl() {
  if (process.env.MARKET_IQ_PUBLIC_URL) return process.env.MARKET_IQ_PUBLIC_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function statusStyle(status: string) {
  if (status === "sent" || status === "already_sent") return "bg-emerald-50 text-emerald-800";
  if (status === "failed" || status === "suppressed") return "bg-rose-50 text-rose-800";
  return "bg-amber-50 text-amber-900";
}

export default async function MarketIqCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ stage?: string; delivery?: string }>;
}) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access, route] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
    params,
  ]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");
  const [campaign, directory, query] = await Promise.all([
    prisma.marketIqDistributionCampaign.findFirst({
      where: { id: route.campaignId, organizationId },
      include: {
        report: { select: { id: true, periodLabel: true, publicToken: true, snapshot: true, publishedAt: true } },
        recipients: {
          orderBy: { createdAt: "asc" },
          include: { recipient: true },
        },
      },
    }),
    prisma.marketIqReportRecipient.findMany({ where: { organizationId }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    searchParams,
  ]);
  if (!campaign) notFound();
  const snapshot = parseMarketIqReportSnapshot(campaign.report.snapshot);
  if (!snapshot) notFound();
  const selectedIds = new Set(campaign.recipients.map((row) => row.recipientId));
  const activeRows = campaign.recipients.filter((row) => row.recipient.emailStatus === "active");
  const previewRecipient = activeRows[0]?.recipient ?? directory.find((recipient) => recipient.emailStatus === "active") ?? null;
  const reportUrl = `${reportBaseUrl()}/reports/market/${campaign.report.publicToken}`;
  const emailPreview = previewRecipient ? buildMarketIqReportEmail({
    recipientName: previewRecipient.name,
    recipientKind: previewRecipient.kind as "client" | "prospect",
    report: snapshot,
    reportUrl,
    pdfUrl: `${reportUrl}/pdf`,
  }) : null;
  const reviewStage = query.stage === "review" || campaign.status !== "draft";

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <DwellsyIqWorkspaceNav />
    <nav className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq">Market IQ</Link><span>/</span><Link href="/market-iq/distribution">Distribution</Link><span>/</span><span>{campaign.report.periodLabel}</span></nav>
    <header className="mt-6 grid gap-6 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end"><div><p className="dq-eyebrow">Controlled distribution</p><h1 className="dq-h1">Review every recipient before delivery</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-slate-600">The prior edition audience is carried forward as a draft. Adjust it, inspect the exact PM-branded email, then confirm recipients individually. Nothing on this page sends automatically.</p></div><aside className="rounded-xl bg-navy p-5 text-white"><p className="text-[10px] font-bold uppercase tracking-wider text-white/55">Edition</p><p className="mt-2 text-lg font-semibold">{campaign.report.periodLabel}</p><p className="mt-2 text-sm text-white/65">{campaign.recipients.length} selected · {campaign.status}</p></aside></header>

    <section className="mt-8 grid gap-7 xl:grid-cols-[420px_1fr]">
      <form action={saveMarketIqCampaignAudience} className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="campaignId" value={campaign.id} />
        <p className="dq-eyebrow">Step 1</p><h2 className="dq-h2">Confirm the audience</h2><p className="mt-2 text-sm leading-6 text-slate-600">Previously used recipients are preselected. Suppressed addresses remain visible but cannot be selected.</p>
        <div className="mt-5 max-h-[560px] divide-y divide-slate-100 overflow-y-auto border-y border-slate-100">{directory.map((recipient) => <label key={recipient.id} className={`flex gap-3 py-4 ${recipient.emailStatus === "suppressed" ? "opacity-55" : "cursor-pointer"}`}><input type="checkbox" name="recipientId" value={recipient.id} defaultChecked={selectedIds.has(recipient.id)} disabled={recipient.emailStatus === "suppressed"} className="mt-1 size-4" /><span className="min-w-0"><span className="block text-sm font-semibold text-navy">{recipient.name}</span><span className="block truncate text-xs text-slate-500">{recipient.email} · {recipient.kind}</span>{recipient.emailStatus === "suppressed" && <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-rose-700">Suppressed · {recipient.suppressionReason ?? "delivery disabled"}</span>}</span></label>)}</div>
        <button className="mt-5 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white">Save audience and review</button>
      </form>

      <div className="space-y-7">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="dq-eyebrow">Step 2</p><h2 className="dq-h2">Exact email preview</h2><p className="mt-2 text-sm text-slate-600">Subject: <strong>{emailPreview?.subject ?? "Add an active recipient to preview"}</strong></p></div><Link href={reportUrl} target="_blank" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-navy">Review public report</Link></div>{emailPreview ? <iframe title="PM-branded email preview" sandbox="" srcDoc={emailPreview.html} className="mt-5 h-[720px] w-full rounded-xl border border-slate-200 bg-slate-50" /> : <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Add at least one active recipient to generate the exact personalized preview.</p>}</section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="dq-eyebrow">Step 3</p><h2 className="dq-h2">Recipient-by-recipient confirmation</h2><p className="mt-2 text-sm leading-6 text-slate-600">Each delivery has its own status. Duplicate deliveries are represented explicitly and suppressed addresses stay blocked.</p><div className="mt-5 divide-y divide-slate-100">{campaign.recipients.map((row) => <article key={row.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="text-sm font-semibold text-navy">{row.recipient.name}</p><p className="mt-1 text-xs text-slate-500">{row.recipient.email} · {row.recipient.kind}</p>{row.lastError && <p className="mt-1 text-xs text-rose-700">{row.lastError}</p>}</div><div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${statusStyle(row.recipient.emailStatus === "suppressed" ? "suppressed" : row.status)}`}>{row.recipient.emailStatus === "suppressed" ? "suppressed" : row.status}</span><form action={setMarketIqRecipientSuppression}><input type="hidden" name="campaignId" value={campaign.id} /><input type="hidden" name="recipientId" value={row.recipient.id} /><input type="hidden" name="suppress" value={row.recipient.emailStatus === "suppressed" ? "0" : "1"} /><button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600">{row.recipient.emailStatus === "suppressed" ? "Restore" : "Suppress"}</button></form></div></article>)}{campaign.recipients.length === 0 && <p className="py-6 text-sm text-slate-500">Select recipients to begin the final review.</p>}</div>
          {reviewStage && activeRows.length > 0 && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-950">Final delivery control is not enabled yet</p><p className="mt-1 text-xs leading-5 text-amber-900">The audience, preview, idempotency boundary, suppression state, and retry fields are ready. Enabling the final controls will make an external email action available for each named recipient.</p></div>}
        </section>
      </div>
    </section>
  </main>;
}
