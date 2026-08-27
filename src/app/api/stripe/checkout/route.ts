// v0.30 — Consumer funnel: create a Stripe Checkout Session.
//
// POST { kind, pmSlug?, marketId?, partner? } → { url } (redirect target).
// The buyer is resolved guest-OR-org: a signed-in workspace user is attached
// by organizationId/userId (via getActiveOrgContext); a guest is left to
// Stripe Checkout to collect their email, which the webhook reads to key the
// entitlement. Everything the webhook needs to grant access is stamped into
// session.metadata (and subscription_data.metadata for the recurring SKU).
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
  kind: z.enum(["single_report", "market_pass", "subscription", "api_access"]),
  pmSlug: z.string().min(1).optional(),
  marketId: z.string().min(1).optional(),
  // Partner attribution (e.g. "biggerpockets") — carried through to the
  // entitlement + analytics so we can rev-share and measure by channel.
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

  // Resolve what the purchase targets, and validate it exists so we never
  // create a Checkout Session for a bogus pm/market.
  let pmSlug = "";
  let marketId = "";
  let displayName = "";
  if (product.target === "pm") {
    if (!parsed.pmSlug) {
      return Response.json({ error: "pmSlug required" }, { status: 400 });
    }
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
  } else if (product.target === "market") {
    if (!parsed.marketId) {
      return Response.json({ error: "marketId required" }, { status: 400 });
    }
    const market = await prisma.market.findUnique({
      where: { id: parsed.marketId },
      select: { id: true, fullName: true },
    });
    if (!market) {
      return Response.json({ error: "Market not found" }, { status: 404 });
    }
    marketId = market.id;
    displayName = market.fullName;
  } else {
    // Account-level plan (api_access): targets neither a PM nor a market, so
    // there is nothing to look up. The plan label is the display name.
    displayName = product.label;
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
  let successPath: string;
  let cancelPath: string;
  if (product.target === "pm") {
    successPath = `/report/r/${pmSlug}?session_id={CHECKOUT_SESSION_ID}`;
    cancelPath = `/report/r/${pmSlug}`;
  } else if (product.target === "market") {
    successPath = `/report/market/${marketId}?session_id={CHECKOUT_SESSION_ID}`;
    cancelPath = `/report/market/${marketId}`;
  } else {
    // Account-level plan (api_access) returns to its own billing page.
    successPath = `/api-access?status=success&session_id={CHECKOUT_SESSION_ID}`;
    cancelPath = `/api-access?status=canceled`;
  }

  try {
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: product.stripeMode,
      line_items: [{ price: resolvePriceId(parsed.kind), quantity: 1 }],
      success_url: `${base}${successPath}`,
      cancel_url: `${base}${cancelPath}`,
      metadata,
      // Let Checkout collect the email for guests; reused as the entitlement
      // key in the webhook. Enable an email receipt where supported.
      billing_address_collection: "auto",
      allow_promotion_codes: true,
    };
    // Carry metadata onto the Subscription object too, so later
    // customer.subscription.* events can resolve the owner without the
    // original session.
    if (product.stripeMode === "subscription") {
      params.subscription_data = { metadata };
    } else {
      params.payment_intent_data = { metadata };
    }

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
