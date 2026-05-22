// v0.17 — Sentry client-side config. Loaded automatically by
// withSentryConfig() in next.config.ts on every browser request.
//
// Design notes:
//   - We use NEXT_PUBLIC_SENTRY_DSN so the same DSN is visible to
//     the browser; Sentry's DSN is designed to be public.
//   - Replay is DISABLED on Sentry — PostHog owns session replay
//     (per the v0.17 architecture decision: one replay product,
//     one bill). Errors are still tagged with the user's Clerk
//     userId via setUser({ id }) so we can correlate without
//     storing email/name.
//   - `tracesSampleRate: 0.1` keeps performance traces affordable
//     at expected pre-launch traffic (~hundreds of sessions/week).
//     Bump if performance regressions need finer signal.

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.1,

    // Replay OFF — PostHog handles it. Setting these to 0 explicitly
    // (rather than omitting) makes the intent obvious in code review.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Don't auto-instrument fetches to PostHog / Clerk's third-party
    // endpoints; we don't care about their internal timings, and the
    // breadcrumbs add noise.
    tracePropagationTargets: ["localhost", /^\/(?!api\/(posthog|clerk)).*$/],

    // PII guard: Sentry's defaults already redact request headers
    // like Authorization, but explicitly disabling sendDefaultPii
    // belt-and-suspenders against IP/user-agent capture in error
    // reports. Users are tagged by Clerk userId only (see the
    // server-side instrumentation file for the setUser call).
    sendDefaultPii: false,
    // v0.17.1 — Tag events with VERCEL_ENV so Sentry's environment
    // filter surfaces them. NEXT_PUBLIC_VERCEL_ENV is inlined into
    // the client bundle by Next.js when set on the deploy (Vercel
    // exposes VERCEL_ENV server-side but the client mirror is named
    // NEXT_PUBLIC_VERCEL_ENV when explicitly added). Fallback chain
    // covers both shapes plus NODE_ENV for local dev.
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV ??
      "development",
  });
}
