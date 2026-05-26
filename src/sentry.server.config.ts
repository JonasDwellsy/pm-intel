// v0.17 — Sentry server-side config. Runs in the Node.js runtime
// for API routes and server components. Loaded by Next.js's
// `instrumentation.ts` register() hook (see ./instrumentation.ts).

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

// v0.6.4 Patch 6 — known-noise filter. Errors that match these
// patterns are dropped at the SDK before they reach Sentry's
// inbox. Keep this list TIGHT — each entry needs a documented
// reason for being safe to suppress, and a periodic re-review so
// we don't accidentally swallow a regression once the underlying
// cause is fixed.
//
//   "Clerk: auth() was called but Clerk can't detect" — Clerk's
//   middleware runs on user-facing routes but Next.js's internal
//   /_not-found route bypasses middleware in some Node-runtime
//   contexts. The shared layout's SiteHeader calls auth(), which
//   then throws. The error has no actionable signal (user already
//   sees the 404 page) and fires per 404 hit. Suppress at SDK.
const IGNORE_ERROR_PATTERNS: Array<string | RegExp> = [
  /Clerk:.*auth\(\) was called but Clerk can't detect usage of clerkMiddleware\(\)/,
];

// v0.6.4 Patch 6 — defensive PII scrub. sendDefaultPii is already
// false, which strips the most common PII (IP, user-agent in
// some contexts, request headers). beforeSend is the belt-and-
// suspenders layer that runs on every event after the SDK has
// composed it but before it ships — anything we add here is the
// last line of defense for fields the SDK happens to populate.
//
// Today this only redacts known query-param shapes that could
// carry user identifiers (e.g. ?email=, ?token=). The redaction
// regex stays narrow — we'd rather miss a hypothetical leak than
// over-redact and lose a useful stack-trace context. Extend the
// list as PII-bearing params come into scope.
const PII_QUERY_PARAMS = new Set(["email", "token", "phone", "ssn"]);

function scrubUrl(url: string | undefined): string | undefined {
  if (!url || !url.includes("?")) return url;
  try {
    const parsed = new URL(url, "https://placeholder.local");
    let touched = false;
    for (const key of [...parsed.searchParams.keys()]) {
      if (PII_QUERY_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, "[redacted]");
        touched = true;
      }
    }
    return touched ? parsed.toString().replace("https://placeholder.local", "") : url;
  } catch {
    return url;
  }
}

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.1,
    // No PII in default scope — see sentry.client.config.ts rationale.
    sendDefaultPii: false,
    // v0.17.1 — Tag events with VERCEL_ENV ("production" | "preview" |
    // "development") so Sentry's environment filter shows them.
    // Without this the events land untagged and the default "production"
    // filter in the Sentry UI hides them — looks like the SDK is broken
    // when it's actually working fine. Fallback to NODE_ENV for local
    // dev (where VERCEL_ENV is undefined).
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    ignoreErrors: IGNORE_ERROR_PATTERNS,
    beforeSend(event) {
      // Defensive URL scrub for any query params that might carry
      // PII. Most events don't carry request URLs at all; this is
      // the safety net for the ones that do.
      if (event.request?.url) {
        event.request.url = scrubUrl(event.request.url);
      }
      return event;
    },
  });
}
