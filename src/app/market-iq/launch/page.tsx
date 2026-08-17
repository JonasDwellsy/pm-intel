import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type StepStatus = "complete" | "current" | "upcoming";

type LaunchStep = {
  number: number;
  title: string;
  description: string;
  status: StepStatus;
  href: string;
  action: string;
  detail: string;
};

const STATUS_STYLE: Record<StepStatus, string> = {
  complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
  current: "border-orange-200 bg-orange-50 text-orange-800",
  upcoming: "border-slate-200 bg-slate-50 text-slate-500",
};

function dateLabel(value: Date | null | undefined) {
  return value
    ? value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "Not yet";
}

export default async function MarketIqLaunchPage({
  searchParams,
}: {
  searchParams: Promise<{ activated?: string; published?: string }>;
}) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access, query] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
    searchParams,
  ]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace?from=/market-iq/launch");
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) {
    redirect("/market-iq/subscribe");
  }
  if (!access.capabilities.publishClientReports) redirect("/market-iq/subscribe?upgrade=client_advisory");

  const [organization, reviewedEdition, bootstrapEdition, recipientCount, campaign, deliveredCount, recurringDraft] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        brandProfile: true,
        marketIqWorkspacePreference: true,
      },
    }),
    prisma.marketIqReport.findFirst({
      where: {
        organizationId,
        marketId: CLEVELAND_MARKET_ID,
        status: "published",
        generatedBy: { notIn: ["preview-bootstrap", "market-iq-baseline"] },
      },
      orderBy: { publishedAt: "desc" },
      select: { id: true, publicToken: true, periodLabel: true, publishedAt: true },
    }),
    prisma.marketIqReport.findFirst({
      where: { organizationId, marketId: CLEVELAND_MARKET_ID, status: "published" },
      orderBy: { publishedAt: "desc" },
      select: { id: true, publicToken: true, periodLabel: true, publishedAt: true },
    }),
    prisma.marketIqReportRecipient.count({ where: { organizationId, emailStatus: "active" } }),
    prisma.marketIqDistributionCampaign.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        reportId: true,
        report: { select: { periodLabel: true } },
        _count: { select: { recipients: true } },
      },
    }),
    prisma.marketIqReportSend.count({
      where: {
        organizationId,
        OR: [{ deliveryStatus: "sent" }, { deliveredAt: { not: null } }],
      },
    }),
    prisma.marketIqEditionDraft.findFirst({
      where: { organizationId, marketId: CLEVELAND_MARKET_ID, status: { in: ["ready", "reviewing"] } },
      orderBy: { detectedAt: "desc" },
      select: { id: true, periodEnd: true, materialChangeCount: true },
    }),
  ]);
  if (!organization) redirect("/setup-workspace?from=/market-iq/launch");

  const setupComplete = Boolean(
    organization.brandProfile && organization.marketIqWorkspacePreference?.onboardingCompletedAt
  );
  const editionComplete = Boolean(reviewedEdition);
  const recipientComplete = recipientCount > 0;
  const audienceComplete = Boolean(campaign && campaign._count.recipients > 0);
  const deliveryComplete = deliveredCount > 0;
  const completion = [setupComplete, editionComplete, recipientComplete, audienceComplete, deliveryComplete].filter(Boolean).length;
  const nextIndex = [setupComplete, editionComplete, recipientComplete, audienceComplete, deliveryComplete].findIndex((value) => !value);
  const currentIndex = nextIndex === -1 ? 4 : nextIndex;
  const stepStatus = (index: number, complete: boolean): StepStatus => complete ? "complete" : index === currentIndex ? "current" : "upcoming";

  const activeReport = reviewedEdition ?? bootstrapEdition;
  const campaignHref = campaign ? `/market-iq/distribution/${campaign.id}` : "/market-iq/distribution";
  const steps: LaunchStep[] = [
    {
      number: 1,
      title: "Confirm your firm and market",
      description: "Set the client-facing brand, Cleveland scope, cities, ZIPs, and product segments that should open by default.",
      status: stepStatus(0, setupComplete),
      href: "/market-iq/get-started",
      action: setupComplete ? "Edit setup" : "Confirm setup",
      detail: setupComplete ? "Brand and reusable market defaults saved" : "About three minutes",
    },
    {
      number: 2,
      title: "Review and publish the first edition",
      description: "Check the current Trends IQ evidence, dates, narrative, and PM branding before freezing the client-ready link.",
      status: stepStatus(1, editionComplete),
      href: "/market-iq/editions",
      action: editionComplete ? "Review edition history" : "Review current edition",
      detail: editionComplete ? `Published ${dateLabel(reviewedEdition?.publishedAt)}` : "The first Cleveland edition is ready for review",
    },
    {
      number: 3,
      title: "Add a client or prospect",
      description: "Build the reusable recipient directory. Saving a recipient never sends an email.",
      status: stepStatus(2, recipientComplete),
      href: "/market-iq/distribution",
      action: recipientComplete ? "Manage recipients" : "Add first recipient",
      detail: `${recipientCount} active ${recipientCount === 1 ? "recipient" : "recipients"}`,
    },
    {
      number: 4,
      title: "Review the report and email",
      description: "Choose the audience, review the PM-branded report and personalized email, then confirm each recipient.",
      status: stepStatus(3, audienceComplete),
      href: campaignHref,
      action: audienceComplete ? "Review campaign" : "Prepare delivery",
      detail: audienceComplete ? `${campaign?._count.recipients ?? 0} individually selected` : "No delivery is automatic",
    },
    {
      number: 5,
      title: "Send and verify delivery",
      description: "Approve each recipient and check the delivery status afterward.",
      status: stepStatus(4, deliveryComplete),
      href: campaignHref,
      action: deliveryComplete ? "View delivery history" : "Open final confirmation",
      detail: deliveryComplete ? `${deliveredCount} successful ${deliveredCount === 1 ? "delivery" : "deliveries"}` : "Waiting for your confirmation",
    },
  ];
  const recommended = steps[currentIndex];

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
      {(query.activated === "1" || query.published === "1") && (
        <p className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">
          {query.published === "1" ? "Edition published. Add or confirm the audience before any delivery." : "Setup complete. Your first edition is ready for review."}
        </p>
      )}
      {recurringDraft && <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-orange-200 bg-orange-50 px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-800">New private edition</p><p className="mt-1 text-sm font-semibold text-navy">Trends IQ advanced through {recurringDraft.periodEnd}, with {recurringDraft.materialChangeCount} material {recurringDraft.materialChangeCount === 1 ? "change" : "changes"} flagged for review.</p><p className="mt-1 text-xs text-slate-600">No public link, campaign, audience, or email has been created.</p></div><Link href="/market-iq/review" className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Open review inbox</Link></section>}
      <header className="grid gap-7 border-b border-grid pb-9 lg:grid-cols-[1fr_380px] lg:items-end">
        <div>
          <p className="dq-eyebrow">First edition</p>
          <h1 className="dq-h1">Prepare and share your first Cleveland market read</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
            Confirm your market settings, review the report, choose the audience, and approve each email before it is sent.
          </p>
        </div>
        <aside className="rounded-2xl bg-navy p-6 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Recommended next action</p>
          <p className="mt-3 text-xl font-semibold">{recommended.title}</p>
          <p className="mt-2 text-sm leading-6 text-white/70">{recommended.detail}</p>
          <Link href={recommended.href} className="mt-5 inline-flex rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-navy">
            {recommended.action} →
          </Link>
        </aside>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Launch progress</p>
          <p className="mt-3 text-3xl font-semibold text-navy">{completion} of 5</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${completion * 20}%` }} /></div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current edition</p>
          <p className="mt-3 text-lg font-semibold text-navy">{activeReport?.periodLabel ?? "Ready to assemble"}</p>
          <p className="mt-2 text-xs text-slate-500">{activeReport ? `Published ${dateLabel(activeReport.publishedAt)}` : "Uses saved Trends IQ scope"}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email approval</p>
          <p className="mt-3 text-lg font-semibold text-navy">One recipient at a time</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">You approve each initial send and each retry.</p>
        </article>
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5 sm:px-8">
          <p className="dq-eyebrow">Your checklist</p>
          <h2 className="dq-h2">Five steps from setup to delivery</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {steps.map((step) => (
            <article key={step.number} className={`grid gap-5 px-6 py-6 sm:px-8 lg:grid-cols-[56px_1fr_190px] lg:items-center ${step.status === "current" ? "bg-orange-50/45" : ""}`}>
              <div className={`flex size-11 items-center justify-center rounded-full border text-sm font-bold ${STATUS_STYLE[step.status]}`}>
                {step.status === "complete" ? "✓" : step.number}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-semibold text-navy">{step.title}</h3>
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${STATUS_STYLE[step.status]}`}>{step.status}</span>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{step.description}</p>
                <p className="mt-2 text-xs font-semibold text-slate-400">{step.detail}</p>
              </div>
              <Link href={step.href} className={step.status === "current" ? "rounded-md bg-navy px-4 py-3 text-center text-sm font-semibold text-white" : "rounded-md border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-navy"}>
                {step.action}
              </Link>
            </article>
          ))}
        </div>
      </section>

      {activeReport && (
        <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal-200 bg-teal-50 p-6">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800">Client report</p><p className="mt-2 text-lg font-semibold text-navy">A shareable Cleveland edition is ready</p><p className="mt-1 text-sm text-slate-600">Review the page your recipients will see before preparing an email.</p></div>
          <Link href={`/reports/market/${activeReport.publicToken}`} target="_blank" className="rounded-md border border-navy bg-white px-4 py-2.5 text-sm font-semibold text-navy">Open report preview</Link>
        </section>
      )}
    </main>
  );
}
