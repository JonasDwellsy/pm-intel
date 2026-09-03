// v0.30 — Consumer funnel: create a Stripe Checkout Session.
//
// POST { kind, pmSlug?, partner? } → { url } (redirect target). Both SKUs are
// one-time (mode: "payment") — there is no recurring SKU.
// The buyer is resolved guest-OR-org: a signed-in workspace user is attached
// by organizationId/userId (via getActiveOrgContext); a guest is left to
// Stripe Checkout to collect their email, which the webhook reads to key the
// entitlement. Everything the webhook needs to grant access is stamped into
// session.metadata and payment_intent_data.metadata.
//
// This route is PUBLIC (not in PROTECTED_ROUTE_PATTERNS) so guests can buy;
// it never grants access itself — the webhook does, after Stripe confirms
// payment. Does not touch any existing B2B surface.

import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { PRODUCTS, resolvePriceId } from "@/lib/billing/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  kind: z.enum(["single_report", "three_pack"]),
  // Required for single_report. Optional for three_pack: a pack bought from
  // the landing page has no operator in context, and its credits are redeemed
  // later. When present on a pack, the webhook redeems one credit immediately
  // for this operator.
  pmSlug: z.string().min(1).optional(),
  // Partner attribution (e.g. "biggerpockets") — carried through to analytics
  // so we can rev-share and measure by channel.
  partner: z.string().max(64).optional(),
});

function baseUrl(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const product = PRODUCTS[parsed.kind];

  // Validate the operator when one is supplied, so we never create a Checkout
  // Session against a bogus slug.
  let pmSlug = "";
  let marketId = "";
  let displayName = "";
  if (parsed.pmSlug) {
    const pm = await prisma.pM.findUnique({
      where: { slug: parsed.pmSlug },
      select: { slug: true, name: true, marketId: true },
    });
    if (!pm) {
      return Response.json({ error: "Operator not found" }, { status: 404 });
    }
    pmSlug = pm.slug;
    marketId = pm.marketId;
    displayName = pm.name;
  } else if (parsed.kind === "single_report") {
    // A single report is *about* an operator; without one there is nothing to
    // sell. A pack is fine without one.
    return Response.json({ error: "pmSlug required" }, { status: 400 });
  }

  // Buyer identity (optional — guests are fine). Signed-in users attach their
  // org so the entitlement lands on the workspace, exactly like the B2B gate.
  const { userId, organizationId } = await getActiveOrgContext();

  const metadata: Record<string, string> = {
    kind: parsed.kind,
    pmSlug,
    marketId,
    organizationId: organizationId ?? "",
    userId: userId ?? "",
    partner: parsed.partner ?? "",
  };

  const base = baseUrl(req);
  // With an operator in context, return to its report. Without one (a pack
  // bought from the landing page), return to the account wallet where the
  // buyer redeems credits.
  const successPath = pmSlug
    ? `/report/r/${pmSlug}?session_id={CHECKOUT_SESSION_ID}`
    : `/report/account?session_id={CHECKOUT_SESSION_ID}`;
  const cancelPath = pmSlug ? `/report/r/${pmSlug}` : `/report`;

  try {
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: product.stripeMode, // always "payment" — no recurring SKU
      line_items: [{ price: resolvePriceId(parsed.kind), quantity: 1 }],
      success_url: `${base}${successPath}`,
      cancel_url: `${base}${cancelPath}`,
      metadata,
      // Let Checkout collect the email for guests; reused as the entitlement
      // key in the webhook.
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      payment_intent_data: { metadata },
    };

    const session = await getStripe().checkout.sessions.create(params);
    return Response.json({ url: session.url, id: session.id });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "stripe/checkout", kind: parsed.kind },
      extra: { pmSlug, marketId, displayName },
    });
    console.error("[stripe/checkout] session create failed:", err);
    return Response.json({ error: "Checkout unavailable" }, { status: 500 });
  }
}
