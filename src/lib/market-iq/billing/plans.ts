export const MARKET_IQ_INTELLIGENCE_PLAN = {
  key: "market_intelligence_monthly",
  name: "Market IQ Intelligence",
  description: "Internal rental-market intelligence for one market.",
  monthlyPriceCents: 7_900,
  foundingMonthlyPriceCents: 4_900,
  currency: "usd",
  tier: "intelligence",
} as const;

export const MARKET_IQ_CLIENT_ADVISORY_PLAN = {
  key: "market_client_advisory_monthly",
  name: "Market IQ Client Advisory",
  description: "PM-branded publishing and distribution for one market.",
  monthlyPriceCents: 19_900,
  foundingMonthlyPriceCents: 14_900,
  currency: "usd",
  tier: "client_advisory",
} as const;

// Backward-compatible plan key for subscriptions created before two-tier
// packaging. It retains the complete Client Advisory capability set.
export const MARKET_IQ_LEGACY_SINGLE_MARKET_PLAN_KEY = "single_market_monthly";
export const MARKET_IQ_SINGLE_MARKET_PLAN = MARKET_IQ_CLIENT_ADVISORY_PLAN;

export const MARKET_IQ_PLANS = [
  MARKET_IQ_INTELLIGENCE_PLAN,
  MARKET_IQ_CLIENT_ADVISORY_PLAN,
] as const;

export type MarketIqPlanKey = typeof MARKET_IQ_PLANS[number]["key"];
export type MarketIqPlanTier = typeof MARKET_IQ_PLANS[number]["tier"];

export type MarketIqCapabilities = {
  viewMarketIntelligence: boolean;
  publishClientReports: boolean;
  manageRecipients: boolean;
  sendReports: boolean;
  useRecurringEditions: boolean;
};

const INTELLIGENCE_CAPABILITIES: MarketIqCapabilities = {
  viewMarketIntelligence: true,
  publishClientReports: false,
  manageRecipients: false,
  sendReports: false,
  useRecurringEditions: false,
};

const CLIENT_ADVISORY_CAPABILITIES: MarketIqCapabilities = {
  viewMarketIntelligence: true,
  publishClientReports: true,
  manageRecipients: true,
  sendReports: true,
  useRecurringEditions: true,
};

export function marketIqPlanForKey(planKey: string | null | undefined) {
  if (planKey === MARKET_IQ_LEGACY_SINGLE_MARKET_PLAN_KEY) return MARKET_IQ_CLIENT_ADVISORY_PLAN;
  return MARKET_IQ_PLANS.find((plan) => plan.key === planKey) ?? null;
}

export function marketIqCapabilitiesForPlan(planKey: string | null | undefined): MarketIqCapabilities {
  const plan = marketIqPlanForKey(planKey);
  if (!plan) {
    return {
      viewMarketIntelligence: false,
      publishClientReports: false,
      manageRecipients: false,
      sendReports: false,
      useRecurringEditions: false,
    };
  }
  return plan.tier === "client_advisory" ? CLIENT_ADVISORY_CAPABILITIES : INTELLIGENCE_CAPABILITIES;
}

export function marketIqHasCapability(
  capabilities: MarketIqCapabilities,
  capability: keyof MarketIqCapabilities,
) {
  return capabilities[capability];
}

export const ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
] as const;

export function isActiveMarketIqSubscriptionStatus(status: string): boolean {
  return (ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

export function marketIqPlanPriceLabel(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: MARKET_IQ_INTELLIGENCE_PLAN.currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
