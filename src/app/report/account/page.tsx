// v0.32 — Consumer account / subscription hub. PUBLIC, force-dynamic. Shows the
// viewer's subscription status and a "Manage subscription" button that opens
// the Stripe Billing Portal. Guest viewers arrive via a magic-link token
// (?token=…); signed-in viewers are resolved from their session. Wrapped in
// ReportShell so it carries the partner brand.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportShell } from "@/components/report/ReportShell";
import { ManageSubscriptionButton } from "@/components/report/ManageSubscriptionButton";
import { resolveViewerBilling } from "@/lib/billing/customer.server";
import { clientAdvisoryEnabled } from "@/lib/client-advisory-feature";
import { verifyReportAccessToken } from "@/lib/report/access-token";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false },
};

const STATUS_COPY: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment past due",
  canceled: "Canceled",
  unpaid: "Unpaid",
  incomplete: "Incomplete",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; partner?: string }>;
}) {
  if (!clientAdvisoryEnabled()) notFound();

  const { token, partner } = await searchParams;
  const guestEmail = verifyReportAccessToken(token);
  const { stripeCustomerId, subscription } = await resolveViewerBilling(guestEmail);

  const periodEnd = subscription?.currentPeriodEnd
    ? subscription.currentPeriodEnd.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const canceled = subscription?.status === "canceled";

  return (
    <ReportShell partner={partner ?? null}>
      <main className="bg-[#FBFAF6]">
        <div className="mx-auto max-w-[640px] px-6 py-12">
          <h1 className="text-[26px] font-semibold text-navy">Your account</h1>

          {subscription ? (
            <div className="mt-6 rounded-xl border border-grid bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[15px] font-semibold text-navy">Keep Watching</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {STATUS_COPY[subscription.status] ?? subscription.status}
                    {periodEnd
                      ? canceled
                        ? ` · access ends ${periodEnd}`
                        : ` · renews ${periodEnd}`
                      : ""}
                  </p>
                </div>
                <span className="text-[20px] font-semibold text-navy">$19<span className="text-[13px] font-normal text-muted-foreground">/mo</span></span>
              </div>
              <div className="mt-5 border-t border-grid pt-5">
                <ManageSubscriptionButton token={token ?? null} partner={partner ?? null} />
                <p className="mt-3 text-[12.5px] text-muted-foreground">
                  Update your card, view invoices, or cancel anytime — you keep
                  access through the end of the period you&rsquo;ve paid for.
                </p>
              </div>
            </div>
          ) : stripeCustomerId ? (
            <div className="mt-6 rounded-xl border border-grid bg-white p-6">
              <p className="text-[15px] text-foreground/85">
                You don&rsquo;t have an active subscription.
              </p>
              <div className="mt-4">
                <ManageSubscriptionButton token={token ?? null} partner={partner ?? null} />
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-grid bg-white p-6">
              <p className="text-[15px] text-foreground/85">
                We couldn&rsquo;t find a subscription for you here.
              </p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                If you subscribed as a guest, open this page from the link in
                your confirmation email. Otherwise, browse managers to get
                started.
              </p>
              <a
                href="/report"
                className="mt-4 inline-flex h-10 items-center rounded-md border border-navy bg-white px-5 text-[14px] font-semibold text-navy hover:bg-navy-soft"
              >
                Browse managers
              </a>
            </div>
          )}
        </div>
      </main>
    </ReportShell>
  );
}
