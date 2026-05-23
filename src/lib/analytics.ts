// Conversion-event helpers. Single source of truth for event names and the
// global properties attached to every capture call.
//
// History:
//   - PR #45 (v0.8) introduced the PostHog wiring with anonymous-only
//     identity (no Clerk yet) and the original 18-event taxonomy.
//   - PR #59 (v0.17, observability stack) keeps every existing event in
//     the registry — dashboards/funnels built against names like
//     `market_page_view` still receive data — and EXTENDS the taxonomy
//     with the 10 spec-mandated events listed under "v0.17 additions"
//     below. It also turns on session replay (with PII masking),
//     replaces the hardcoded `userType: "anonymous"` with a Clerk-
//     derived `auth` ∈ ("authenticated" | "anonymous") property, and
//     wires posthog.identify() so events carry the Clerk userId as
//     distinct_id when signed in.
//
// Privacy guardrails (see PRIVACY.md at repo root):
//   - No Clerk email / name / phone is ever attached to events.
//     Identification is by Clerk userId (an opaque "user_…" handle) only.
//   - No raw query text from AskAI or search — length-in-characters only.
//   - No rent values, scorecard underlying numbers, or operator metadata
//     beyond the slug.
//   - Session replay masks all <input>, [data-private], and password
//     fields — see PostHog init below.

import posthog from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export const ANALYTICS_ENABLED = Boolean(KEY);

let initialized = false;

export function initAnalytics(): void {
  if (typeof window === "undefined") return;
  if (!KEY || initialized) return;
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: false, // we fire view events explicitly with extra props

    // v0.17 — Session replay ON. PostHog owns replay; Sentry replay
    // stays OFF (one source of truth, one bill). PII masking is
    // belt-and-suspenders:
    //   - mask_all_inputs masks every <input>/<textarea> value.
    //   - maskTextSelector targets anything the product explicitly
    //     marks with [data-private] (e.g. operator rent/financial
    //     readouts inside the scorecard) so the replay shows the
    //     element's geometry but not its text.
    //   - record_cross_origin_iframes off — Clerk's hosted iframes
    //     would otherwise occasionally pull their internal DOM into
    //     the recording, and we have no business storing that.
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-private]",
      recordCrossOriginIframes: false,
    },

    persistence: "localStorage+cookie",
  });
  initialized = true;
}

/** v0.17 — bind a Clerk userId to the current PostHog distinct_id.
 *  Idempotent: PostHog stitches anonymous events to the identified
 *  user once this fires, so we can safely call it on every render
 *  of the ClerkIdentify component. PII guard: we deliberately pass
 *  NO email / name / phone in the people-properties argument; the
 *  userId is the only handle we ever surface to PostHog. */
export function identifyAnalyticsUser(userId: string): void {
  if (typeof window === "undefined" || !initialized) return;
  posthog.identify(userId);
}

/** v0.17 — drop the Clerk identity when the user signs out. Sets
 *  PostHog back to its anonymous-cookie distinct_id so the next
 *  visitor on the same browser doesn't inherit the previous user's
 *  identity. Idempotent. */
export function resetAnalyticsUser(): void {
  if (typeof window === "undefined" || !initialized) return;
  posthog.reset();
}

/** v0.18 (PR #70, Phase 2 multi-tenancy) — bind an Organization to
 *  the current PostHog session as a "group." Unlocks group-level
 *  analytics (watch lists per org, retention per org, funnels filtered
 *  by org, etc.) without requiring a schema rework later. The group
 *  key 'organization' must be set up on the PostHog side under
 *  Project settings → Group analytics → enable a group type named
 *  "organization" (one-time setup; the SDK call fires regardless and
 *  PostHog ignores it if the group type isn't enabled).
 *
 *  PII guard mirrors identifyAnalyticsUser(): we deliberately pass
 *  only the opaque Clerk-mirror org id and the org name (which is
 *  user-supplied at signup, typically "{firstName}'s Workspace" — a
 *  weak PII vector, but no stronger than what's already in the
 *  Clerk dashboard). If you ever want to tighten this further,
 *  switch to passing just the id and dropping the name from
 *  properties. */
