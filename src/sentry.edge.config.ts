// v0.17 — Sentry edge-runtime config. Runs in middleware and any
// route handlers explicitly opted into the edge runtime. Currently
// middleware.ts uses the default (Node) runtime, but the file is
// required by withSentryConfig — leaving it empty would crash
// Next.js's bundle analysis. Loaded by ./instrumentation.ts.

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // v0.17.1 — see sentry.server.config.ts for rationale.
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // v0.6.4 Patch 6 — mirror the noise filter from the server config.
    // See that file for the rationale on why these are dropped.
    ignoreErrors: [
      /Clerk:.*auth\(\) was called but Clerk can't detect usage of clerkMiddleware\(\)/,
    ],
  });
}
