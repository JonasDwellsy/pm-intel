// B2B Dwellsy API Access billing page. A public, standalone page a client can
// visit to start (or confirm) the $250/mo Dwellsy API subscription — 500 API
// calls per month, recurring on their card via Stripe.
//
// Flow:
//   1. Client opens /api-access, reads the plan, clicks Subscribe.
//   2. ApiAccessCheckoutButton → POST /api/stripe/checkout { kind:"api_access" }
//      → Stripe Checkout (subscription mode) collects card + email.
//   3. Stripe redirects back to /api-access?status=success&session_id=… and
//      the customer.subscription.* webhook mirrors the subscription into the DB.
//
// PUBLIC route (deliberately absent from PROTECTED_ROUTE_PATTERNS) so the
// client can pay without a login, exactly like the consumer funnel — trust for
// the charge comes from Stripe, and access is only granted after Stripe
// confirms payment. Uses the standard B2B site chrome (SiteHeader/SiteFooter).
//
// NOTE: this page bills the plan. Issuing the API key and enforcing the
// 500-calls/month meter is a separate system, not wired here.

import type { Metadata } from "next";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { PRODUCTS, API_ACCESS_MONTHLY_CALLS } from "@/lib/billing/products";
import { ApiAccessCheckoutButton } from "@/components/billing/ApiAccessCheckoutButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dwellsy API Access",
  description:
    "Subscribe to the Dwellsy API — 500 calls per month, billed $250/mo.",
  robots: { index: false },
};

const PLAN = PRODUCTS.api_access;

const INCLUDED: string[] = [
  `${API_ACCESS_MONTHLY_CALLS.toLocaleString()} Dwellsy API calls per month`,
  "Programmatic access to Dwellsy rental data",
  "Recurring monthly billing on your card — cancel anytime",
  "Emailed Stripe receipt for every payment",
];

/** Best-effort confirmation that a returned Checkout Session actually paid for
 *  this plan, so we only show "active" to a genuine buyer (not anyone who types
 *  ?status=success). Any failure degrades to a generic thank-you. */
async function sessionConfirmsApiAccess(
  sessionId: string | undefined
): Promise<boolean> {
  if (!sessionId || !stripeConfigured()) return false;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const paid =
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required";
    return paid && session.metadata?.kind === "api_access";
  } catch {
    return false;
  }
}

export default async function ApiAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; session_id?: string }>;
}) {
  const { status, session_id } = await searchParams;
  const confirmed =
    status === "success" && (await sessionConfirmsApiAccess(session_id));
  const canceled = status === "canceled";

  return (
    <main className="bg-[#FBFAF6]">
      <div className="mx-auto max-w-[680px] px-6 py-14 sm:py-20">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-navy/60">
          Dwellsy API
        </p>
        <h1 className="mt-2 text-[30px] font-semibold tracking-tight text-navy sm:text-[34px]">
          API Access plan
        </h1>
        <p className="mt-3 max-w-[560px] text-[16px] leading-[1.55] text-muted-foreground">
          {PLAN.blurb} Set up your recurring subscription below — it takes about
          a minute and is billed securely through Stripe.
        </p>

        {confirmed && (
          <div
            className="mt-8 rounded-xl border border-green-600/30 bg-green-50 p-5"
            role="status"
          >
            <p className="text-[15px] font-semibold text-green-800">
              Subscription active — thank you!
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-green-900/80">
              Your card is set up and the first $250 payment has gone through.
              Stripe has emailed your receipt. We&rsquo;ll be in touch shortly
              with your API credentials and getting-started details.
            </p>
          </div>
        )}

        {canceled && !confirmed && (
          <div
            className="mt-8 rounded-xl border border-grid bg-white p-5"
            role="status"
          >
            <p className="text-[14px] text-foreground/85">
              Checkout was canceled — you haven&rsquo;t been charged. You can
              start again whenever you&rsquo;re ready.
            </p>
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-grid bg-white p-6 sm:p-8">
          <div className="flex items-baseline gap-2">
            <span className="text-[40px] font-semibold leading-none text-navy">
              ${PLAN.priceUsd}
            </span>
            <span className="text-[15px] text-muted-foreground">/ month</span>
          </div>
          <p className="mt-2 text-[14px] font-medium text-navy">
            {PLAN.label}
          </p>

          <ul className="mt-5 space-y-2.5">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-2.5 text-[14.5px] text-foreground/85">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="mt-0.5 h-[18px] w-[18px] shrink-0 text-navy"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.3 6.8-6.8a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 border-t border-grid pt-6">
            {stripeConfigured() ? (
              <ApiAccessCheckoutButton />
            ) : (
              <p className="text-[14px] text-muted-foreground">
                Online billing isn&rsquo;t available right now. Please reach out
                to your Dwellsy contact and we&rsquo;ll get you set up.
              </p>
            )}
          </div>
        </div>

        <p className="mt-6 text-[12.5px] leading-relaxed text-muted-foreground">
          After you subscribe, we&rsquo;ll provision your API access and share
          credentials. To update your card or cancel later, contact your Dwellsy
          representative or manage the subscription from your Stripe receipt.
        </p>
      </div>
    </main>
  );
}
