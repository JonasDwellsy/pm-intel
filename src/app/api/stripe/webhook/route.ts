// v0.30 — Stripe webhook receiver. Grants consumer entitlements after Stripe
// confirms payment. Modeled directly on the Clerk webhook
// (src/app/api/clerk/webhook/route.ts): nodejs runtime, raw-body signature
// verification, replay-safe side effects, best-effort analytics flushed
// before returning, and a retryable 5xx on handler failure.
//
// PUBLIC route (Stripe is unauthenticated; trust comes from the signature) —
// deliberately absent from PROTECTED_ROUTE_PATTERNS, same as the Clerk hook.
//
// Idempotency (two layers, ordered so a retry can never DROP an event):
//   1. StripeWebhookEvent ledger — fast-path skip for an already-processed
//      event.id. Written only AFTER successful processing, so a failure
//      leaves no ledger row and the retry reprocesses.
//   2. Natural-key upserts on stripeSessionId / stripeSubscriptionId — the
//      actual correctness guarantee: reprocessing the same session/subscription
//      is a no-op. Correctness never depends on the ledger.
//
// Non-breaking: only writes to the NEW v0.30 tables; touches no existing model.

import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { MARKET_PASS_DAYS, type ProductKind } from "@/lib/billing/products";
import {
  captureServerEvent,
  flushAnalyticsServer,
  type ServerEventName,
} from "@/lib/analytics-server";
import { sendReportPurchaseEmail } from "@/lib/report/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deterministic UUID from a stable seed so PostHog dedupes replays/concurrent
 *  deliveries (same shape as clerkWebhookEventId). */
function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/** Privacy-preserving stable handle for a guest buyer's analytics identity —
 *  the raw email never reaches PostHog. */
