import "server-only";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { ALL_MARKETS, computeEntitlement, type MarketEntitlement } from "@/lib/auth/market-entitlements";
import {
  ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES,
  marketIqCapabilitiesForPlan,
  type MarketIqCapabilities,
} from "@/lib/market-iq/billing/plans";
import { prisma } from "@/lib/prisma";

export type MarketIqCommercialAccess = {
  hasProduct: boolean;
  entitlement: MarketEntitlement;
  source: "admin" | "subscription" | "legacy" | "none";
  planKey: string | null;
  capabilities: MarketIqCapabilities;
};

const NO_CAPABILITIES: MarketIqCapabilities = {
  viewMarketIntelligence: false,
  publishClientReports: false,
  manageRecipients: false,
  sendReports: false,
  useRecurringEditions: false,
};

const FULL_CAPABILITIES: MarketIqCapabilities = {
  viewMarketIntelligence: true,
  publishClientReports: true,
  manageRecipients: true,
  sendReports: true,
  useRecurringEditions: true,
};

/**
 * Organization-level access check for background jobs and readiness screens.
 * Unlike the request-time resolver, this never applies the viewer admin bypass.
 * An active subscription is authoritative; legacy enterprise grants are used
 * only when the organization has no active Market IQ subscription.
 */
export async function organizationHasMarketIqAccess(organizationId: string, marketId: string): Promise<boolean> {
  const subscriptions = await prisma.marketIqSubscription.findMany({
    where: { organizationId, status: { in: [...ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES] } },
    select: { planKey: true, markets: { select: { marketId: true } } },
  });
  if (subscriptions.length > 0) {
    return subscriptions.some((subscription) => subscription.markets.some((market) => market.marketId === marketId));
  }
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      allMarkets: true,
      marketAccess: { where: { marketId }, select: { id: true }, take: 1 },
      productAccess: { where: { productKey: "market_iq" }, select: { id: true }, take: 1 },
    },
  });
  return Boolean(
    organization
    && organization.productAccess.length > 0
    && (organization.allMarkets || organization.marketAccess.length > 0),
  );
}

export async function organizationHasMarketIqCapability(
  organizationId: string,
  marketId: string,
  capability: keyof MarketIqCapabilities,
): Promise<boolean> {
  const subscriptions = await prisma.marketIqSubscription.findMany({
    where: {
      organizationId,
      status: { in: [...ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES] },
      markets: { some: { marketId } },
    },
    select: { planKey: true },
  });
  if (subscriptions.length) {
    return subscriptions.some((subscription) => marketIqCapabilitiesForPlan(subscription.planKey)[capability]);
  }
  return (await organizationHasMarketIqAccess(organizationId, marketId)) ? FULL_CAPABILITIES[capability] : false;
}

/**
 * Resolve Market IQ without changing Operator IQ's authorization behavior.
 * Active commercial subscriptions use only the markets attached to those
 * subscriptions. Legacy pilot grants remain a separate fallback when an
 * organization has no active commercial subscription.
 */
export async function resolveViewerMarketIqAccess(): Promise<MarketIqCommercialAccess> {
  const { userId, organizationId } = await getActiveOrgContext();
  if (isAdminUser(userId)) return { hasProduct: true, entitlement: ALL_MARKETS, source: "admin", planKey: null, capabilities: FULL_CAPABILITIES };
  if (!userId || !organizationId) return { hasProduct: false, entitlement: new Set<string>(), source: "none", planKey: null, capabilities: NO_CAPABILITIES };

  const subscriptions = await prisma.marketIqSubscription.findMany({
    where: {
      organizationId,
      status: { in: [...ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES] },
    },
    select: { planKey: true, markets: { select: { marketId: true } } },
  });
  if (subscriptions.length > 0) {
    const capabilities = subscriptions
      .map((subscription) => marketIqCapabilitiesForPlan(subscription.planKey))
      .reduce<MarketIqCapabilities>((combined, current) => ({
        viewMarketIntelligence: combined.viewMarketIntelligence || current.viewMarketIntelligence,
        publishClientReports: combined.publishClientReports || current.publishClientReports,
        manageRecipients: combined.manageRecipients || current.manageRecipients,
        sendReports: combined.sendReports || current.sendReports,
        useRecurringEditions: combined.useRecurringEditions || current.useRecurringEditions,
      }), NO_CAPABILITIES);
    const advisorySubscription = subscriptions.find((subscription) => marketIqCapabilitiesForPlan(subscription.planKey).publishClientReports);
    return {
      hasProduct: true,
      entitlement: computeEntitlement({
        isAdmin: false,
        allMarkets: false,
        grantedMarketIds: subscriptions.flatMap((subscription) => subscription.markets.map((market) => market.marketId)),
      }),
      source: "subscription",
      planKey: advisorySubscription?.planKey ?? subscriptions[0]?.planKey ?? null,
      capabilities,
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
    return { hasProduct: false, entitlement: new Set<string>(), source: "none", planKey: null, capabilities: NO_CAPABILITIES };
  }
  return {
    hasProduct: true,
    entitlement: computeEntitlement({
      isAdmin: false,
      allMarkets: organization.allMarkets,
      grantedMarketIds: organization.marketAccess.map((market) => market.marketId),
    }),
    source: "legacy",
    planKey: null,
    capabilities: FULL_CAPABILITIES,
  };
}
