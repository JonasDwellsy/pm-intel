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
//   2. Natural-key writes — the actual correctness guarantee, independent of
//      the ledger: ReportEntitlement's (pmSlug, organizationId)/(pmSlug,
//      guestEmail) composite uniques (createMany + skipDuplicates) for a
//      single_report, and ReportCredit's (stripeSessionId, slot) unique for
//      a three_pack mint. Reprocessing the same session is a no-op.
//
// v0.33 — two one-time SKUs only (single_report, three_pack). No recurring
// product: subscriptions and the market pass are gone, along with the event
// dispatch that used to mirror subscription lifecycle updates. See
// src/lib/billing/products.ts for why.

import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { creditsFor, type ProductKind } from "@/lib/billing/products";
import { mintCredits, redeemCredit } from "@/lib/billing/credits.server";
import type { CreditOwner } from "@/lib/billing/credits";
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

  const owner: CreditOwner = { organizationId, guestEmail };
  const pmSlug = session.metadata?.pmSlug || null;
  let event: ServerEventName;
  let redeemedNow = false;
  let redeemReason: string | null = null;

  if (kind === "single_report") {
    if (!pmSlug) throw new Error(`single_report session ${session.id} missing pmSlug`);
    // createMany + skipDuplicates rather than upsert: the (pmSlug, owner)
    // composite uniques make this idempotent without branching on which
    // owner column is set, and stripeSessionId is no longer unique.
    await prisma.reportEntitlement.createMany({
      data: [{ pmSlug, organizationId, guestEmail, stripeSessionId: session.id }],
      skipDuplicates: true,
    });
    event = "report_purchased";
  } else {
    // three_pack — mint the credits, then redeem one immediately if the buyer
    // came from an operator's report page. Bought from the landing page there
    // is no operator yet and all three stay unredeemed.
    await mintCredits({
      owner,
      stripeSessionId: session.id,
      count: creditsFor(kind),
    });
    if (pmSlug) {
      // Not fatal if this fails — the credits exist and the buyer can redeem
      // from the account wallet.
      const res = await redeemCredit(owner, pmSlug);
      redeemedNow = res.ok;
      if (!res.ok) {
        redeemReason = res.reason;
        console.warn(
          `[stripe/webhook] pack ${session.id}: immediate redeem of ${pmSlug} returned ${res.reason}`
        );
      }
    }
    event = "pack_purchased";
  }

  // Deliver the buyer's access links by email (best-effort — the grant above
  // is the source of truth; a failed send never blocks the webhook). Stripe
  // always collects an email at Checkout, so `email` is present for guest and
  // org buyers alike.
  const recipient = (email ?? guestEmail) || null;
  if (recipient) {
    const pm = pmSlug
      ? await prisma.pM.findUnique({ where: { slug: pmSlug }, select: { name: true } })
      : null;
    // The email branches on pmSlug being present to say "Your report is
    // ready" with a direct link to it — that promise is only true if the
    // buyer can actually open pmSlug's report right now. A three_pack whose
    // immediate redeem failed with no_credits leaves no entitlement for
    // pmSlug (replayed delivery after all credits are spent, or a claim
    // race), so gate on real access rather than on pmSlug's mere presence:
    // an email that says "ready" and lands on the teaser is worse than the
    // generic "you have N reports to use" copy the module falls back to
    // when pmSlug is null.
    const hasPmReportAccess = !pmSlug
      ? false
      : kind === "single_report"
        ? true
        : redeemedNow || redeemReason === "already_owned";
    await sendReportPurchaseEmail({
      email: recipient,
      kind,
      pmSlug: hasPmReportAccess ? pmSlug : null,
      pmName: pm?.name ?? null,
      // Key off the actual redemption result: a failed immediate redeem leaves
      // all three credits unspent, so don't subtract 1.
      creditsRemaining:
        kind === "three_pack" ? creditsFor(kind) - (redeemedNow ? 1 : 0) : 0,
    });
  }

  captureServerEvent({
    userId,
    anonymousId: guestEmail ? guestDistinctId(guestEmail) : null,
    event,
    eventId: deterministicUuid(`stripe:${eventId}:posthog`),
    properties: {
      pmSlug,
      partner,
      buyer: organizationId ? "org" : "guest",
      credits: creditsFor(kind),
    },
  });
}
