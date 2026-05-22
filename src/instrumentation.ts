// v0.17 — Next.js's standard server-runtime instrumentation hook.
// Imports the Sentry config matching the active runtime (Node or
// Edge). The client-side config (sentry.client.config.ts) loads via
// withSentryConfig() automatically — only the server/edge variants
// need this register() bridge.
//
// LOCATION MATTERS: This file MUST live at src/instrumentation.ts
// (NOT at repo-root instrumentation.ts) when the project uses a
// src/ directory. Next.js looks under src/ when src/ exists and
// silently ignores a root-level file in that case — the symptom is
// Sentry.init() never firing, Sentry.getClient() returning
// undefined, and captureException() being a no-op. Per
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation.
//
// Companion files (./sentry.server.config.ts, ./sentry.edge.config.ts)
// sit alongside this one for the same reason — keeping the relative
// imports stable and the wiring discoverable.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Re-export Sentry's request-error hook so unhandled errors in
// server components and route handlers reach Sentry. Pulled in
// automatically by Next.js when this file exposes the symbol.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
