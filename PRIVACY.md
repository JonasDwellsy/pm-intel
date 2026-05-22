# Privacy — Observability stack

This document describes what Dwellsy IQ captures via its observability
tools (PostHog, Sentry, Vercel Analytics) and — equally important —
what it does **not** capture.

Last updated: v0.17 / 2026-05-22.

## What we capture

### PostHog — product analytics + session replay

| Event | Properties captured |
|---|---|
| `signup_completed` | (none beyond Clerk userId) |
| `login_completed` | (none beyond Clerk userId) — suppressed for the auto-login session immediately following signup, so funnels see signup_completed → next-real-login, not signup → login back-to-back |
| `scorecard_viewed` | operator_slug, operator_msa, operator_classification |
| `watch_list_viewed` | watch_list_id, operator_count |
| `watch_list_created` | watch_list_id, initial_operator_count |
| `operator_added_to_watch_list` | operator_slug, watch_list_id |
| `methodology_page_viewed` | (none) |
| `askai_query_submitted` | query_length_chars, turn_index |
| `markets_page_viewed` | market_slug |
| `state_page_viewed` | state (2-letter code) |
| `search_performed` | query_length_chars, result_tier, had_strict_results, entry_point |

All events also carry a small set of global properties (see
`enrich()` in `src/lib/analytics.ts`):

- `auth`: `"authenticated"` when a Clerk session is detected, else
  `"anonymous"`. Mirrored under the legacy `userType` key for back-
  compat with v0.8-era dashboards.
- `referringPage`: `document.referrer` value at fire time, or `null`
  for server-emitted events.

The PostHog `distinct_id` is set to the Clerk userId (an opaque
handle like `user_2ABC...`) when the visitor is signed in. Anonymous
visitors keep PostHog's auto-generated cookie ID.

### PostHog session replay

Enabled with PII masking:

- `maskAllInputs: true` — every `<input>` and `<textarea>` value is
  masked.
- `maskTextSelector: "[data-private]"` — any element the product
  marks `data-private` (e.g. rent readouts on a scorecard, financial
  numbers) is masked.
- `recordCrossOriginIframes: false` — Clerk's hosted sign-in iframe
  is never recorded.
- Password fields are masked by PostHog's default behavior.

### Sentry — error reporting + performance traces

- Server + client errors land in Sentry's Issues feed with the
  request URL, stack trace, and (when available) the Clerk userId
  set on the Sentry scope.
- `tracesSampleRate: 0.1` — 10% of requests carry full performance
  spans.
- `sendDefaultPii: false` — Sentry's built-in PII auto-capture (IP,
  user-agent details, cookie contents) is disabled.
- **Sentry session replay is OFF** — PostHog owns replay.

### Vercel Analytics + Speed Insights

- Vercel Analytics captures page-view paths + referrer host + UTM
  params if present. No event-level properties from the app.
- Speed Insights captures TTFB, LCP, CLS, INP, FCP per page load.
- Both attribute by Vercel's anonymous `vid` cookie. We don't pass
  any user identity into them.

## What we never capture

**Identity / PII guardrails**:

- Clerk email addresses, full names, phone numbers, profile photos —
  none of these are ever attached to PostHog events or Sentry user
  scope. Identification is by Clerk userId only.
- IP addresses are not retained beyond Vercel's edge log default
  retention.

**Content guardrails**:

- Raw AskAI query text. Only `query_length_chars` is captured.
- Raw search query text. Only `query_length_chars` is captured.
- Rent values, scorecard underlying numbers (DOM, star tiers,
  portfolio estimates, cohort-relative percentiles), operator
  financial details, claim-form free-text answers, watch-list
  criterion values. None of these appear in event properties.

**Session-replay guardrails**:

- Every form input is masked.
- Every element marked `data-private` is masked.
- Cross-origin iframes (Clerk hosted UI) are not recorded.

## Configuration

All telemetry is keyed off env vars. If a key is absent, the
corresponding integration silently no-ops:

| Env var | Required for | Public/Secret |
|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog events + replay | Public (project key) |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog routing | Public |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry client errors | Public (DSN by design) |
| `SENTRY_DSN` | Sentry server errors (falls back to NEXT_PUBLIC) | Secret-equivalent |
| `SENTRY_AUTH_TOKEN` | Source-map upload at build time | Secret |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Source-map upload target | Public-ish |
| `CLERK_WEBHOOK_SECRET` | signup_completed / login_completed events | Secret |

Vercel Analytics + Speed Insights need no env vars — they detect
the Vercel deploy environment automatically.

## Smoke tests

- `GET /api/sentry-test` — throws an error server-side and captures
  it via Sentry. Use once after wiring to confirm DSN + instrumentation.
- The Clerk webhook is verified via svix signature on every payload;
  unsigned POSTs to `/api/clerk/webhook` return 401.

## Changes to this document

Material changes to what we capture should be reflected here in the
same PR. The v0.17 PR introduced this file; subsequent PRs that add
events or fields should update the table above.
