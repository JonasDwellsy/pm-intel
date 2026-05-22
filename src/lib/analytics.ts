// Conversion-event helpers. Single source of truth for event names and the
// global properties attached to every capture call (spec section 9).

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
    persistence: "localStorage+cookie",
  });
  initialized = true;
}

export type EventName =
  | "market_page_view"
  | "quadrant_filter_click"
  | "pm_card_click"
  // PR #47 retired the scorecard paywall. The preview-view +
  // paywall events stay in the registry as a historical record
  // (and to keep older client builds that might still be cached
  // posting recognisable events), but no current code path emits
  // them. The new "scorecard_cta_click" event powers the buy-box
  // CTA that replaced the paywall card.
  | "scorecard_preview_view"
  | "paywall_view"
  | "paywall_cta_click"
  | "scorecard_full_view"
  | "scorecard_cta_click"
  | "buy_box_export_click"
  | "pdf_export_click"
  | "lead_form_view"
  | "lead_form_submit_success"
  | "lead_form_submit_error"
  | "match_card_click"
  | "claim_landing_view"
  | "claim_form_submit_success"
  | "operator_profile_view";

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
  // No real auth yet (Journey 3). Treat everyone as anonymous.
  return {
    ...props,
    userType: "anonymous" as const,
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
