import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe.server";
import { syncStripeMarketIqSubscription } from "@/lib/market-iq/billing/provisioning.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function processEvent(event: Stripe.Event) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (subscriptionId) await syncStripeMarketIqSubscription(await getStripe().subscriptions.retrieve(subscriptionId));
    return;
  }
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await syncStripeMarketIqSubscription(event.data.object);
  }
}

export async function POST(request: Request) {
  const webhookSecret =
    process.env.STRIPE_MARKET_IQ_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return new Response("Webhook not configured", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe signature", { status: 400 });
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return new Response("Invalid Stripe signature", { status: 400 });
  }

  const existing = await prisma.marketIqBillingEvent.findUnique({ where: { stripeEventId: event.id } });
  if (existing?.status === "processed") return Response.json({ received: true, duplicate: true });
  await prisma.marketIqBillingEvent.upsert({
    where: { stripeEventId: event.id },
    create: { stripeEventId: event.id, eventType: event.type, status: "processing" },
    update: { eventType: event.type, status: "processing", error: null },
  });
  try {
    await processEvent(event);
    await prisma.marketIqBillingEvent.update({
      where: { stripeEventId: event.id },
      data: { status: "processed", processedAt: new Date(), error: null },
    });
    return Response.json({ received: true });
  } catch (error) {
    await prisma.marketIqBillingEvent.update({
      where: { stripeEventId: event.id },
      data: { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Unknown billing error" },
    });
    return new Response("Billing event processing failed", { status: 500 });
  }
}
