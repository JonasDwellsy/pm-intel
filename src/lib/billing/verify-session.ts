// v0.33 — Post-checkout session verification. Shared by the report page and
// the report PDF route so a buyer sees / downloads their report immediately on
// return from Stripe, even before the webhook has written the durable
// entitlement. Defensive: any mismatch returns false and the caller falls
// through to the normal DB-backed gate.

import "server-only";
import { getStripe, stripeConfigured } from "@/lib/stripe";

/** True iff `sessionId` is a paid Checkout Session that covers `slug`.
 *
 *  Both SKUs stamp the operator they were bought for into session metadata:
 *  `single_report` always, `three_pack` when it was bought from a report page.
 *  A pack bought from the landing page carries no pmSlug and grants nothing
 *  here — the buyer redeems a credit instead, which writes the entitlement the
 *  normal gate reads. */
export async function sessionGrantsReport(
  sessionId: string,
  slug: string
): Promise<boolean> {
  if (!stripeConfigured()) return false;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return false;
    const md = session.metadata ?? {};
    if (md.kind !== "single_report" && md.kind !== "three_pack") return false;
    return Boolean(md.pmSlug) && md.pmSlug === slug;
  } catch {
    return false;
  }
}
