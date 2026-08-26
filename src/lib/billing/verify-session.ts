// v0.30 — Post-checkout session verification. Shared by the report page and
// the report PDF route so a buyer sees / downloads their report immediately on
// return from Stripe, even before the webhook has written the durable
// entitlement. Defensive: any mismatch returns false and the caller falls
// through to the normal DB-backed gate.

import "server-only";
import { getStripe, stripeConfigured } from "@/lib/stripe";

/** True iff `sessionId` is a paid Checkout Session that covers `slug`
 *  (single_report) or `marketId` (market_pass / subscription). */
export async function sessionGrantsReport(
  sessionId: string,
  slug: string,
  marketId: string
): Promise<boolean> {
  if (!stripeConfigured()) return false;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return false;
    const md = session.metadata ?? {};
    if (md.kind === "single_report") return md.pmSlug === slug;
    if (md.kind === "market_pass" || md.kind === "subscription") {
      return md.marketId === marketId;
    }
    return false;
  } catch {
    return false;
  }
}
