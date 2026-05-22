// v0.17 — Clerk webhook receiver.
//
// Purpose: convert Clerk's user.created event into a PostHog
// signup_completed event. Webhook is the right home for this
// (vs a client-side useEffect hack that checks user.createdAt
// vs lastSignInAt) because Clerk only fires user.created once
// per real signup — no risk of false positives on subsequent
// sign-ins, no race against the OAuth redirect.
//
// We also emit login_completed on the session.created event so
// returning-user sign-ins land in the same funnel.
//
// Setup checklist (one-time, after merge):
//   1. Clerk dashboard → Configure → Webhooks → Add endpoint
//   2. URL: https://<deploy>/api/clerk/webhook
//   3. Subscribe to events: user.created, session.created
//   4. Copy the signing secret into Vercel env as CLERK_WEBHOOK_SECRET
//
// Security: svix.verify() enforces the signing-secret HMAC on every
// inbound payload. Without a valid signature we reject 401 — a
// random POST to /api/clerk/webhook from the open internet can't
// inject fake signup events into PostHog.
//
// Privacy: distinct_id is the Clerk userId. No email or name from
// the webhook payload is ever passed to PostHog (mirrors the
// privacy guardrail in src/lib/analytics.ts).
//
// The middleware password gate is excluded for this path via the
// existing isPasswordGateBypass logic — see src/middleware.ts. We
// also need to add /api/clerk/webhook to the bypass so Clerk's
// IP can reach the endpoint without a session cookie.

import { Webhook } from "svix";
import { captureServerEvent } from "@/lib/analytics-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClerkWebhookEvent {
  type: string;
  data: {
    id?: string;
    user_id?: string;
  };
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    // Misconfigured deploy — fail loud so Clerk's webhook dashboard
    // shows a 500 and we can fix it. Returning 200 here would
    // silently drop signup events.
    console.error("[clerk/webhook] CLERK_WEBHOOK_SECRET env var missing");
    return Response.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  // Read svix headers + raw body. svix.verify() needs the raw text
  // (not the parsed JSON) because the signature is computed over
  // the exact bytes Clerk sent.
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();
  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error("[clerk/webhook] svix verify failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Dispatch on Clerk event type. We map only the two we need —
  // anything else returns 200 OK so Clerk doesn't retry, but we
  // don't capture an event.
  if (event.type === "user.created") {
    const userId = event.data.id;
    if (userId) {
      captureServerEvent({
        userId,
        event: "signup_completed",
        // No properties beyond the implicit distinct_id + auth tag.
        // Spec is explicit: signup_completed has no event-specific
        // props.
      });
    }
  } else if (event.type === "session.created") {
    // session.created fires on EVERY sign-in (signup-then-login OR
    // returning user). To avoid double-counting signups, the
    // login_completed event only fires when this is NOT immediately
    // following a user.created — Clerk doesn't tell us that
    // directly, but the timestamps on user.created vs session.created
    // are typically a few ms apart for fresh signups. A simpler
    // approximation: we emit login_completed unconditionally and
    // rely on funnel analytics to dedupe per-user (PostHog's
    // distinct_id groups the events). The slight redundancy is
    // acceptable for v0.17; can refine later.
    const userId = event.data.user_id;
    if (userId) {
      captureServerEvent({
        userId,
        event: "login_completed",
      });
    }
  }

  return Response.json({ received: true });
}
