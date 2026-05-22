// v0.17 — Clerk webhook receiver.
//
// Purpose: bridge Clerk auth events → PostHog conversion funnel.
//
//   - user.created     → signup_completed (fires exactly once per
//                        real signup)
//   - session.created  → login_completed (fires on every sign-in,
//                        with the post-signup auto-sign-in
//                        deduplicated — see "First-sign-in dedup"
//                        below)
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
// existing isPasswordGateBypass logic — see src/middleware.ts.
// Clerk's servers need to reach this endpoint without a session
// cookie; svix signature verification is what authenticates inbound
// payloads instead.
//
// === First-sign-in dedup ===
//
// Clerk fires BOTH user.created and session.created on a fresh
// signup — first the user is created, then the auth flow
// auto-creates their first session. Without dedup, a new user would
// fire signup_completed + login_completed back-to-back, polluting
// every "logins per user" funnel.
//
// We dedup by comparing the session's created_at against the user's
// created_at (fetched from Clerk's backend API). If they're within
// SIGNUP_DEDUP_WINDOW_MS (30s), the session.created is the
// post-signup auto-login → skip login_completed. Returning-user
// sign-ins are minutes/hours/days after the user record's creation,
// so they fire normally.
//
// Failure mode: if the Clerk API call fails (timeout, rate limit,
// auth issue), we fall through and fire login_completed anyway.
// Better to over-count returning users than to silently drop the
// signal — a missed login_completed is an invisible bug; a duplicate
// one is debuggable in PostHog.

import { Webhook } from "svix";
import { clerkClient } from "@clerk/nextjs/server";
import { captureServerEvent } from "@/lib/analytics-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Treat a session created within this many ms of the user's
 *  createdAt as the post-signup auto-login (so login_completed
 *  suppresses, signup_completed alone fires). 30s is generous —
 *  Clerk normally delivers the auto-login session within a few
 *  hundred ms of the user record. */
const SIGNUP_DEDUP_WINDOW_MS = 30_000;

interface ClerkWebhookEvent {
  type: string;
  data: {
    /** user.created → the Clerk user id. */
    id?: string;
    /** session.created → the user this session belongs to. */
    user_id?: string;
    /** session.created → ms since epoch (Clerk's webhook payload
     *  convention for timestamp fields). */
    created_at?: number;
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
    const userId = event.data.user_id;
    const sessionCreatedAt = event.data.created_at;
    if (userId) {
      const isPostSignupAutoLogin = await isWithinSignupWindow({
        userId,
        sessionCreatedAt,
      });
      if (!isPostSignupAutoLogin) {
        captureServerEvent({
          userId,
          event: "login_completed",
        });
      }
    }
  }

  return Response.json({ received: true });
}

/** Returns true when the session was created within
 *  SIGNUP_DEDUP_WINDOW_MS of the user record itself — i.e. this is
 *  Clerk's automatic sign-in immediately after signup, not a real
 *  returning-user login.
 *
 *  Defensive: any failure path (missing timestamp, Clerk API
 *  throws, user not found) returns false so login_completed STILL
 *  fires. Over-counting returning users is a visible-and-debuggable
 *  failure mode; silently swallowing the signal is invisible. */
async function isWithinSignupWindow(args: {
  userId: string;
  sessionCreatedAt: number | undefined;
}): Promise<boolean> {
  if (typeof args.sessionCreatedAt !== "number") return false;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(args.userId);
    // Clerk's User.createdAt is a number (ms since epoch) in the
    // backend SDK. Compare absolute delta against the window —
    // abs() guards against clock skew between Clerk's user-creation
    // service and its session-creation service (in practice the
    // session is always created AFTER the user, but the math is
    // symmetric so we don't need to assume direction).
    const delta = Math.abs(args.sessionCreatedAt - user.createdAt);
    return delta < SIGNUP_DEDUP_WINDOW_MS;
  } catch (err) {
    console.error(
      "[clerk/webhook] dedup user-fetch failed, firing login_completed defensively",
      err
    );
    return false;
  }
}
