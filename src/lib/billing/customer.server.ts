// v0.32 — Resolve the current viewer's billing identity (Stripe customer +
// subscription) for the consumer account/portal surface. Guest-or-org, keyed
// exactly like the entitlement resolver: a signed-in workspace user by
// organizationId/userId, a guest by a verified magic-link email. Only ever
// returns a customer the requester actually owns, so it's safe to hand the id
// straight to a Stripe Billing Portal session.

import "server-only";
import { prisma } from "@/lib/prisma";
import { getActiveOrgContext } from "@/lib/auth/active-org";

export interface ViewerBilling {
  stripeCustomerId: string | null;
  subscription: {
    status: string;
    currentPeriodEnd: Date;
    priceId: string;
  } | null;
}

export async function resolveViewerBilling(
  guestEmail?: string | null
): Promise<ViewerBilling> {
  const email = guestEmail?.trim().toLowerCase() || null;
  const { userId, organizationId } = await getActiveOrgContext();

  // StripeCustomer owner columns: organizationId | userId | email.
  const customerOwners = [
    organizationId ? { organizationId } : undefined,
    userId ? { userId } : undefined,
    email ? { email } : undefined,
  ].filter(Boolean) as object[];
  // Subscription owner columns: organizationId | userId | guestEmail.
  const subOwners = [
    organizationId ? { organizationId } : undefined,
    userId ? { userId } : undefined,
    email ? { guestEmail: email } : undefined,
  ].filter(Boolean) as object[];

  if (customerOwners.length === 0 && subOwners.length === 0) {
    return { stripeCustomerId: null, subscription: null };
  }

  const [cust, sub] = await Promise.all([
    customerOwners.length
      ? prisma.stripeCustomer.findFirst({
          where: { OR: customerOwners },
          select: { stripeCustomerId: true },
        })
      : Promise.resolve(null),
    subOwners.length
      ? prisma.subscription.findFirst({
          where: { OR: subOwners },
          orderBy: { currentPeriodEnd: "desc" },
          select: {
            status: true,
            currentPeriodEnd: true,
            priceId: true,
            stripeCustomerId: true,
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    stripeCustomerId: cust?.stripeCustomerId ?? sub?.stripeCustomerId ?? null,
    subscription: sub
      ? {
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd,
          priceId: sub.priceId,
        }
      : null,
  };
}
