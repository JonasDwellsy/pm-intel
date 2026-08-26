// v0.30 — Consumer product catalog for the single-report funnel.
//
// Three SKUs, each mapped to a Stripe Price created out-of-band in the Stripe
// dashboard and referenced here by env var (never hard-coded — test vs live
// prices differ per environment, same pattern as every other secret in this
// repo which is read straight from process.env).
//
// The `kind` is the join key to the entitlement granted on
// checkout.session.completed (see src/app/api/stripe/webhook/route.ts):
//   single_report → ReportEntitlement   (per-PM, permanent)
//   market_pass   → MarketPass          (whole market, 30 days)
//   subscription  → Subscription        ($19/mo, whole market while active)
//
// Prices below are DISPLAY ONLY (marketing copy, receipts). The charged
// amount is whatever the Stripe Price says — Stripe is the source of truth
// for money.

export type ProductKind = "single_report" | "market_pass" | "subscription";

export interface BillingProduct {
  kind: ProductKind;
  /** Human label for CTAs / receipts. */
  label: string;
  /** Short tagline for the pricing surface. */
  blurb: string;
  /** Display price in whole USD. Stripe is authoritative for the charge. */
  priceUsd: number;
  /** Billing cadence, for copy ("one-time" / "30-day" / "per month"). */
  cadence: "one_time" | "one_time_30d" | "monthly";
  /** Stripe Checkout mode this SKU uses. */
  stripeMode: "payment" | "subscription";
  /** Name of the env var holding this SKU's Stripe Price id. */
  priceEnvVar: string;
  /** Whether the buyer picks a single PM (report) or a market (pass/sub). */
  target: "pm" | "market";
}

export const PRODUCTS: Record<ProductKind, BillingProduct> = {
  single_report: {
    kind: "single_report",
    label: "Single Report",
    blurb: "Full scorecard for one property manager — web + PDF.",
    priceUsd: 29,
    cadence: "one_time",
    stripeMode: "payment",
    priceEnvVar: "STRIPE_PRICE_REPORT",
    target: "pm",
  },
  market_pass: {
    kind: "market_pass",
    label: "30-Day Market Pass",
    blurb: "Compare every operator in your market for 30 days.",
    priceUsd: 49,
    cadence: "one_time_30d",
    stripeMode: "payment",
    priceEnvVar: "STRIPE_PRICE_MARKET_PASS",
    target: "market",
  },
  subscription: {
    kind: "subscription",
    label: "Keep Watching",
    blurb: "Ongoing market access, cancel anytime.",
    priceUsd: 19,
    cadence: "monthly",
    stripeMode: "subscription",
    priceEnvVar: "STRIPE_PRICE_SUBSCRIPTION",
    target: "market",
  },
};

/** Duration of a market pass, in days. Grant time = now + this. */
export const MARKET_PASS_DAYS = 30;

/** Resolve the Stripe Price id for a SKU from env. Throws (loud) if unset —
 *  a checkout can't proceed without it and a silent fallback would charge the
 *  wrong price. */
export function resolvePriceId(kind: ProductKind): string {
  const envVar = PRODUCTS[kind].priceEnvVar;
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(`${envVar} is not configured (Stripe Price for ${kind})`);
  }
  return priceId;
}

/** Reverse lookup: which SKU does a given Stripe Price id correspond to?
 *  Used by the webhook to map a completed session back to a product kind
 *  without trusting client-supplied metadata alone. Returns null if the
 *  price id matches no configured SKU. */
export function productForPriceId(priceId: string): ProductKind | null {
  for (const p of Object.values(PRODUCTS)) {
    if (process.env[p.priceEnvVar] === priceId) return p.kind;
  }
  return null;
}
