import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { sendMarketIqLaunchTest } from "@/app/market-iq/launch/actions";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { isAdminUser } from "@/lib/auth/is-admin";
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
  searchParams: Promise<{ activated?: string; published?: string; test?: string; recipient?: string }>;
}) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access, query, user] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
    searchParams,
    currentUser(),
  ]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace?from=/market-iq/launch");
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) {
    redirect("/market-iq/subscribe");
  }
  if (!access.capabilities.publishClientReports) redirect("/market-iq/subscribe?upgrade=client_advisory");

  const [organization, reviewedEdition, bootstrapEdition, recipientCount, campaign, deliveredCount, recurringDraft, latestTest] = await Promise.all([
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
    prisma.marketIqTestDelivery.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { status: true, recipientEmail: true, sentAt: true, error: true, createdAt: true },
    }),
  ]);
  if (!organization) redirect("/setup-workspace?from=/market-iq/launch");

  const setupComplete = Boolean(
    organization.brandProfile && organization.marketIqWorkspacePreference?.onboardingCompletedAt
  );
  const editionComplete = Boolean(reviewedEdition);
  const testComplete = latestTest?.status === "accepted" || deliveredCount > 0;
  const recipientComplete = recipientCount > 0;
  const audienceComplete = Boolean(campaign && campaign._count.recipients > 0);
  const deliveryComplete = deliveredCount > 0;
  const completion = [setupComplete, editionComplete, testComplete, recipientComplete, audienceComplete, deliveryComplete].filter(Boolean).length;
  const nextIndex = [setupComplete, editionComplete, testComplete, recipientComplete, audienceComplete, deliveryComplete].findIndex((value) => !value);
  const currentIndex = nextIndex === -1 ? 5 : nextIndex;
  const stepStatus = (index: number, complete: boolean): StepStatus => complete ? "complete" : index === currentIndex ? "current" : "upcoming";

  const activeReport = reviewedEdition ?? bootstrapEdition;
  const campaignHref = campaign
    ? campaign.status === "complete" || campaign.status === "partial"
      ? `/market-iq/delivery/${campaign.id}?flow=launch`
      : `/market-iq/distribution/${campaign.id}?flow=launch`
    : "/market-iq/distribution?flow=launch";
  const steps: LaunchStep[] = [
    {
      number: 1,
      title: "Confirm your firm and market",
      description: "Set the client-facing brand, Cleveland scope, cities, ZIPs, and product segments that should open by default.",
      status: stepStatus(0, setupComplete),
      href: "/market-iq/get-started?flow=launch",
      action: setupComplete ? "Edit setup" : "Confirm setup",
      detail: setupComplete ? "Brand and reusable market defaults saved" : "About three minutes",
    },
    {
      number: 2,
      title: "Review and publish the first edition",
      description: "Check the current Trends IQ evidence, dates, narrative, and PM branding before freezing the client-ready link.",
      status: stepStatus(1, editionComplete),
      href: "/market-iq/report?flow=launch",
      action: editionComplete ? "Review edition history" : "Review current edition",
      detail: editionComplete ? `Published ${dateLabel(reviewedEdition?.publishedAt)}` : "The first Cleveland edition is ready for review",
    },
    {
      number: 3,
      title: "Send a test to yourself",
      description: "Verify the client page, email formatting, links, sender identity, and reply address using only your signed-in email.",
      status: stepStatus(2, testComplete),
      href: "#test-delivery",
      action: testComplete ? "Review test status" : "Run safe test",
      detail: testComplete ? `Provider accepted ${dateLabel(latestTest?.sentAt)}` : "No client or prospect can receive this test",
    },
    {
      number: 4,
      title: "Add a client or prospect",
      description: "Build the reusable recipient directory. Saving a recipient never sends an email.",
      status: stepStatus(3, recipientComplete),
      href: "/market-iq/distribution?flow=launch#add-recipient",
      action: recipientComplete ? "Manage recipients" : "Add first recipient",
      detail: `${recipientCount} active ${recipientCount === 1 ? "recipient" : "recipients"}`,
    },
    {
      number: 5,
      title: "Review the report and email",
      description: "Choose the audience, review the PM-branded report and personalized email, then confirm each recipient.",
      status: stepStatus(4, audienceComplete),
      href: campaignHref,
      action: audienceComplete ? "Review campaign" : "Prepare delivery",
      detail: audienceComplete ? `${campaign?._count.recipients ?? 0} individually selected` : "No delivery is automatic",
    },
    {
      number: 6,
      title: "Send and verify delivery",
      description: "Approve each recipient and check the delivery status afterward.",
      status: stepStatus(5, deliveryComplete),
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
      {query.test && <p className={`mb-6 rounded-xl border px-5 py-3 text-sm font-semibold ${query.test === "accepted" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{query.test === "accepted" ? "The test email was accepted by SendGrid and sent only to your signed-in address." : query.test === "no_report" ? "Publish a reviewed client edition before sending a test." : "The test email was not accepted. Review the diagnostic below before trying again."}</p>}
      {query.recipient === "1" && <p className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">Recipient saved. Prepare the audience when you are ready. No email was sent.</p>}
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
          <p className="mt-3 text-3xl font-semibold text-navy">{completion} of 6</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${completion / 6 * 100}%` }} /></div>
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
          <h2 className="dq-h2">Six steps from setup to verified delivery</h2>
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

      <section id="test-delivery" className="mt-8 grid gap-6 rounded-2xl border border-orange-200 bg-orange-50 p-6 sm:p-8 lg:grid-cols-[1fr_390px] lg:items-center">
        <div><p className="dq-eyebrow">Safe delivery test</p><h2 className="dq-h2">See exactly what a client would receive</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">This sends the latest published edition only to the email address on your signed-in Clerk account. It does not add a recipient, create a campaign, count as a client delivery, or email anyone else.</p>{latestTest && <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${latestTest.status === "accepted" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : latestTest.status === "failed" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}><p className="font-semibold">Latest test: {latestTest.status}</p><p className="mt-1 text-xs">{latestTest.recipientEmail} · {dateLabel(latestTest.sentAt ?? latestTest.createdAt)}</p>{latestTest.error && <p className="mt-2 text-xs leading-5">{latestTest.error}</p>}</div>}</div>
        <form action={sendMarketIqLaunchTest} className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-800">Test recipient</p><p className="mt-2 break-all text-sm font-semibold text-navy">{user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? "No signed-in email found"}</p><label className="mt-4 flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-600"><input required type="checkbox" name="confirmation" value={user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? ""} className="mt-0.5 size-4" /><span>I confirm this test should go only to my signed-in email address.</span></label><button disabled={!reviewedEdition || !(user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress)} className="mt-4 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">Send test to myself</button>{!reviewedEdition && <p className="mt-3 text-xs leading-5 text-slate-500">Publish a reviewed edition before running the delivery test.</p>}</form>
      </section>

      {isAdminUser(userId) && <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-300 bg-slate-100 p-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Dwellsy internal</p><p className="mt-2 text-lg font-semibold text-navy">Launch diagnostics are available for this workspace</p><p className="mt-1 text-sm text-slate-600">Environment, billing, data, scheduling, publication, and delivery checks are hidden from customers.</p></div><Link href="/market-iq/internal/readiness" className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white">Open diagnostics</Link></section>}

      {activeReport && (
        <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal-200 bg-teal-50 p-6">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800">Client report</p><p className="mt-2 text-lg font-semibold text-navy">A shareable Cleveland edition is ready</p><p className="mt-1 text-sm text-slate-600">Review the page your recipients will see before preparing an email.</p></div>
          <Link href={`/reports/market/${activeReport.publicToken}`} target="_blank" className="rounded-md border border-navy bg-white px-4 py-2.5 text-sm font-semibold text-navy">Open report preview</Link>
        </section>
      )}
    </main>
  );
}
