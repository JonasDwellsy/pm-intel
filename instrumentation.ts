// v0.17 — Next.js's standard server-runtime instrumentation hook.
// Imports the Sentry config matching the active runtime (Node or
// Edge). The client-side config (sentry.client.config.ts) loads via
// withSentryConfig() automatically — only the server/edge variants
// need this register() bridge.

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
