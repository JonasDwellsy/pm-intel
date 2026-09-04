// v0.33 — Consumer product catalog. TWO one-time SKUs.
//
// Each maps to a Stripe Price created out-of-band in the Stripe dashboard and
// referenced here by env var (never hard-coded — test and live prices differ
// per environment, same pattern as every other secret in this repo).
//
// `credits` is the join key to what a completed checkout grants (see
// src/app/api/stripe/webhook/route.ts):
//   single_report → 1 credit, redeemed immediately for the PM in metadata
//   three_pack    → 3 credits, redeemable whenever the buyer chooses
//
// WHY NO RECURRING SKU. A $19/mo "Keep Watching" product used to sit here.
// Two reasons it is gone. Monitoring — "we tell you when an operator's rating
// moves" — is the enterprise product's central claim, so selling it at any
// consumer price undercuts the thing enterprise charges thousands for. And its
// access path was broken: `Subscription` carried no marketId and the resolver
// filtered only on status, so one $19 subscription unlocked all 44 markets.
//
// WHY NO MARKET PASS. $49 for every operator in a market for 30 days
// dominated $149-per-operator, making the ladder incoherent. A whole-market
// consumer product may come back later, priced deliberately.
//
// Prices below are DISPLAY ONLY (marketing copy, receipts). The charged amount
// is whatever the Stripe Price says — Stripe is the source of truth for money.

export type ProductKind = "single_report" | "three_pack";

export interface BillingProduct {
  kind: ProductKind;
  /** Human label for CTAs / receipts. */
  label: string;
  /** Short tagline for the purchase surface. */
  blurb: string;
  /** Display price in whole USD. Stripe is authoritative for the charge. */
  priceUsd: number;
  /** Report credits this SKU grants. */
  credits: number;
  /** Stripe Checkout mode. Both SKUs are one-time. */
  stripeMode: "payment";
  /** Name of the env var holding this SKU's Stripe Price id. */
  priceEnvVar: string;
}

export const PRODUCTS: Record<ProductKind, BillingProduct> = {
  single_report: {
    kind: "single_report",
    label: "Single Report",
    blurb: "Full scorecard for one property manager — web + PDF, yours to keep.",
    priceUsd: 149,
    credits: 1,
    stripeMode: "payment",
    priceEnvVar: "STRIPE_PRICE_REPORT",
  },
  three_pack: {
    kind: "three_pack",
    label: "Three-Report Pack",
    blurb: "Three full scorecards, redeemable whenever you choose.",
    priceUsd: 299,
    credits: 3,
    stripeMode: "payment",
    priceEnvVar: "STRIPE_PRICE_THREE_PACK",
  },
};

/** Report credits granted by one purchase of this SKU. */
export function creditsFor(kind: ProductKind): number {
  return PRODUCTS[kind].credits;
}

// Small-number word forms for shortlist copy ("Three reports for $299").
// Falls back to the numeral for anything not spelled out here, so the copy
// degrades gracefully instead of lying if a pack's credit count ever changes.
const COUNT_WORDS: Record<number, string> = {
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
};

/** Word form of a small credit count, for pack-offer copy. */
export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/** Resolve the Stripe Price id for a SKU from env. Throws (loud) if unset — a
 *  checkout can't proceed without it and a silent fallback would charge the
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
 *  without trusting client-supplied metadata alone. Returns null if the price
 *  id matches no configured SKU. */
export function productForPriceId(priceId: string): ProductKind | null {
  for (const p of Object.values(PRODUCTS)) {
    if (process.env[p.priceEnvVar] === priceId) return p.kind;
  }
  return null;
}
