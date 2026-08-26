// v0.30 — Stripe client singleton (server-only).
//
// Lazy singleton, same shape as the PostHog client in analytics-server.ts
// and the Prisma singleton: instantiated once per warm lambda, reused across
// requests. Unlike PostHog (which silently no-ops when unconfigured), the
// payment paths MUST fail loud when STRIPE_SECRET_KEY is missing — a silent
// no-op on a checkout or webhook route would hide a misconfigured deploy — so
// getStripe() throws. Callers on request paths translate that into a 500 the
// same way the Clerk webhook does for a missing signing secret.
//
// nodejs runtime only (the Stripe SDK uses Node crypto for webhook signature
// verification); any route importing this must `export const runtime = "nodejs"`.

import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

/** The configured Stripe client, or throw if STRIPE_SECRET_KEY is unset.
 *  apiVersion is intentionally omitted so the SDK's own pinned default is
 *  used — avoids coupling our code to a version string the installed SDK
 *  doesn't recognise (a type error) and lets `stripe` upgrades carry the
 *  version bump. */
export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  client = new Stripe(key);
  return client;
}

/** Whether Stripe is configured. Lets non-critical surfaces (e.g. a pricing
 *  page rendered before keys are provisioned) degrade gracefully instead of
 *  throwing. Payment routes should still call getStripe() and fail loud. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
