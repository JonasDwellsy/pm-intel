export const MARKET_IQ_SINGLE_MARKET_PLAN = {
  key: "single_market_monthly",
  name: "Market IQ, one market",
  monthlyPriceCents: 19_900,
  currency: "usd",
} as const;

export const ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
] as const;

export function isActiveMarketIqSubscriptionStatus(status: string): boolean {
  return (ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

export function marketIqPlanPriceLabel(cents = MARKET_IQ_SINGLE_MARKET_PLAN.monthlyPriceCents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: MARKET_IQ_SINGLE_MARKET_PLAN.currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
