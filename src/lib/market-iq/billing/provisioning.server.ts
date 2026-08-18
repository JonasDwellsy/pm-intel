import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { isMarketIqBillingInterval, MARKET_IQ_CLIENT_ADVISORY_PLAN, marketIqPlanForKey, type MarketIqBillingInterval, type MarketIqPlanKey } from "@/lib/market-iq/billing/plans";
import { marketIqJourneyEventData, marketIqMilestoneDedupeKey } from "@/lib/market-iq/journey-telemetry.server";

function dateFromUnix(value: number | null | undefined): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

function stripeSubscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const periodEnds = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");
  return periodEnds.length ? dateFromUnix(Math.max(...periodEnds)) : null;
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function stripeBillingInterval(subscription: Stripe.Subscription): MarketIqBillingInterval {
  const recurringInterval = subscription.items.data[0]?.price.recurring?.interval;
  if (recurringInterval === "month" || recurringInterval === "year") return recurringInterval as MarketIqBillingInterval;
  const metadataInterval = subscription.metadata.dwellsy_billing_interval;
  if (metadataInterval && isMarketIqBillingInterval(metadataInterval)) return metadataInterval;
  return "month";
}

export async function provisionEnterpriseMarketIq(input: {
  organizationId: string;
  marketId: string;
  planKey: MarketIqPlanKey;
  provisionedByUserId: string;
}) {
  if (!marketIqPlanForKey(input.planKey)) throw new Error("Unknown Market IQ plan.");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.marketIqSubscription.findFirst({
      where: { organizationId: input.organizationId, source: "enterprise" },
      orderBy: { createdAt: "desc" },
    });
    const subscription = existing
      ? await tx.marketIqSubscription.update({
          where: { id: existing.id },
          data: {
            status: "active",
            planKey: input.planKey,
            provisionedByUserId: input.provisionedByUserId,
            startedAt: existing.startedAt ?? new Date(),
            endedAt: null,
            cancelAtPeriodEnd: false,
          },
        })
      : await tx.marketIqSubscription.create({
          data: {
            organizationId: input.organizationId,
            source: "enterprise",
            status: "active",
            provisionedByUserId: input.provisionedByUserId,
            startedAt: new Date(),
            planKey: input.planKey,
          },
        });
    await tx.marketIqSubscriptionMarket.deleteMany({ where: { subscriptionId: subscription.id } });
    await tx.marketIqSubscriptionMarket.create({ data: { subscriptionId: subscription.id, marketId: input.marketId } });
    await tx.marketIqJourneyEvent.createMany({
      data: [marketIqJourneyEventData({
        organizationId: input.organizationId,
        actorUserId: input.provisionedByUserId,
        eventKey: "commercial_access_activated",
        milestone: "access",
        sourceRoute: "/admin/organizations",
        subjectId: subscription.id,
        dedupeKey: marketIqMilestoneDedupeKey(input.organizationId, "access"),
        metadata: { source: "enterprise", planKey: input.planKey, marketId: input.marketId },
      })],
      skipDuplicates: true,
    });
    return subscription;
  });
}

export async function endEnterpriseMarketIq(input: {
  organizationId: string;
  subscriptionId: string;
}) {
  return prisma.marketIqSubscription.updateMany({
    where: {
      id: input.subscriptionId,
      organizationId: input.organizationId,
      source: "enterprise",
      status: { not: "canceled" },
    },
    data: { status: "canceled", endedAt: new Date(), cancelAtPeriodEnd: false },
  });
}

export async function syncStripeMarketIqSubscription(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata.dwellsy_organization_id;
  const marketId = subscription.metadata.dwellsy_market_id;
  if (!organizationId || !marketId) {
    const existing = await prisma.marketIqSubscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
      include: { markets: { take: 1 } },
    });
    if (!existing || !existing.markets[0]) {
      throw new Error(`Stripe subscription ${subscription.id} is missing Market IQ entitlement metadata.`);
    }
    return syncStripeMarketIqSubscriptionWithContext(subscription, existing.organizationId, existing.markets[0].marketId);
  }
  return syncStripeMarketIqSubscriptionWithContext(subscription, organizationId, marketId);
}

async function syncStripeMarketIqSubscriptionWithContext(
  subscription: Stripe.Subscription,
  organizationId: string,
  marketId: string,
) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!organization) throw new Error(`Unknown Market IQ organization ${organizationId}.`);
  const customerId = stripeId(subscription.customer);
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const billingInterval = stripeBillingInterval(subscription);
  const endedAt = subscription.status === "canceled" || subscription.status === "unpaid" ? new Date() : null;
  const planKey = subscription.metadata.dwellsy_plan_key || MARKET_IQ_CLIENT_ADVISORY_PLAN.key;
  if (!marketIqPlanForKey(planKey)) throw new Error(`Stripe subscription ${subscription.id} has an unknown Market IQ plan.`);

  return prisma.$transaction(async (tx) => {
    const row = await tx.marketIqSubscription.upsert({
      where: { stripeSubscriptionId: subscription.id },
      create: {
        organizationId,
        source: "stripe",
        status: subscription.status,
        planKey,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        billingInterval,
        currentPeriodEnd: stripeSubscriptionPeriodEnd(subscription),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        startedAt: dateFromUnix(subscription.start_date) ?? new Date(),
        endedAt,
      },
      update: {
        status: subscription.status,
        planKey,
        stripeCustomerId: customerId,
        stripePriceId: priceId,
        billingInterval,
        currentPeriodEnd: stripeSubscriptionPeriodEnd(subscription),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        endedAt,
      },
    });
    await tx.marketIqSubscriptionMarket.upsert({
      where: { subscriptionId_marketId: { subscriptionId: row.id, marketId } },
      create: { subscriptionId: row.id, marketId },
      update: {},
    });
    if (subscription.status === "active" || subscription.status === "trialing") {
      await tx.marketIqJourneyEvent.createMany({
        data: [marketIqJourneyEventData({
          organizationId,
          eventKey: "commercial_access_activated",
          milestone: "access",
          sourceRoute: "/api/market-iq/billing/webhook",
          subjectId: row.id,
          dedupeKey: marketIqMilestoneDedupeKey(organizationId, "access"),
          metadata: { source: "stripe", planKey, billingInterval, marketId },
        })],
        skipDuplicates: true,
      });
    }
    return row;
  });
}
