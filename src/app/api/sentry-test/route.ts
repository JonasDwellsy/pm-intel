// v0.17 — Smoke-test endpoint for Sentry server-side wiring.
//
// GET /api/sentry-test throws an Error on purpose. With
// instrumentation.ts wired up and SENTRY_DSN set, the error reaches
// Sentry's Issues feed within ~10 seconds. Use this once after the
// initial Sentry setup to confirm the DSN, source-map upload, and
// instrumentation hook all work together.
//
// Safe to ship in production: it's not linked from anywhere in the
// app and the password-gate bypass is explicit (see middleware.ts).
// In Production you can hit it from the Vercel-deployed URL to
// validate the live wiring after env vars are set.

import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";

export async function GET() {
  try {
    throw new Error(
      "Sentry smoke test (server route) — if you see this in Sentry, the wiring is good."
    );
  } catch (err) {
    Sentry.captureException(err);
    // Flush before responding so Lambda doesn't terminate the
    // process while Sentry's transport is still in-flight. 2 seconds
    // is the recommended ceiling.
    await Sentry.flush(2000);
    return Response.json(
      {
        ok: true,
        message:
          "Threw + captured a test error. Check Sentry → Issues; should appear within ~10 seconds.",
      },
      { status: 200 }
    );
  }
}
