import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { marketIqPrisma } from "@/lib/market-iq/prisma";
import { loadMarketIqRecordedSourceReadiness } from "@/lib/market-iq/source-readiness.server";
import type { MarketIqRecordedSourceReadiness } from "@/lib/market-iq/source-readiness";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Check = {
  label: string;
  status: "ready" | "attention" | "blocked";
  detail: string;
};

const STYLE: Record<Check["status"], string> = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-900",
  attention: "border-amber-200 bg-amber-50 text-amber-950",
  blocked: "border-rose-200 bg-rose-50 text-rose-900",
};

function configured(name: string) {
  return Boolean(process.env[name]?.trim());
}

function dateTime(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }) : "None recorded";
}

function deploymentIdentity() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "unavailable";
  return {
    branch: process.env.VERCEL_GIT_COMMIT_REF?.trim() || "unavailable",
    commit,
    shortCommit: commit === "unavailable" ? commit : commit.slice(0, 7),
    hostname: process.env.VERCEL_URL?.trim() || "local development",
    builtAt: process.env.MARKET_IQ_BUILD_TIMESTAMP?.trim() || null,
  };
}

function recordedFailureDetail(source: MarketIqRecordedSourceReadiness) {
  const failure = source.state === "source_not_configured" ? null : source.lastAttempt?.failure;
  if (!failure) return "";
  const stage = failure.stage.replaceAll("_", " ");
  const category = failure.category.replaceAll("_", " ");
  return ` Failure stage ${stage}; category ${category}; ${failure.attempts} ${failure.attempts === 1 ? "attempt" : "attempts"}.`;
}

function sourceReadinessCheck(source: MarketIqRecordedSourceReadiness): Check {
  if (source.state === "saved_report_available") {
    const latestFailed = source.lastAttempt?.status === "blocked";
    return {
      label: "Authoritative Trends",
      status: latestFailed ? "attention" : "ready",
      detail: `Verified saved evidence through ${dateTime(source.sourceAvailableThrough)}; recorded ${dateTime(source.generatedAt)}.${latestFailed ? ` The latest refresh did not complete at ${dateTime(source.lastAttempt?.completedAt ?? source.lastAttempt?.startedAt)}.${recordedFailureDetail(source)}` : ""}`,
    };
  }
  if (source.state === "saved_report_incompatible") {
    return {
      label: "Authoritative Trends",
      status: "blocked",
      detail: `Saved evidence through ${dateTime(source.sourceAvailableThrough)} was created under an older analytical contract. Refresh Cleveland from Trends before using this deployment.`,
    };
  }
  if (source.state === "source_not_configured") {
    return { label: "Authoritative Trends", status: "blocked", detail: "The read-only Trends source is not configured. No live connection was attempted by this page." };
  }
  if (source.state === "source_unreachable") {
    return {
      label: "Authoritative Trends",
      status: "blocked",
      detail: source.lastAttempt
        ? `The latest recorded source attempt did not complete. Status ${source.lastAttempt.status}; attempted ${dateTime(source.lastAttempt.completedAt ?? source.lastAttempt.startedAt)}.${recordedFailureDetail(source)}`
        : "Recorded Market IQ source evidence is unreachable. No live source connection was attempted by this page.",
    };
  }
  return {
    label: "Authoritative Trends",
    status: "blocked",
    detail: source.lastAttempt
      ? `No verified saved report is available. Latest recorded source status ${source.lastAttempt.status} at ${dateTime(source.lastAttempt.completedAt ?? source.lastAttempt.startedAt)}.${recordedFailureDetail(source)}`
      : "No verified saved report or source attempt is recorded.",
  };
}

