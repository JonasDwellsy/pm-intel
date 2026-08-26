// v0.32 — Stripe Billing Portal session for the consumer subscription.
// POST { token?, partner? } → { url }. Resolves the requester's OWN Stripe
// customer (guest magic-link token or signed-in identity — never a
// caller-supplied id) and opens a portal session where they can update payment,
// view invoices, or cancel. PUBLIC route; ownership is enforced by
// resolveViewerBilling, not by login.

import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { resolveViewerBilling } from "@/lib/billing/customer.server";
import { verifyReportAccessToken } from "@/lib/report/access-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  token: z.string().optional(),
  partner: z.string().max(64).optional(),
});

function baseUrl(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return configured || new URL(req.url).origin;
}

export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return Response.json({ error: "Billing unavailable" }, { status: 503 });
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json().catch(() => ({})));
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const guestEmail = verifyReportAccessToken(parsed.token ?? null);
  const { stripeCustomerId } = await resolveViewerBilling(guestEmail);
  if (!stripeCustomerId) {
    // 404 rather than 403 — don't confirm whether a customer exists.
    return Response.json({ error: "No billing account found" }, { status: 404 });
  }

  const base = baseUrl(req);
  const tq = parsed.token ? `?token=${encodeURIComponent(parsed.token)}` : "";
  const partnerParam =
    parsed.partner && !tq
      ? `?partner=${encodeURIComponent(parsed.partner)}`
      : parsed.partner
        ? `&partner=${encodeURIComponent(parsed.partner)}`
        : "";

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${base}/report/account${tq}${partnerParam}`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "report/portal" } });
    console.error("[report/portal] session create failed:", err);
    return Response.json({ error: "Billing unavailable" }, { status: 500 });
  }
}
