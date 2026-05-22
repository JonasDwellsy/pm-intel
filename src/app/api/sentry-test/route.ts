// v0.17 — Smoke-test endpoint for Sentry server-side wiring.
//
// GET /api/sentry-test throws an Error on purpose AND reports
// diagnostic state so a missing-DSN or missing-init scenario is
// obvious without having to dig through Vercel logs.
//
// Response shape:
//   {
//     diagnosis: "ok" | "no_dsn" | "init_skipped" | ...,
//     env: { hasServerDsn, hasPublicDsn, sentryOrg, sentryProject },
//     initialized: boolean,            // did Sentry.init() actually run?
//     captured: boolean,               // did we successfully enqueue an event?
//     eventId: string | undefined,     // Sentry's event UUID if captured
//     flushed: boolean,                // did Sentry.flush() resolve true?
//     hint: string,                    // human-readable next step
//   }
//
// With this shape you can call the endpoint and read the JSON to
// know exactly what to fix — usually it's "set NEXT_PUBLIC_SENTRY_DSN
// + SENTRY_DSN in Vercel env vars for the Preview environment, then
// redeploy."
//
// Safe to ship in production: it's not linked from anywhere, the
// password-gate bypass is explicit (see middleware.ts), and the
// throw → captureException is by design.

import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const env = {
    hasServerDsn: Boolean(process.env.SENTRY_DSN),
    hasPublicDsn: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    sentryOrg: process.env.SENTRY_ORG ?? null,
    sentryProject: process.env.SENTRY_PROJECT ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  };

  // `Sentry.getClient()` returns undefined when init() hasn't run on
  // this runtime. The most common cause is no DSN set, which makes
  // sentry.server.config.ts's `if (DSN) Sentry.init(...)` a no-op.
  const client = Sentry.getClient();
  const initialized = client !== undefined;

  if (!initialized) {
    const noDsn = !env.hasServerDsn && !env.hasPublicDsn;
    return Response.json(
      {
        diagnosis: noDsn ? "no_dsn" : "init_skipped",
        env,
        initialized: false,
        captured: false,
        flushed: false,
        hint: noDsn
          ? "Neither SENTRY_DSN nor NEXT_PUBLIC_SENTRY_DSN is set in this deploy's env. Add both in Vercel → Project Settings → Environment Variables (Preview + Production), then redeploy. The DSN comes from your Sentry project's settings page."
          : "A DSN env var is visible but Sentry.init() didn't run on the Node runtime. Check that instrumentation.ts exists at repo root and exports `register()`. Next.js 15+ auto-loads it; older versions need `experimental.instrumentationHook: true` in next.config.ts.",
      },
      { status: 200 }
    );
  }

  // Sentry IS initialized — throw and capture for real.
  let eventId: string | undefined;
  let captured = false;
  try {
    throw new Error(
      "Sentry smoke test — if you see this in Sentry Issues, the wiring is good."
    );
  } catch (err) {
    eventId = Sentry.captureException(err);
    captured = Boolean(eventId);
  }

  // Wait for the transport to actually flush. On Vercel's Node
  // runtime the lambda may freeze immediately after the response,
  // dropping in-flight events; an explicit flush avoids that. 2s
  // is the recommended ceiling.
  const flushed = await Sentry.flush(2000);

  return Response.json(
    {
      diagnosis: "ok",
      env,
      initialized: true,
      captured,
      eventId,
      flushed,
      hint: flushed
        ? `Captured event ${eventId}. Within ~10s it should appear in Sentry → Issues. If not, double-check the DSN points at the same project you're viewing.`
        : "Captured the event but Sentry.flush(2000) returned false. The transport may have timed out before sending. Try again — cold lambdas sometimes need a second hit.",
    },
    { status: 200 }
  );
}