function guestDistinctId(email: string): string {
  return `guest-${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
}

function asString(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

/** current_period_end moved onto subscription items in recent Stripe API
 *  versions; read it from there, falling back to the legacy top-level field. */
function subPeriodEnd(sub: Stripe.Subscription): Date {
  const item = sub.items?.data?.[0] as
    | { current_period_end?: number }
    | undefined;
  const ts =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  return ts ? new Date(ts * 1000) : new Date();
}

interface Owner {
  organizationId: string | null;
  guestEmail: string | null;
}

function ownerFromMetadata(
  metadata: Stripe.Metadata | null,
  fallbackEmail: string | null
): Owner {
  const organizationId = metadata?.organizationId || null;
  // Prefer the org when a signed-in user bought; else the guest email Stripe
  // collected at checkout.
  const guestEmail = organizationId ? null : fallbackEmail?.toLowerCase() || null;
  return { organizationId, guestEmail };
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET env var missing");
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return Response.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Layer 1: fast-path skip if we've already fully processed this event.
  const already = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
    select: { id: true },
  });
  if (already) {
    return Response.json({ received: true, duplicate: true });
  }

  // Process. On failure, DO NOT write the ledger — return 500 so Stripe
  // retries and the (idempotent) handler reprocesses cleanly.
  try {
    await dispatch(event);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { webhook: "stripe", event_type: event.type, event_id: event.id },
    });
    console.error(`[stripe/webhook] handler for ${event.type} threw:`, err);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  // Success → record the ledger (best-effort; a concurrent delivery may have
  // beaten us to it — harmless, the grant upserts already converged).
  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch {
    /* unique-violation race — ignore */
  }

  // Flush PostHog before the lambda freezes (same reason as the Clerk hook).
  await flushAnalyticsServer();
  return Response.json({ received: true });
}

async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
        event.id
      );
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(
        event.data.object as Stripe.Subscription,
        event.id
      );
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionCanceled(
        event.data.object as Stripe.Subscription
      );
      return;
    default:
      // Unknown/uninteresting type — 200 so Stripe stops retrying.
      return;
  }
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string
): Promise<void> {
  const kind = session.metadata?.kind as ProductKind | undefined;
  if (!kind) return; // not one of our sessions

  const email = session.customer_details?.email ?? null;
  const { organizationId, guestEmail } = ownerFromMetadata(
    session.metadata,
    email
  );
  const userId = session.metadata?.userId || null;
  const partner = session.metadata?.partner || null;

  // Can't grant to nobody (should never happen — org set, or Stripe collected
  // an email). Record for diagnosis and stop; returning cleanly (not throwing)
  // avoids an unresolvable retry loop.
  if (!organizationId && !guestEmail) {
    console.error(
      `[stripe/webhook] checkout ${session.id} has no owner (kind=${kind})`
    );
    return;
  }

  // Persist the Stripe customer link (best-effort, idempotent).
  const stripeCustomerId = asString(session.customer);
  if (stripeCustomerId) {
    await prisma.stripeCustomer.upsert({
      where: { stripeCustomerId },
      create: { stripeCustomerId, organizationId, userId, email: guestEmail ?? email },
      update: { email: guestEmail ?? email ?? undefined },
    });
  }

  let event: ServerEventName | null = null;
  if (kind === "single_report") {
    const pmSlug = session.metadata?.pmSlug;
    if (!pmSlug) throw new Error(`single_report session ${session.id} missing pmSlug`);
    await prisma.reportEntitlement.upsert({
      where: { stripeSessionId: session.id },
      create: { pmSlug, organizationId, guestEmail, stripeSessionId: session.id },
      update: {},
    });
    event = "report_purchased";
  } else if (kind === "market_pass") {
    const marketId = session.metadata?.marketId;
    if (!marketId) throw new Error(`market_pass session ${session.id} missing marketId`);
    const expiresAt = new Date(Date.now() + MARKET_PASS_DAYS * 24 * 60 * 60 * 1000);
    await prisma.marketPass.upsert({
      where: { stripeSessionId: session.id },
      create: { marketId, organizationId, guestEmail, stripeSessionId: session.id, expiresAt },
      update: {},
    });
    event = "market_pass_purchased";
  } else if (kind === "subscription") {
    // The Subscription row is authored by customer.subscription.* events,
    // which carry status + period end. Nothing to grant here.
    event = null;
  }

  // Deliver the buyer's access links by email (best-effort — the grant above
  // is the source of truth; a failed send never blocks the webhook). Stripe
  // always collects an email at Checkout, so `email` is present for guest and
  // org buyers alike.
  const recipient = (email ?? guestEmail) || null;
  if (recipient && (kind === "single_report" || kind === "market_pass")) {
    const pmSlug = session.metadata?.pmSlug || null;
    const marketId = session.metadata?.marketId || null;
    const [pm, market] = await Promise.all([
      kind === "single_report" && pmSlug
        ? prisma.pM.findUnique({ where: { slug: pmSlug }, select: { name: true } })
        : Promise.resolve(null),
      kind === "market_pass" && marketId
        ? prisma.market.findUnique({ where: { id: marketId }, select: { fullName: true } })
        : Promise.resolve(null),
    ]);
    await sendReportPurchaseEmail({
      email: recipient,
      kind,
      pmSlug,
      pmName: pm?.name ?? null,
      marketName: market?.fullName ?? null,
    });
  }

  if (event) {
    captureServerEvent({
      userId,
      anonymousId: guestEmail ? guestDistinctId(guestEmail) : null,
      event,
      eventId: deterministicUuid(`stripe:${eventId}:posthog`),
      properties: {
        pmSlug: session.metadata?.pmSlug || null,
        marketId: session.metadata?.marketId || null,
        partner,
        buyer: organizationId ? "org" : "guest",
      },
    });
  }
}

async function handleSubscriptionUpsert(
  sub: Stripe.Subscription,
  eventId: string
): Promise<void> {
  const organizationId = sub.metadata?.organizationId || null;
  const userId = sub.metadata?.userId || null;
  const guestEmail = organizationId ? null : sub.metadata?.guestEmail?.toLowerCase() || null;
  const priceId = sub.items?.data?.[0]?.price?.id ?? "";
  const stripeCustomerId = asString(sub.customer) ?? "";

  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
    select: { id: true },
  });

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: sub.id },
    create: {
      stripeSubscriptionId: sub.id,
      stripeCustomerId,
      organizationId,
      userId,
      guestEmail,
      status: sub.status,
      priceId,
      currentPeriodEnd: subPeriodEnd(sub),
    },
    update: {
      status: sub.status,
      priceId,
      currentPeriodEnd: subPeriodEnd(sub),
    },
  });

  // Fire "started" only on the first transition into active (create path),
  // not on every renewal/update.
  if (!existing && sub.status === "active") {
    captureServerEvent({
      userId,
      anonymousId: guestEmail ? guestDistinctId(guestEmail) : null,
      event: "subscription_started",
      eventId: deterministicUuid(`stripe:${eventId}:posthog`),
      properties: { buyer: organizationId ? "org" : "guest" },
    });
  }
}

async function handleSubscriptionCanceled(
  sub: Stripe.Subscription
): Promise<void> {
  // Mark canceled if we mirror it; ignore unknown subscriptions.
  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
    select: { id: true },
  });
  if (!existing) return;
  await prisma.subscription.update({
    where: { stripeSubscriptionId: sub.id },
    data: { status: "canceled" },
  });
}