export function identifyAnalyticsOrg(orgId: string, orgName: string): void {
  if (typeof window === "undefined" || !initialized) return;
  posthog.group("organization", orgId, { name: orgName });
}

/** v0.18 — drop the Organization group binding when the user signs
 *  out OR when they sign in to a different account on the same
 *  browser. Without this, a fresh anonymous session would inherit
 *  the previous user's group attribution. Idempotent. */
export function resetAnalyticsOrg(): void {
  if (typeof window === "undefined" || !initialized) return;
  posthog.resetGroups();
}

export type EventName =
  // Original v0.8 taxonomy — kept verbatim so PR #45-era dashboards
  // continue receiving data. v0.17 extends rather than replaces.
  | "market_page_view"
  | "quadrant_filter_click"
  | "pm_card_click"
  // PR #47 retired the scorecard paywall. The preview-view +
  // paywall events stay in the registry as a historical record
  // (and to keep older client builds that might still be cached
  // posting recognisable events), but no current code path emits
  // them. The new "scorecard_cta_click" event powers the watch-list
  // CTA that replaced the paywall card.
  | "scorecard_preview_view"
  | "paywall_view"
  | "paywall_cta_click"
  | "scorecard_full_view"
  | "scorecard_cta_click"
  | "watch_list_export_click"
  | "pdf_export_click"
  | "lead_form_view"
  | "lead_form_submit_success"
  | "lead_form_submit_error"
  | "match_card_click"
  | "claim_landing_view"
  | "claim_form_submit_success"
  | "operator_profile_view"
  // v0.17 additions — observability stack spec. Naming convention
  // for new events is past-tense verb (`_completed`, `_viewed`,
  // `_submitted`) so they read as facts in funnels.
  | "signup_completed"
  | "login_completed"
  | "scorecard_viewed"
  | "watch_list_viewed"
  | "watch_list_created"
  | "operator_added_to_watch_list"
  | "methodology_page_viewed"
  | "askai_query_submitted"
  | "markets_page_viewed"
  | "state_page_viewed"
  | "search_performed";

export type EventProps = {
  marketId?: string;
  pmSlug?: string;
  segment?: string;
  rank?: number | null;
  errorReason?: string;
} & Record<string, unknown>;

function enrich(props: EventProps): Record<string, unknown> {
  const referringPage =
    typeof document !== "undefined" ? document.referrer || null : null;
  // v0.17 — replaced the hardcoded `userType: "anonymous"`. The
  // ClerkIdentify client component calls identifyAnalyticsUser() the
  // moment a Clerk session is detected; PostHog's own `posthog.get_distinct_id()`
  // reports back the identified id, so we derive the auth state from
  // whether that id starts with "user_" (Clerk's userId convention).
  // Fallback when posthog isn't initialized: anonymous.
  let auth: "authenticated" | "anonymous" = "anonymous";
  if (initialized && typeof window !== "undefined") {
    try {
      const distinctId = posthog.get_distinct_id?.();
      if (typeof distinctId === "string" && distinctId.startsWith("user_")) {
        auth = "authenticated";
      }
    } catch {
      // posthog.get_distinct_id is safe to call but we belt-and-suspender
      // the type cast above. Fall through to anonymous on any throw.
    }
  }
  return {
    ...props,
    // userType retained for back-compat with v0.8-era dashboards that
    // filter on it. Mirrors the new `auth` field so we can transition
    // dashboards over a deploy.
    userType: auth,
    auth,
    referringPage,
  };
}

export function capture(event: EventName, properties: EventProps = {}): void {
  const payload = enrich(properties);
  if (initialized) {
    posthog.capture(event, payload);
  } else if (typeof window !== "undefined") {
    // Console output mirrors what would have been sent to PostHog.
    console.log(`[analytics] ${event}`, payload);
  }
}
