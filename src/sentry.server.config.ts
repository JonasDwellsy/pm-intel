// v0.17 — Sentry server-side config. Runs in the Node.js runtime
// for API routes and server components. Loaded by Next.js's
// `instrumentation.ts` register() hook (see ./instrumentation.ts).

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

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
  });
}
