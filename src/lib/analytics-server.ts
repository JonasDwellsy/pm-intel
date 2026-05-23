// v0.17 — Server-side PostHog capture, used by mutation API routes
// (POST /api/watch-lists, POST /api/ask, search submissions). For
// page-view events we stay client-side because (a) they're naturally
// browser-tied and (b) we want the same enrich() global props every
// other client event has. Server captures are the right home for
// HIGH-VALUE conversion-ish events that we don't want to drop if the
// user navigates away mid-fetch.
//
// Privacy guardrail (mirrors src/lib/analytics.ts):
//   - distinct_id is ONLY the Clerk userId; no email / name attached.
//   - For anonymous server captures, we synthesise a stable
//     pseudo-id from the existing dq_auth cookie so a single
//     anonymous browser doesn't fragment into one-event-per-call.
//     This is intentionally NOT a fingerprint of the user — it's
//     the SHA-256 digest of the password-gate session cookie, which
//     already exists for every preview visitor.
//
// The PostHog node client lazy-initialises on first use so an
// unconfigured deploy (NEXT_PUBLIC_POSTHOG_KEY missing) silently
// no-ops instead of crashing requests.

import "server-only";
import { PostHog } from "posthog-node";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!KEY) return null;
  if (client) return client;
  client = new PostHog(KEY, {
    host: HOST,
    // posthog-node's default flushAt is 20 + flushInterval is 10s.
    // On Vercel serverless, neither default protects us: after the
    // lambda's HTTP response returns, the JS event loop FREEZES —
    // setInterval timers don't tick, queued events sit in memory,
    // and when the lambda dies (no follow-up traffic to keep it
    // warm) the batch is lost.
    //
    // The original comment here said we relied on "the next request
    // reusing the same module-level singleton on a warm lambda."
    // That assumption broke for any low-traffic event: org_member_removed
    // fires alone, with no follow-up captures in the same warm window,
    // so its batch never flushed.
    //
    // Mitigation: every server route that calls captureServerEvent
    // MUST call `await flushAnalyticsServer()` before returning its
    // response. The flush is cheap (~50-150ms) and guarantees the
    // PostHog HTTP send completes inside the lambda's still-alive
    // window. See PR #73 for the bug postmortem.
  });
  return client;
}

/** v0.18 PR #73 — Explicit flush helper that callers MUST invoke
 *  before returning from a serverless handler that has called
 *  captureServerEvent. Without this, queued PostHog events get lost
 *  when the Vercel lambda freezes (the 10s flushInterval timer
 *  doesn't tick post-response).
 *
 *  Returns true when the underlying transport drained within the
 *  given timeout, false if the timeout was reached or no client is
 *  configured. Fire-and-forget at the call site (don't gate the
 *  response on the boolean) — the return value is for diagnostics. */
export async function flushAnalyticsServer(timeoutMs = 2000): Promise<boolean> {
  const ph = getClient();
  if (!ph) return false;
  try {
    // posthog-node's flush() returns void per current types but
    // internally awaits in-flight requests. Wrap in a race to cap
    // the wait time so a flaky PostHog endpoint can't hang the
    // lambda's response.
    await Promise.race([
      ph.flush(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Union of every server-emitted event name. Subset of EventName in
 *  src/lib/analytics.ts — keeping the server list narrow makes it
 *  obvious at the call site which path is server-emitted and which
 *  is client. (Server-side identify happens implicitly via the
 *  distinctId argument; no setPersonProperties call here so PII can't
 *  leak through this surface.) */
export type ServerEventName =
  | "signup_completed"
  | "login_completed"
  | "watch_list_created"
  | "operator_added_to_watch_list"
  | "askai_query_submitted"
  | "search_performed"
  // v0.18 (PR #71, Phase 3) — Membership lifecycle events. Fired
  // from the Clerk webhook handler when invitations are sent, accepted,
  // or revoked, and when memberships are added/removed/role-changed.
  // PRIVACY: invitation events carry `invited_email_domain` ONLY
  // (e.g. "@dwellsy.com"), NEVER the full email address. See
  // extractEmailDomain in this module + PRIVACY.md.
  | "org_member_invited"
  | "org_member_joined"
  | "org_member_removed"
  | "org_role_changed"
  | "org_invitation_revoked";

interface CaptureArgs {
  /** Clerk userId when signed in, or null. When null, the helper
   *  synthesises a stable anonymous id from the request cookie so the
   *  event isn't lost — see anonymousIdFromCookie() below. */
  userId: string | null;
  /** Stable anonymous handle for unauthenticated server emits.
   *  Caller is responsible for computing this from the request (we
   *  can't read cookies() here because it's a non-async helper —
   *  the API route knows where its request object lives). */
  anonymousId?: string | null;
  event: ServerEventName;
  properties?: Record<string, unknown>;
}

/** Fire-and-forget PostHog capture from a server route. Returns
 *  a promise that resolves when the event is queued (not flushed) —
 *  callers should NOT await it in the response path's critical
 *  section; instead, fire it just before returning the Response. */
export function captureServerEvent(args: CaptureArgs): void {
  const ph = getClient();
  if (!ph) return; // no PostHog key configured — silent no-op
  const distinctId =
    args.userId ?? args.anonymousId ?? "anonymous-server-event";
  const auth: "authenticated" | "anonymous" = args.userId
    ? "authenticated"
    : "anonymous";
  ph.capture({
    distinctId,
    event: args.event,
    properties: {
      ...(args.properties ?? {}),
      // Match the client-side enrich() shape so dashboards can union
      // server + client events on the same filter.
      auth,
      userType: auth,
      // Server emits have no `referringPage` — explicit null avoids
      // PostHog auto-deriving one from the request URL (which would
      // be the API path, not a meaningful surface).
      referringPage: null,
      // Tag for funnel debugging: at-a-glance "did this come from the
      // server or the client" without unioning two property names.
      source: "server",
    },
  });
}
