import "server-only";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { ALL_MARKETS, computeEntitlement, type MarketEntitlement } from "@/lib/auth/market-entitlements";
import { ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES } from "@/lib/market-iq/billing/plans";
import { prisma } from "@/lib/prisma";

export type MarketIqCommercialAccess = {
  hasProduct: boolean;
  entitlement: MarketEntitlement;
  source: "admin" | "subscription" | "legacy" | "none";
};

/**
 * Resolve Market IQ without changing Operator IQ's authorization behavior.
 * Active commercial subscriptions use only the markets attached to those
 * subscriptions. Legacy pilot grants remain a separate fallback when an
 * organization has no active commercial subscription.
 */
export async function resolveViewerMarketIqAccess(): Promise<MarketIqCommercialAccess> {
  const { userId, organizationId } = await getActiveOrgContext();
  if (isAdminUser(userId)) return { hasProduct: true, entitlement: ALL_MARKETS, source: "admin" };
  if (!userId || !organizationId) return { hasProduct: false, entitlement: new Set<string>(), source: "none" };

  const subscriptions = await prisma.marketIqSubscription.findMany({
    where: {
      organizationId,
      status: { in: [...ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES] },
    },
    select: { markets: { select: { marketId: true } } },
  });
  if (subscriptions.length > 0) {
    return {
      hasProduct: true,
      entitlement: computeEntitlement({
        isAdmin: false,
        allMarkets: false,
        grantedMarketIds: subscriptions.flatMap((subscription) => subscription.markets.map((market) => market.marketId)),
      }),
      source: "subscription",
    };
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      allMarkets: true,
      marketAccess: { select: { marketId: true } },
      productAccess: { where: { productKey: "market_iq" }, select: { id: true }, take: 1 },
    },
  });
  if (!organization || organization.productAccess.length === 0) {
    return { hasProduct: false, entitlement: new Set<string>(), source: "none" };
  }
  return {
    hasProduct: true,
    entitlement: computeEntitlement({
      isAdmin: false,
      allMarkets: organization.allMarkets,
      grantedMarketIds: organization.marketAccess.map((market) => market.marketId),
    }),
    source: "legacy",
  };
}