export default async function MarketIqInternalReadinessPage() {
  if (!marketIqPreviewEnabled()) notFound();
  const { userId, organizationId } = await getActiveOrgContext();
  if (!isAdminUser(userId)) notFound();
  if (!organizationId) redirect("/setup-workspace?from=/market-iq/internal/readiness");

  const [organization, source, latestSupply, latestRun, failedBillingEvents] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        brandProfile: { select: { id: true, displayName: true, contactEmail: true } },
        marketIqWorkspacePreference: true,
        marketIqSubscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, planKey: true, source: true, billingInterval: true, stripeCustomerId: true, stripeSubscriptionId: true },
        },
        _count: { select: { marketIqReports: true, marketIqReportRecipients: true, marketIqReportSends: true, marketIqTestDeliveries: true } },
        marketIqReports: { where: { status: "published" }, orderBy: { publishedAt: "desc" }, take: 1, select: { id: true, periodLabel: true, publishedAt: true } },
        marketIqTestDeliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, sentAt: true, error: true, recipientEmail: true } },
        marketIqReportSends: { orderBy: { createdAt: "desc" }, take: 1, select: { deliveryStatus: true, sentAt: true, deliveredAt: true, deliveryError: true } },
      },
    }),
    loadMarketIqRecordedSourceReadiness(CLEVELAND_MARKET_ID),
    marketIqPrisma.marketIqListingSupplySnapshot.findFirst({
      where: { marketId: CLEVELAND_MARKET_ID },
      orderBy: { snapshotDate: "desc" },
      select: { snapshotDate: true, capturedAt: true, activeListings: true, medianActiveAgeDays: true },
    }),
    prisma.marketIqEditionOrchestrationRun.findFirst({ orderBy: { startedAt: "desc" }, select: { status: true, dryRun: true, startedAt: true, completedAt: true, sourceAvailableThrough: true, error: true } }),
    prisma.marketIqBillingEvent.count({ where: { status: "failed" } }),
  ]);
  if (!organization) notFound();

  const subscription = organization.marketIqSubscriptions[0] ?? null;
  const published = organization.marketIqReports[0] ?? null;
  const latestTest = organization.marketIqTestDeliveries[0] ?? null;
  const latestSend = organization.marketIqReportSends[0] ?? null;
  const priceIdsReady = [
    "STRIPE_MARKET_IQ_INTELLIGENCE_FOUNDING_PRICE_ID",
    "STRIPE_MARKET_IQ_INTELLIGENCE_FOUNDING_ANNUAL_PRICE_ID",
    "STRIPE_MARKET_IQ_CLIENT_ADVISORY_FOUNDING_PRICE_ID",
    "STRIPE_MARKET_IQ_CLIENT_ADVISORY_FOUNDING_ANNUAL_PRICE_ID",
  ].every(configured);
  const infrastructure: Check[] = [
    { label: "Isolated preview", status: process.env.VERCEL_ENV === "preview" && process.env.MARKET_IQ_PREVIEW_ENABLED === "1" ? "ready" : "blocked", detail: `VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}; Market IQ preview flag ${configured("MARKET_IQ_PREVIEW_ENABLED") ? "present" : "missing"}.` },
    { label: "Market IQ database", status: configured("DATABASE_URL") && configured("DATABASE_URL_UNPOOLED") ? "ready" : "blocked", detail: "Application and migration database connections are checked by presence only. Secret values are never displayed." },
    sourceReadinessCheck(source),
    {
      label: "Listing supply history",
      status: latestSupply ? "ready" : "attention",
      detail: latestSupply
        ? `${latestSupply.activeListings.toLocaleString()} active listings and ${latestSupply.medianActiveAgeDays ?? "no"} median age days captured for ${dateTime(latestSupply.snapshotDate)}; recorded ${dateTime(latestSupply.capturedAt)}.`
        : "No daily listing-supply observation is stored yet. Capture today after the listing source is available.",
    },
    { label: "Mapbox", status: configured("NEXT_PUBLIC_MAPBOX_TOKEN") ? "ready" : "attention", detail: configured("NEXT_PUBLIC_MAPBOX_TOKEN") ? "Public browser map token is configured." : "NEXT_PUBLIC_MAPBOX_TOKEN is missing." },
    { label: "Logo storage", status: configured("MARKET_IQ_BLOB_READ_WRITE_TOKEN") || configured("BLOB_READ_WRITE_TOKEN") ? "ready" : "attention", detail: configured("MARKET_IQ_BLOB_READ_WRITE_TOKEN") || configured("BLOB_READ_WRITE_TOKEN") ? "Vercel Blob storage is connected for firm logo uploads." : "Logo upload is disabled until a preview Blob store is connected. Setup and report publication remain available without a logo." },
    { label: "SendGrid", status: configured("SENDGRID_API_KEY") && configured("DIGEST_FROM_EMAIL") ? "ready" : "blocked", detail: configured("SENDGRID_API_KEY") && configured("DIGEST_FROM_EMAIL") ? "API key and verified sender setting are configured." : "SENDGRID_API_KEY or DIGEST_FROM_EMAIL is missing." },
    { label: "Stripe checkout", status: configured("STRIPE_SECRET_KEY") && priceIdsReady ? "ready" : "blocked", detail: priceIdsReady ? "Four founding price IDs are configured." : "One or more founding price IDs are missing." },
    { label: "Stripe webhook", status: configured("STRIPE_MARKET_IQ_WEBHOOK_SECRET") || configured("STRIPE_WEBHOOK_SECRET") ? "ready" : "blocked", detail: `${failedBillingEvents} failed billing ${failedBillingEvents === 1 ? "event" : "events"} recorded.` },
    { label: "Edition scheduler", status: configured("CRON_SECRET") ? latestRun?.status?.includes("error") || latestRun?.status === "failed" ? "attention" : "ready" : "blocked", detail: latestRun ? `Latest ${latestRun.dryRun ? "dry run" : "run"}: ${latestRun.status} at ${dateTime(latestRun.completedAt ?? latestRun.startedAt)}.` : "CRON_SECRET is configured only if present; no orchestration run is recorded yet." },
  ];
  const workflow: Check[] = [
    { label: "Commercial access", status: subscription?.status === "active" || subscription?.status === "trialing" || subscription?.source === "enterprise" ? "ready" : "attention", detail: subscription ? `${subscription.source} ${subscription.planKey}, ${subscription.billingInterval}, status ${subscription.status}.` : "No Market IQ subscription row exists for this workspace." },
    { label: "Brand and market setup", status: organization.brandProfile && organization.marketIqWorkspacePreference?.onboardingCompletedAt ? "ready" : "blocked", detail: organization.brandProfile ? `${organization.brandProfile.displayName}; setup ${organization.marketIqWorkspacePreference?.onboardingCompletedAt ? "complete" : "incomplete"}.` : "Brand profile is missing." },
    { label: "Published edition", status: published ? "ready" : "blocked", detail: published ? `${published.periodLabel}, published ${dateTime(published.publishedAt)}.` : "No reviewed edition has been published." },
    { label: "Safe test delivery", status: latestTest?.status === "accepted" ? "ready" : latestTest?.status === "failed" ? "blocked" : "attention", detail: latestTest ? `${latestTest.status} to ${latestTest.recipientEmail} at ${dateTime(latestTest.sentAt)}${latestTest.error ? `; ${latestTest.error}` : ""}.` : "No PM-only test has been attempted." },
    { label: "Recipient directory", status: organization._count.marketIqReportRecipients > 0 ? "ready" : "attention", detail: `${organization._count.marketIqReportRecipients} saved ${organization._count.marketIqReportRecipients === 1 ? "recipient" : "recipients"}.` },
    { label: "Customer delivery", status: latestSend?.deliveryStatus === "sent" || latestSend?.deliveredAt ? "ready" : latestSend?.deliveryStatus === "failed" ? "blocked" : "attention", detail: latestSend ? `${latestSend.deliveryStatus}; sent ${dateTime(latestSend.sentAt)}; delivered ${dateTime(latestSend.deliveredAt)}${latestSend.deliveryError ? `; ${latestSend.deliveryError}` : ""}.` : "No customer delivery has been attempted." },
  ];
  const allChecks = [...infrastructure, ...workflow];
  const blocked = allChecks.filter((check) => check.status === "blocked").length;
  const attention = allChecks.filter((check) => check.status === "attention").length;
  const deployment = deploymentIdentity();

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <nav className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"><Link href="/market-iq/launch">First edition</Link><span>/</span><span>Internal diagnostics</span><span>/</span><Link href="/market-iq/internal/admin" className="text-teal-700">Market IQ admin</Link><span>/</span><Link href="/market-iq/internal/pilot-telemetry" className="text-teal-700">Pilot telemetry</Link></nav>
    <header className="mt-6 grid gap-7 border-b border-grid pb-9 lg:grid-cols-[1fr_380px] lg:items-end"><div><p className="dq-eyebrow">Dwellsy internal</p><h1 className="dq-h1">Market IQ launch readiness</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">A fail-closed view of the services and customer workflow required to operate the Cleveland pilot. This route is visible only to configured Dwellsy administrators.</p><div className="mt-5 flex flex-wrap gap-3"><form action="/api/market-iq/source/trends/refresh" method="post"><button className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Refresh Cleveland from Trends</button></form><form action="/api/market-iq/source/dwellsy/refresh" method="post"><button className="rounded-md border border-navy bg-white px-4 py-2.5 text-sm font-semibold text-navy">Capture today&apos;s listing supply</button></form></div><p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">Each control reads its authoritative source and stores verified evidence in the isolated Market IQ database. Neither modifies a source database, and listing supply is limited to one observation per UTC day.</p></div><aside className={`rounded-2xl p-6 ${blocked ? "bg-[#6f2431] text-white" : attention ? "bg-amber-100 text-amber-950" : "bg-navy text-white"}`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-60">Current assessment</p><p className="mt-3 text-2xl font-semibold">{blocked ? `${blocked} blocking ${blocked === 1 ? "check" : "checks"}` : attention ? `${attention} ${attention === 1 ? "item needs" : "items need"} verification` : "Ready for a controlled pilot"}</p><p className="mt-2 text-sm leading-6 opacity-75">Workspace: {organization.name}</p></aside></header>

    <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="dq-eyebrow">Deployment identity</p><h2 className="dq-h2">The artifact serving this page</h2></div><p className="text-xs text-slate-500">Use this identity when reporting a stale or unexpected preview.</p></div><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Branch</dt><dd className="mt-1 break-all font-semibold text-navy">{deployment.branch}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Commit</dt><dd className="mt-1 font-mono font-semibold text-navy" title={deployment.commit}>{deployment.shortCommit}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Deployment host</dt><dd className="mt-1 break-all font-semibold text-navy">{deployment.hostname}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Built at</dt><dd className="mt-1 font-semibold text-navy">{dateTime(deployment.builtAt)}</dd></div></dl></section>

    {[{ title: "Infrastructure", checks: infrastructure }, { title: "Customer workflow", checks: workflow }].map((group) => <section key={group.title} className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-6 py-5 sm:px-8"><p className="dq-eyebrow">Launch checks</p><h2 className="dq-h2">{group.title}</h2></div><div className="divide-y divide-slate-100">{group.checks.map((check) => <article key={check.label} className="grid gap-3 px-6 py-5 sm:px-8 md:grid-cols-[180px_1fr] md:items-start"><div><span className={`inline-flex rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider ${STYLE[check.status]}`}>{check.status}</span><p className="mt-2 text-sm font-semibold text-navy">{check.label}</p></div><p className="text-sm leading-6 text-slate-600">{check.detail}</p></article>)}</div></section>)}

    <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Boundaries</p><p className="mt-2 text-sm leading-6 text-slate-600">Diagnostics never display secret values, send email, run a scheduler, publish a report, change a subscription, or modify source data. They read configuration presence and existing Market IQ records only.</p></section>
  </main>;
}
