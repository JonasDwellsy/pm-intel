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
  });
}
